import { parseAoiFileToRings } from './parseAoiFileToRings';

/**
 * Builds a File the way the browser hands one over from an `<input type="file">`.
 */
const makeFile = (name: string, content: string): File =>
    ({
        name,
        text: async () => content,
        arrayBuffer: async () => new TextEncoder().encode(content).buffer,
    }) as unknown as File;

const SQUARE_RING = [
    [34.9, -0.2],
    [34.95, -0.2],
    [34.95, -0.15],
    [34.9, -0.15],
    [34.9, -0.2],
];

const toKmlCoords = (ring: number[][]) =>
    ring.map(([lon, lat]) => `${lon},${lat},0`).join(' ');

describe('parseAoiFileToRings', () => {
    it('should read a GeoJSON FeatureCollection', async () => {
        const file = makeFile(
            'parcel.geojson',
            JSON.stringify({
                type: 'FeatureCollection',
                features: [
                    {
                        type: 'Feature',
                        properties: {},
                        geometry: {
                            type: 'Polygon',
                            coordinates: [SQUARE_RING],
                        },
                    },
                ],
            })
        );

        const { rings, countOfPolygonFeatures } =
            await parseAoiFileToRings(file);

        expect(countOfPolygonFeatures).toBe(1);
        expect(rings).toEqual([SQUARE_RING]);
    });

    it('should read a bare GeoJSON geometry with no Feature wrapper', async () => {
        const file = makeFile(
            'parcel.json',
            JSON.stringify({ type: 'Polygon', coordinates: [SQUARE_RING] })
        );

        const { rings } = await parseAoiFileToRings(file);

        expect(rings).toEqual([SQUARE_RING]);
    });

    it('should keep every part of a MultiPolygon so a split parcel survives intact', async () => {
        const secondPart = SQUARE_RING.map(([lon, lat]) => [lon + 1, lat]);

        const file = makeFile(
            'parcel.geojson',
            JSON.stringify({
                type: 'MultiPolygon',
                coordinates: [[SQUARE_RING], [secondPart]],
            })
        );

        const { rings } = await parseAoiFileToRings(file);

        expect(rings).toEqual([SQUARE_RING, secondPart]);
    });

    it('should report how many polygons a multi feature file held', async () => {
        const feature = {
            type: 'Feature',
            properties: {},
            geometry: { type: 'Polygon', coordinates: [SQUARE_RING] },
        };

        const file = makeFile(
            'parcels.geojson',
            JSON.stringify({
                type: 'FeatureCollection',
                features: [feature, feature, feature],
            })
        );

        const { countOfPolygonFeatures } = await parseAoiFileToRings(file);

        expect(countOfPolygonFeatures).toBe(3);
    });

    it('should read a KML polygon with its outer ring first and holes after', async () => {
        const hole = [
            [34.91, -0.19],
            [34.92, -0.19],
            [34.92, -0.18],
            [34.91, -0.18],
            [34.91, -0.19],
        ];

        const file = makeFile(
            'parcel.kml',
            `<?xml version="1.0" encoding="UTF-8"?>
            <kml xmlns="http://www.opengis.net/kml/2.2"><Document><Placemark><Polygon>
                <outerBoundaryIs><LinearRing><coordinates>${toKmlCoords(
                    SQUARE_RING
                )}</coordinates></LinearRing></outerBoundaryIs>
                <innerBoundaryIs><LinearRing><coordinates>${toKmlCoords(
                    hole
                )}</coordinates></LinearRing></innerBoundaryIs>
            </Polygon></Placemark></Document></kml>`
        );

        const { rings } = await parseAoiFileToRings(file);

        expect(rings).toEqual([SQUARE_RING, hole]);
    });

    it('should drop the altitude component of KML coordinates', async () => {
        const file = makeFile(
            'parcel.kml',
            `<kml><Placemark><Polygon><outerBoundaryIs><LinearRing><coordinates>${toKmlCoords(
                SQUARE_RING
            )}</coordinates></LinearRing></outerBoundaryIs></Polygon></Placemark></kml>`
        );

        const { rings } = await parseAoiFileToRings(file);

        rings[0].forEach((position) => expect(position).toHaveLength(2));
    });

    it('should reject a file whose extension is not supported', async () => {
        await expect(
            parseAoiFileToRings(makeFile('parcel.dxf', ''))
        ).rejects.toThrow(/unsupported file type/i);
    });

    it('should reject a GeoJSON file that holds no polygon', async () => {
        const file = makeFile(
            'point.geojson',
            JSON.stringify({ type: 'Point', coordinates: [34.9, -0.2] })
        );

        await expect(parseAoiFileToRings(file)).rejects.toThrow(/no polygon/i);
    });

    it('should reject a KML file that holds no polygon', async () => {
        const file = makeFile(
            'point.kml',
            '<kml><Placemark><Point><coordinates>34.9,-0.2</coordinates></Point></Placemark></kml>'
        );

        await expect(parseAoiFileToRings(file)).rejects.toThrow(/no polygon/i);
    });
});
