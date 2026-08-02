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

import { ImageryScene } from '@shared/store/ImageryScene/reducer';
import { canBeConvertedToNumber } from '@shared/utils/snippets/canBeConvertedToNumber';
import { Sentinel2Scene, SpectralIndex } from '@typing/imagery-service';
import { t } from 'i18next';

type Sentinel2MissionId = 'S2A' | 'S2B';

type Sentinel2ProductInfo = {
    /**
     * the mission ID
     */
    missionID: Sentinel2MissionId;
    /**
     * Relative Orbit number
     */
    relativeOrbit: string;
    /**
     * Tile Number field
     */
    tileNumber: string;
    /**
     * Processing Baseline number
     */
    processingBaselineNumber: string;
};

/**
 * Parse Info of a Sentinel-2 Scene using its Product ID/Name.
 *
 * @example S2B_MSIL2A_20240701T182919_N0510_R027_T11SMT_20240702T012050
 * @see https://sentiwiki.copernicus.eu/web/s2-products
 */
export const parseSentinel2ProductInfo = (
    productId: string
): Sentinel2ProductInfo => {
    const [
        MMM, // the mission ID(S2A/S2B)
        MSIXXX, // MSIL1C denotes the Level-1C product level/ MSIL2A denotes the Level-2A product level
        YYYYMMDDHHMMSS, // the datatake sensing start time
        Nxxyy, // the Processing Baseline number (e.g. N0204)
        ROOO, // Relative Orbit number (R001 - R143),
        Txxxxx, // Tile Number field
    ] = productId.split('_');

    return {
        missionID: MMM as Sentinel2MissionId,
        relativeOrbit: ROOO,
        tileNumber: Txxxxx,
        processingBaselineNumber: Nxxyy,
    };
};

/**
 * Input for the `BandArithmetic` raster function.
 *
 * The `BandArithmetic` function can either evaluate a user defined expression (`Method` 0), or one of
 * the index formulas that are built into the raster function itself. The user defined expression parser
 * only supports the `+`, `-`, `*` and `/` operators over band references (e.g. `B8`), so any index that
 * needs a square root or hard coded coefficients has to use its built-in method instead.
 *
 * @see https://developers.arcgis.com/rest/services-reference/enterprise/raster-function-objects/#band-arithmetic
 */
export type BandArithmeticParams = {
    /**
     * `Method` argument of the `BandArithmetic` raster function.
     * - 0 = user defined expression, in which case `bandIndexes` holds the expression
     * - anything else = a built-in index formula, in which case `bandIndexes` holds a
     *   space delimited list of the band numbers (and coefficients) that formula expects
     */
    method: number;
    /**
     * `BandIndexes` argument of the `BandArithmetic` raster function.
     */
    bandIndexes: string;
};

/**
 * Sentinel-2 Band Arithmetic parameters by Spectral Index
 *
 * Here is the list of Sentinel-2 Bands:
 * - Band 1: Aerosols (60m)
 * - Band 2: Blue (10m)
 * - Band 3: Green (10m)
 * - Band 4: Red (10m)
 * - Band 5: Red Edge (20m)
 * - Band 6: Red Edge (20m)
 * - Band 7: Red Edge (20m)
 * - Band 8: Near InfraRed (10m)
 * - Band 8A: Narrow NIR (20m)
 * - Band 9: Water Vapour (60m)
 * - Band 11: Short Wave InfraRed (20m)
 * - Band 12: Short Wave InfraRed (20m)
 * - Band 13: AOT Map (10m)
 * - Band 14: WVP Map (20m)
 * - Band 15: SCL (20m)
 *
 * @see https://pro.arcgis.com/en/pro-app/3.0/help/analysis/raster-functions/band-arithmetic-function.htm
 * @see https://www.esri.com/about/newsroom/arcuser/spectral-library/
 */
const BandArithmeticParamsLookup: Partial<
    Record<SpectralIndex, BandArithmeticParams>
