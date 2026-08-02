import {
    formatParcelIndexDataAsCsv,
    getParcelReportFileName,
} from './formatParcelIndexDataAsCsv';
import { ParcelIndexRecord } from '@shared/store/ParcelTool/reducer';

const record: ParcelIndexRecord = {
    objectId: 1,
    sceneId: 'S2B_MSIL2A_20240701T182919_N0510_R027_T11SMT_20240702T012050',
    acquisitionDate: '2024-07-01',
    acquisitionTimestamp: 1719792000000,
    cloudCover: 0.1234,
    sampleCount: 380,
    meanByIndex: {
        vegetation: 0.87211,
        moisture: 0.4321,
        water: -0.5,
        evi: 0.73044,
        savi: 0.6331,
        msavi: 0.68612,
        ndre: 0.69199,
        ndci: 0.45411,
    },
};

describe('formatParcelIndexDataAsCsv', () => {
    it('should emit a header naming each index the way remote sensing does', () => {
        const [header] = formatParcelIndexDataAsCsv([]).split('\r\n');

        expect(header).toBe(
            'acquisition_date,scene_id,cloud_cover_pct,valid_pixel_count,ndvi_mean,ndmi_mean,mndwi_mean,evi_mean,savi_mean,msavi2_mean,ndre_mean,ndci_mean'
        );
    });

    it('should emit one row per scene, with cloud cover as a percentage', () => {
        const [, row] = formatParcelIndexDataAsCsv([record]).split('\r\n');

        expect(row).toBe(
            '2024-07-01,S2B_MSIL2A_20240701T182919_N0510_R027_T11SMT_20240702T012050,12.3,380,0.8721,0.4321,-0.5000,0.7304,0.6331,0.6861,0.6920,0.4541'
        );
    });

    it('should leave an index blank rather than writing 0 when it has no valid value', () => {
        const csv = formatParcelIndexDataAsCsv([
            { ...record, meanByIndex: { vegetation: 0.5 } },
        ]);

        const [, row] = csv.split('\r\n');

        // ndvi is present, every other index is an empty field
        expect(row.endsWith('0.5000,,,,,,,')).toBe(true);
    });

    it('should quote a field that contains a comma so the row does not gain a column', () => {
        const csv = formatParcelIndexDataAsCsv([
            { ...record, sceneId: 'scene,with,commas' },
        ]);

        expect(csv).toContain('"scene,with,commas"');
    });

    it('should emit only the selected indices, in canonical order', () => {
        const csv = formatParcelIndexDataAsCsv(
            [record],
            ['ndre', 'vegetation', 'evi']
        );

        const [header, row] = csv.split('\r\n');

        // requested out of order, but written in the order the report defines
        expect(header).toBe(
            'acquisition_date,scene_id,cloud_cover_pct,valid_pixel_count,ndvi_mean,evi_mean,ndre_mean'
        );
        expect(row.endsWith('380,0.8721,0.7304,0.6920')).toBe(true);
    });

    it('should fall back to every index rather than emit a report with no index columns', () => {
        const [header] = formatParcelIndexDataAsCsv([record], []).split('\r\n');

        expect(header).toContain('ndvi_mean');
        expect(header).toContain('ndci_mean');
    });

    it('should sort nothing and keep the order it was given', () => {
        const second = { ...record, acquisitionDate: '2024-07-11' };

        const rows = formatParcelIndexDataAsCsv([record, second]).split('\r\n');

        expect(rows[1]).toContain('2024-07-01');
        expect(rows[2]).toContain('2024-07-11');
    });
});

describe('getParcelReportFileName', () => {
    it('should name a single year report with just that year', () => {
        expect(getParcelReportFileName(2024, 2024)).toBe(
            'sentinel2-parcel-indices-2024.csv'
        );
    });

    it('should name a multi year report with the range', () => {
        expect(getParcelReportFileName(2020, 2024)).toBe(
            'sentinel2-parcel-indices-2020-2024.csv'
        );
    });
});
