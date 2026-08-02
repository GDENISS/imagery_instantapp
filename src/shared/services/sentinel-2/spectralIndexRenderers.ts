/* Copyright 2025 Esri
 *
 * Licensed under the Apache License Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import { SpectralIndex } from '@typing/imagery-service';
import {
    ClientSideRasterFunction,
    RenderingRule,
} from '@shared/services/helpers/clientSideRasterFunctions';
import { getBandArithmeticParams4SpectralIndex } from './helpers';

/**
 * A single class of a colorized index renderer.
 *
 * A class covers the index values between the `upperBound` of the previous class (inclusive) and its own
 * `upperBound` (exclusive), and paints them with `color`.
 */
type IndexColorClass = {
    /**
     * Exclusive upper bound of the class. The last class should use `Infinity` so that every value
     * above the second to last break is still painted rather than dropped as NoData.
     */
    upperBound: number;
    /**
     * RGB color of the class.
     */
    color: [number, number, number];
};

/**
 * The `Remap` raster function turns values that fall outside of every input range into NoData. Index
 * values can legitimately sit slightly outside of the nominal -1 to 1 window (EVI in particular, because
 * its denominator can get small), so the outermost breaks are pushed out to these sentinels instead of
 * being clipped at -1 and 1.
 *
 * The same sentinel magnitude is already used by the mask/change detection raster functions in
 * `@shared/services/raster-analysis/rasterFunctions`.
 */
const UNBOUNDED_LOWER_LIMIT = -1000;
const UNBOUNDED_UPPER_LIMIT = 1000;

/**
 * Color classes shared by the vegetation oriented indices (EVI, SAVI, MSAVI2 and NDRE).
 *
 * Using one ramp across all of them is deliberate: it means the four renderers are directly comparable
 * to each other on the map, and it echoes the brown-to-green ramp of the existing NDVI renderer, where
 * near-white is water or bare ground, tan to khaki is sparse or dry vegetation, and dark green is dense
 * vigorous canopy.
 */
const VEGETATION_INDEX_COLOR_CLASSES: IndexColorClass[] = [
    { upperBound: -0.2, color: [235, 235, 235] },
    { upperBound: 0, color: [214, 199, 175] },
    { upperBound: 0.1, color: [201, 173, 127] },
    { upperBound: 0.2, color: [178, 152, 92] },
    { upperBound: 0.3, color: [148, 152, 71] },
    { upperBound: 0.4, color: [116, 148, 59] },
    { upperBound: 0.5, color: [85, 133, 48] },
    { upperBound: 0.6, color: [57, 115, 40] },
    { upperBound: 0.75, color: [33, 94, 33] },
    { upperBound: Infinity, color: [12, 69, 25] },
];

/**
 * Color classes for NDCI, which reads chlorophyll-a in water rather than vegetation on land.
 *
 * The ramp follows the convention used for chlorophyll-a products: deep blue for clear water, greens for
 * moderate concentrations, and yellow through red for the high concentrations that indicate algal blooms.
 */
const NDCI_COLOR_CLASSES: IndexColorClass[] = [
    { upperBound: -0.2, color: [8, 48, 107] },
    { upperBound: -0.1, color: [33, 95, 160] },
    { upperBound: 0, color: [66, 146, 198] },
    { upperBound: 0.05, color: [123, 190, 207] },
    { upperBound: 0.1, color: [173, 221, 178] },
    { upperBound: 0.15, color: [217, 240, 163] },
    { upperBound: 0.2, color: [254, 224, 139] },
    { upperBound: 0.3, color: [253, 174, 97] },
    { upperBound: 0.5, color: [244, 109, 67] },
    { upperBound: Infinity, color: [178, 24, 43] },
];

/**
 * Builds the `InputRanges` argument of the `Remap` raster function from the class breaks.
 *
 * `InputRanges` is a flat list of `[min, max)` pairs, so a class list of N entries becomes 2N numbers.
 */
const getRemapInputRanges = (colorClasses: IndexColorClass[]): number[] => {
    const inputRanges: number[] = [];

    let lowerBound = UNBOUNDED_LOWER_LIMIT;

    for (const { upperBound } of colorClasses) {
        const upperLimit = Number.isFinite(upperBound)
            ? upperBound
            : UNBOUNDED_UPPER_LIMIT;

        inputRanges.push(lowerBound, upperLimit);

        lowerBound = upperLimit;
    }

    return inputRanges;
};

/**
 * Builds a rendering rule that computes a spectral index and paints the result with a color ramp.
 *
 * The chain is `BandArithmetic` (compute the index as floating point) -> `Remap` (bin the index values
 * into integer classes) -> `Colormap` (assign an RGB color to each class). Binning before coloring keeps
 * the output deterministic, because it does not depend on raster statistics the way a stretch would.
 *
 * @param spectralIndex the index to compute
 * @param colorClasses the color classes to paint the index with
 * @returns a rendering rule, or null if the index has no Sentinel-2 band arithmetic definition
 *
 * @see https://developers.arcgis.com/rest/services-reference/enterprise/raster-function-objects/
 */