> = {
    /**
     * The Normalized Difference Moisture Index (NDMI) is sensitive to the moisture levels in vegetation.
     * It is used to monitor droughts as well as monitor fuel levels in fire-prone areas.
     * It uses NIR and SWIR bands to create a ratio designed to mitigate illumination and atmospheric effects.
     *
     * NDMI = (NIR - SWIR1)/(NIR + SWIR1)
     * - NIR = pixel values from the near-infrared band
     * - SWIR1 = pixel values from the first shortwave infrared band
     */
    moisture: { method: 0, bandIndexes: '(B8-B11)/(B8+B11)' },
    /**
     * The Green Normalized Difference Vegetation Index (GNDVI) method is a vegetation index for estimating photo synthetic activity
     * and is a commonly used vegetation index to determine water and nitrogen uptake into the plant canopy.
     *
     * GNDVI = (NIR-Green)/(NIR+Green)
     * - NIR = pixel values from the near-infrared band
     * - Green = pixel values from the green band
     *
     * This index outputs values between -1.0 and 1.0.
     */
    vegetation: { method: 0, bandIndexes: '(B8-B4)/(B8+B4)' },
    /**
     * The Modified Normalized Difference Water Index (MNDWI) uses green and SWIR bands for the enhancement of open water features.
     *
     * MNDWI = (Green - SWIR) / (Green + SWIR)
     * - Green = pixel values from the green band
     * - SWIR = pixel values from the shortwave infrared band
     */
    water: { method: 0, bandIndexes: '(B3-B11)/(B3+B11)' },
    /**
     * The Normalized Difference Red Edge (NDRE) swaps the red band of NDVI for the red edge band.
     * Chlorophyll absorption is weaker at the red edge, so the index keeps responding to canopy
     * condition in dense vegetation where NDVI has already saturated. It is widely used for
     * nitrogen status and mid-to-late season crop monitoring.
     *
     * NDRE = (NIR - RedEdge) / (NIR + RedEdge)
     * - NIR = pixel values from the near-infrared band
     * - RedEdge = pixel values from the first red edge band
     *
     * This index outputs values between -1.0 and 1.0.
     */
    ndre: { method: 0, bandIndexes: '(B8-B5)/(B8+B5)' },
    /**
     * The Normalized Difference Chlorophyll Index (NDCI) estimates chlorophyll-a concentration
     * in inland and coastal waters. It contrasts the red edge band, where algal pigments reflect,
     * against the red band, where they absorb, which makes algal blooms stand out.
     *
     * NDCI = (RedEdge - Red) / (RedEdge + Red)
     * - RedEdge = pixel values from the first red edge band
     * - Red = pixel values from the red band
     *
     * This index outputs values between -1.0 and 1.0.
     */
    ndci: { method: 0, bandIndexes: '(B5-B4)/(B5+B4)' },
    /**
     * The Enhanced Vegetation Index (EVI) corrects for both soil background and atmospheric
     * aerosol scattering by bringing the blue band into the NDVI formula. It stays sensitive in
     * high biomass areas where NDVI saturates.
     *
     * EVI = 2.5 * (NIR - Red) / (NIR + 6 * Red - 7.5 * Blue + 1)
     *
     * The coefficients are supplied by the built-in `EVI` method (19), which takes the NIR, Red
     * and Blue band numbers. A user defined expression cannot be used here because its parser
     * does not accept the numeric coefficients.
     */
    evi: { method: 19, bandIndexes: '8 4 2' },
    /**
     * The Soil-Adjusted Vegetation Index (SAVI) adds a soil brightness correction factor `L` to
     * NDVI, which suppresses the influence of exposed soil in areas of sparse vegetation.
     *
     * SAVI = ((NIR - Red) / (NIR + Red + L)) * (1 + L)
     *
     * The built-in `SAVI` method (2) takes the NIR and Red band numbers followed by `L`. `L` is set
     * to 0.5, the value that works across the widest range of vegetation densities.
     */
    savi: { method: 2, bandIndexes: '8 4 0.5' },
    /**
     * The Modified Soil-Adjusted Vegetation Index (MSAVI2) derives the soil correction factor from
     * the imagery instead of taking it as an input, which removes the need to pick an `L` value.
     *
     * MSAVI2 = (2 * NIR + 1 - sqrt((2 * NIR + 1)^2 - 8 * (NIR - Red))) / 2
     *
     * The built-in `MSAVI2` method (4) takes the NIR and Red band numbers. A user defined
     * expression cannot be used here because its parser has no square root operator.
     */
    msavi: { method: 4, bandIndexes: '8 4' },
    // /**
    //  * The Normalized Difference Built-up Index (NDBI) uses the NIR and SWIR bands to emphasize man-made built-up areas.
    //  * It is ratio based to mitigate the effects of terrain illumination differences as well as atmospheric effects.
    //  *
    //  * NDBI = (SWIR - NIR) / (SWIR + NIR)
    //  * - SWIR = pixel values from the shortwave infrared band
    //  * - NIR = pixel values from the near-infrared band
    //  */
    // urban: { method: 0, bandIndexes: '(B12-B8)/(B12+B8)' },
    // /**
    //  * The Normalized Burn Ratio Index (NBRI) uses the NIR and SWIR bands to emphasize burned areas, while mitigating illumination and atmospheric effects.
    //  *
    //  * NBR = (NIR - SWIR) / (NIR+ SWIR)
    //  * - NIR = pixel values from the near-infrared band
    //  * - SWIR = pixel values from the shortwave infrared band
    //  */
    // burn: { method: 0, bandIndexes: '(B13-B8)/(B13+B8)' },
};

/**
 * Get the `Method` and `BandIndexes` arguments that the `BandArithmetic` raster function needs
 * in order to compute the input spectral index from a Sentinel-2 scene.
 *
 * @param spectralIndex name of the spectral index
 * @returns the band arithmetic parameters, or undefined if the index is not supported for Sentinel-2
 */
