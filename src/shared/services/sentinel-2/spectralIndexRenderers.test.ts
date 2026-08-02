import { SENTINEL2_CLIENT_SIDE_RASTER_FUNCTIONS } from './spectralIndexRenderers';

describe('Sentinel-2 colorized spectral index renderers', () => {
    it('should define a renderer for each of the indices the image service has no template for', () => {
        expect(
            SENTINEL2_CLIENT_SIDE_RASTER_FUNCTIONS.map((d) => d.name)
        ).toEqual([
            'EVI Colorized',
            'SAVI Colorized',
            'MSAVI2 Colorized',
            'NDRE Colorized',
            'NDCI Colorized',
        ]);
    });

    it.each(SENTINEL2_CLIENT_SIDE_RASTER_FUNCTIONS)(
        '$name should compute the index with BandArithmetic, bin it with Remap, then color it with Colormap',
        ({ renderingRule }) => {
            expect(renderingRule.rasterFunction).toBe('Colormap');

            const remap = renderingRule.rasterFunctionArguments.Raster;
            expect(remap.rasterFunction).toBe('Remap');

            const bandArithmetic = remap.rasterFunctionArguments.Raster;
            expect(bandArithmetic.rasterFunction).toBe('BandArithmetic');
            expect(bandArithmetic.outputPixelType).toBe('F32');

            // a missing/empty expression would silently render nothing
            expect(
                bandArithmetic.rasterFunctionArguments.BandIndexes
            ).toBeTruthy();
            expect(typeof bandArithmetic.rasterFunctionArguments.Method).toBe(
                'number'
            );
        }
    );

    it.each(SENTINEL2_CLIENT_SIDE_RASTER_FUNCTIONS)(
        '$name should remap into gap free ranges that cover every possible index value',
        ({ renderingRule }) => {
            const { InputRanges, OutputValues } =
                renderingRule.rasterFunctionArguments.Raster
                    .rasterFunctionArguments;

            // InputRanges is a flat list of [min, max) pairs, one pair per output class
            expect(InputRanges).toHaveLength(OutputValues.length * 2);

            // Remap turns anything outside of the input ranges into NoData, so the ranges have to be
            // contiguous and reach beyond the nominal -1 to 1 window of a normalized index.
            expect(InputRanges[0]).toBeLessThan(-1);
            expect(InputRanges[InputRanges.length - 1]).toBeGreaterThan(1);

            for (let i = 0; i < OutputValues.length; i++) {
                const min = InputRanges[i * 2];
                const max = InputRanges[i * 2 + 1];

                expect(max).toBeGreaterThan(min);

                // each range has to start exactly where the previous one ended
                if (i > 0) {
                    expect(min).toBe(InputRanges[i * 2 - 1]);
                }
            }
        }
    );

    it.each(SENTINEL2_CLIENT_SIDE_RASTER_FUNCTIONS)(
        '$name should assign a color to every class the Remap produces',
        ({ renderingRule }) => {
            const { Colormap } = renderingRule.rasterFunctionArguments;

            const { OutputValues } =
                renderingRule.rasterFunctionArguments.Raster
                    .rasterFunctionArguments;

            expect(Colormap).toHaveLength(OutputValues.length);

            Colormap.forEach((entry: number[], index: number) => {
                const [classValue, ...rgb] = entry;

                // the colormap entry has to line up with the class the Remap emits
                expect(classValue).toBe(OutputValues[index]);

                expect(rgb).toHaveLength(3);

                rgb.forEach((channel) => {
                    expect(channel).toBeGreaterThanOrEqual(0);
                    expect(channel).toBeLessThanOrEqual(255);
                });
            });
        }
    );

    it.each(SENTINEL2_CLIENT_SIDE_RASTER_FUNCTIONS)(
        '$name should carry a thumbnail and a legend for the renderer selector',
        ({ thumbnail, legend }) => {
            expect(thumbnail).toMatch(/^data:image\/svg\+xml,/);
            expect(legend).toMatch(/^data:image\/svg\+xml,/);
        }
    );

    it.each(SENTINEL2_CLIENT_SIDE_RASTER_FUNCTIONS)(
        '$name thumbnail should survive being used as an unquoted CSS url()',
        ({ thumbnail }) => {
            // The renderer grid card sets `background: url(${thumbnail})` without quoting it, so a
            // parenthesis anywhere in the data URI closes the url() early and the card renders blank.
            expect(thumbnail).not.toMatch(/[()]/);
        }
    );
});