const createColorizedIndexRenderingRule = (
    spectralIndex: SpectralIndex,
    colorClasses: IndexColorClass[]
): RenderingRule => {
    const bandArithmeticParams =
        getBandArithmeticParams4SpectralIndex(spectralIndex);

    if (!bandArithmeticParams) {
        return null;
    }

    const { method, bandIndexes } = bandArithmeticParams;

    return {
        rasterFunction: 'Colormap',
        rasterFunctionArguments: {
            Raster: {
                rasterFunction: 'Remap',
                rasterFunctionArguments: {
                    Raster: {
                        rasterFunction: 'BandArithmetic',
                        rasterFunctionArguments: {
                            Method: method,
                            BandIndexes: bandIndexes,
                        },
                        outputPixelType: 'F32',
                    },
                    InputRanges: getRemapInputRanges(colorClasses),
                    OutputValues: colorClasses.map((d, index) => index + 1),
                    UseTable: false,
                    // any pixel that does not land in one of the input ranges becomes NoData
                    AllowUnmatched: false,
                },
                outputPixelType: 'U8',
            },
            Colormap: colorClasses.map(({ color }, index) => [
                index + 1,
                ...color,
            ]),
        },
        outputPixelType: 'U8',
    };
};

/**
 * Formats an RGB triplet as a hex color.
 *
 * Hex is used rather than `rgb(r,g,b)` because the thumbnail is consumed as a CSS background through an
 * unquoted `url(...)`. `encodeURIComponent` leaves parentheses untouched, so an `rgb(...)` fill inside
 * the encoded SVG would close the `url(` early and the background would silently fail to load.
 */
const rgb2Hex = ([r, g, b]: [number, number, number]): string =>
    `#${[r, g, b]
        .map((channel) => channel.toString(16).padStart(2, '0'))
        .join('')}`;

/**
 * Encodes an SVG document as a data URI so it can be used as an `img` source or a CSS background.
 */
const svg2DataUri = (svg: string): string =>
    `data:image/svg+xml,${encodeURIComponent(svg)}`;

/**
 * Renders the color classes as a strip of equal width bands, encoded as an SVG data URI.
 */
const createColorRampSvgDataUri = (
    colorClasses: IndexColorClass[],
    width: number,
    height: number
): string => {
    const bandWidth = width / colorClasses.length;

    const bands = colorClasses
        .map(({ color }, index) => {
            // overlap each band by a fraction of a pixel so antialiasing does not leave seams between them
            const x = index * bandWidth;
            const bandWidthWithOverlap =
                index === colorClasses.length - 1 ? bandWidth : bandWidth + 0.5;

            return `<rect x="${x}" y="0" width="${bandWidthWithOverlap}" height="${height}" fill="${rgb2Hex(color)}" />`;
        })
        .join('');

    return svg2DataUri(
        `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">${bands}</svg>`
    );
};

/**
 * Renders the color classes as a horizontal strip of equal width bands, sized to match the
 * pre-rendered legend images of the existing renderers, which is what the renderer tooltip expects.
 */
const createLegendImage = (colorClasses: IndexColorClass[]): string =>
    createColorRampSvgDataUri(colorClasses, 308, 20);

/**
 * Renders the color classes as a thumbnail for the renderer grid card.
 *
 * The other renderers use a screenshot of the rendering applied to a sample scene. There is no such
 * screenshot for these client side renderers, so the thumbnail shows the color ramp itself, which at
 * least tells the user which ramp they are about to apply. Swap in a real 96x48 image if one is produced.
 */
const createThumbnail = (colorClasses: IndexColorClass[]): string =>
    createColorRampSvgDataUri(colorClasses, 96, 48);

/**
 * Names of the Sentinel-2 renderers that are built on the client instead of being resolved to a raster
 * function template hosted by the image service.
 *
 * These deliberately do not use the `... for Visualization` suffix of the server side templates, so that
 * it is obvious both in code and in the URL hash which renderers the image service knows nothing about.
 */
export const SENTINEL2_CLIENT_SIDE_RASTER_FUNCTION_NAMES = [
    'EVI Colorized',
    'SAVI Colorized',
    'MSAVI2 Colorized',
    'NDRE Colorized',
    'NDCI Colorized',
] as const;

export type Sentinel2ClientSideRasterFunctionName =
    (typeof SENTINEL2_CLIENT_SIDE_RASTER_FUNCTION_NAMES)[number];

/**
 * Builds a client side raster function definition for a colorized spectral index renderer.
 */
const createClientSideRasterFunction = (
    name: Sentinel2ClientSideRasterFunctionName,
    spectralIndex: SpectralIndex,
    colorClasses: IndexColorClass[]
): ClientSideRasterFunction => ({
    name,
    renderingRule: createColorizedIndexRenderingRule(
        spectralIndex,
        colorClasses
    ),
    thumbnail: createThumbnail(colorClasses),
    legend: createLegendImage(colorClasses),
});

/**
 * The colorized spectral index renderers that this app computes on the client for Sentinel-2 scenes.
 *
 * The Sentinel-2 L2A image service only publishes raster function templates for NDVI, NDMI and MNDWI, so
 * these five indices are assembled as raster function chains that the service evaluates on the fly.
 */
export const SENTINEL2_CLIENT_SIDE_RASTER_FUNCTIONS: ClientSideRasterFunction[] =
    [
        createClientSideRasterFunction(
            'EVI Colorized',
            'evi',
            VEGETATION_INDEX_COLOR_CLASSES
        ),
        createClientSideRasterFunction(
            'SAVI Colorized',
            'savi',
            VEGETATION_INDEX_COLOR_CLASSES
        ),
        createClientSideRasterFunction(
            'MSAVI2 Colorized',
            'msavi',
            VEGETATION_INDEX_COLOR_CLASSES
        ),
        createClientSideRasterFunction(
            'NDRE Colorized',
            'ndre',
            VEGETATION_INDEX_COLOR_CLASSES
        ),
        createClientSideRasterFunction(
            'NDCI Colorized',
            'ndci',
            NDCI_COLOR_CLASSES
        ),
    ];