export const getBandArithmeticParams4SpectralIndex = (
    spectralIndex: SpectralIndex
): BandArithmeticParams => {
    return BandArithmeticParamsLookup[spectralIndex];
};

/**
 * Get the `BandIndexes` argument of the `BandArithmetic` raster function for the input spectral index.
 *
 * Keep in mind that not every index is computed with a user defined expression, so this value is only
 * meaningful alongside the matching `Method`. Use {@link getBandArithmeticParams4SpectralIndex} to get both.
 */
export const getBandIndexesBySpectralIndex = (
    spectralIndex: SpectralIndex
): string => {
    return BandArithmeticParamsLookup[spectralIndex]?.bandIndexes;
};

/**
 * Converts a Sentinel-2 scene object to an ImageryScene object.
 *
 * @param {Sentinel2Scene} sentinel2Scene - The Sentinel-2 scene object to convert.
 * @returns {ImageryScene} The converted ImageryScene object.
 */
export const convertSentinel2SceneToImageryScene = (
    sentinel2Scene: Sentinel2Scene
): ImageryScene => {
    const {
        objectId,
        name,
        formattedAcquisitionDate,
        acquisitionDate,
        acquisitionYear,
        acquisitionMonth,
        cloudCover,
    } = sentinel2Scene;

    const imageryScene: ImageryScene = {
        objectId,
        sceneId: name,
        formattedAcquisitionDate,
        acquisitionDate,
        acquisitionYear,
        acquisitionMonth,
        cloudCover,
        satellite: 'Sentinel-2',
        customTooltipText: [`${Math.ceil(cloudCover * 100)}% ${t('cloudy')}`],
    };

    return imageryScene;
};

/**
 * Calculate the Sentinel-2 Spectral Index based on the input band values.
 *
 * @param spectralIndex name of the spectral index
 * @param bandValues array of band values
 * @returns the calculated spectral index value
 *
 * Here is the list of Sentinel-2 Bands:
 * - Band 1: Aerosols (60m)
 * - Band 2: Blue (10m)
 * - Band 3: Green (10m)
 * - Band 4: Red (10m)
 * - Band 5: Red Edge (20m)
 * - Band 6: Red Edge (20m)
 * - Band 7: Red Edge (20m)
 * - Band 8: Near InfraRed (10m)
 * - Band 8A: Narrow NIR (20m)
 * - Band 9: Water Vapour (60m)
 * - Band 11: Short Wave InfraRed (20m)
 * - Band 12: Short Wave InfraRed (20m)
 * - Band 13: AOT Map (10m)
 * - Band 14: WVP Map (20m)
 * - Band 15: SCL (20m)
 */
export const calcSentinel2SpectralIndex = (
    spectralIndex: SpectralIndex,
    bandValues: number[]
): number => {
    const [
        B1,
        B2,
        B3,
        B4,
        B5,
        B6,
        B7,
        B8,
        B8A,
        B9,
        B10,
        B11,
        B12,
        B13,
        B14,
        B15,
    ] = bandValues;

    // Check if any of the band values is null or undefined
    for (const val of bandValues) {
        if (val === null || val === undefined) {
            return 0;
        }
    }

    let value = 0;

    /**
     * Soil brightness correction factor used by SAVI. This has to stay in sync with the `L`
     * coefficient in the SAVI entry of `BandArithmeticParamsLookup`, otherwise the value read out
     * in the popup would not match the value rendered on the map.
     */
    const SAVI_SOIL_BRIGHTNESS_CORRECTION_FACTOR = 0.5;

    // Calculate the value based on the input spectral index
    if (spectralIndex === 'moisture') {
        value = (B8 - B11) / (B8 + B11);
    } else if (spectralIndex === 'vegetation') {
        value = (B8 - B4) / (B8 + B4);
    } else if (spectralIndex === 'water') {
        value = (B3 - B11) / (B3 + B11);
    } else if (spectralIndex === 'ndre') {
        value = (B8 - B5) / (B8 + B5);
    } else if (spectralIndex === 'ndci') {
        value = (B5 - B4) / (B5 + B4);
    } else if (spectralIndex === 'evi') {
        value = (2.5 * (B8 - B4)) / (B8 + 6 * B4 - 7.5 * B2 + 1);
    } else if (spectralIndex === 'savi') {
        const L = SAVI_SOIL_BRIGHTNESS_CORRECTION_FACTOR;
        value = ((B8 - B4) / (B8 + B4 + L)) * (1 + L);
    } else if (spectralIndex === 'msavi') {
        // MSAVI2, the variant that solves for the soil correction factor instead of taking it as an input
        value = (2 * B8 + 1 - Math.sqrt((2 * B8 + 1) ** 2 - 8 * (B8 - B4))) / 2;
    }

    // EVI and MSAVI2 both divide by a term that can approach zero, which produces a non finite
    // result. Fall back to 0 so the popup and the trend chart do not render `NaN`/`Infinity`.
    if (!Number.isFinite(value)) {
        return 0;
    }

    return value;
};
