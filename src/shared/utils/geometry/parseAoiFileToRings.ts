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

/**
 * Reads polygon rings out of the geospatial file formats a user is likely to have a parcel in.
 *
 * This module deliberately knows nothing about ArcGIS geometry types. It turns a file into plain
 * WGS84 coordinate rings, and `parseAoiFile` turns those into a `Polygon`. Keeping the split means the
 * format handling can be tested without pulling in the mapping SDK.
 */

/**
 * File extensions accepted as an area of interest.
 */
export const SUPPORTED_AOI_FILE_EXTENSIONS = [
    '.geojson',
    '.json',
    '.kml',
    '.kmz',
    '.zip',
] as const;

/**
 * A ring of a polygon, as an array of `[longitude, latitude]` pairs in WGS84.
 */
export type Ring = number[][];

export type ParsedRings = {
    /**
     * Rings of the first polygon in the file. The first ring is the outer boundary and any that follow
     * are holes, which is the order ArcGIS expects.
     */
    rings: Ring[];
    /**
     * How many polygon features the file contained. Only the first is used, so a value above one means
     * the rest were ignored and the user should be told.
     */
    countOfPolygonFeatures: number;
};

/**
 * Pulls the rings of the first polygon out of a GeoJSON document.
 *
 * A `MultiPolygon` contributes every ring of every part, so a parcel made of several detached pieces
 * survives intact, while a file holding many unrelated parcels only yields the first.
 */
export const getRingsFromGeoJson = (geojson: any): ParsedRings => {
    const features: any[] =
        geojson?.type === 'FeatureCollection'
            ? geojson.features || []
            : geojson?.type === 'Feature'
              ? [geojson]
              : geojson?.type
                ? [{ geometry: geojson }]
                : [];

    const polygonFeatures = features.filter((feature) => {
        const type = feature?.geometry?.type;
        return type === 'Polygon' || type === 'MultiPolygon';
    });

    if (!polygonFeatures.length) {
        throw new Error('no polygon was found in the file');
    }

    const geometry = polygonFeatures[0].geometry;

    const rings: Ring[] =
        geometry.type === 'Polygon'
            ? geometry.coordinates
            : // a MultiPolygon is an array of polygons, each of which is an array of rings
              geometry.coordinates.flat();

    return {
        rings,
        countOfPolygonFeatures: polygonFeatures.length,
    };
};

/**
 * Parses the whitespace separated `lon,lat[,alt]` tuples of a KML `<coordinates>` element.
 */
const parseKmlCoordinates = (text: string): Ring =>
    text
        .trim()
        .split(/\s+/)
        .map((tuple) => {
            const [lon, lat] = tuple.split(',').map((d) => Number(d));
            return [lon, lat];
        })
        .filter(([lon, lat]) => Number.isFinite(lon) && Number.isFinite(lat));

/**
 * Pulls the rings of the first `<Polygon>` out of a KML document.
 */
export const getRingsFromKml = (kml: string): ParsedRings => {
    const doc = new DOMParser().parseFromString(kml, 'text/xml');

    if (doc.getElementsByTagName('parsererror').length) {
        throw new Error('the KML file could not be parsed');
    }

    const polygons = doc.getElementsByTagName('Polygon');

    if (!polygons.length) {
        throw new Error('no polygon was found in the KML file');
    }

    const polygon = polygons[0];

    const rings: Ring[] = [];

    // the outer boundary has to come first, ArcGIS treats every ring after it as a hole
    const outerCoordinates = polygon
        .getElementsByTagName('outerBoundaryIs')[0]
        ?.getElementsByTagName('coordinates')[0]?.textContent;

    if (outerCoordinates) {
        rings.push(parseKmlCoordinates(outerCoordinates));
    }

    const innerBoundaries = polygon.getElementsByTagName('innerBoundaryIs');

    for (let i = 0; i < innerBoundaries.length; i++) {
        const innerCoordinates =
            innerBoundaries[i].getElementsByTagName('coordinates')[0]
                ?.textContent;

        if (innerCoordinates) {
            rings.push(parseKmlCoordinates(innerCoordinates));
        }
    }

    return { rings, countOfPolygonFeatures: polygons.length };
};

/**
 * Reads the KML document out of a KMZ archive.
 */
const getKmlFromKmz = async (file: File): Promise<string> => {
    // loaded on demand so the zip library stays out of the initial bundle
    const JSZip = (await import('jszip')).default;

    const zip = await JSZip.loadAsync(await file.arrayBuffer());

    const kmlEntry = Object.keys(zip.files).find((name) =>
        name.toLowerCase().endsWith('.kml')
    );

    if (!kmlEntry) {
        throw new Error('the KMZ archive contains no KML file');
    }

    return zip.files[kmlEntry].async('text');
};

/**
 * Reads the rings of an area of interest from a file the user picked.
 *
 * Supports GeoJSON, KML, KMZ and a zipped shapefile. The shapefile branch relies on `shpjs`, which
 * reprojects to WGS84 using the `.prj` in the archive, so every branch returns WGS84 coordinates.
 *
 * @throws when the file cannot be read, holds no polygon, or has an unrecognised extension. The message
 * is written for display in the UI.
 */
export const parseAoiFileToRings = async (file: File): Promise<ParsedRings> => {
    if (!file) {
        throw new Error('no file was selected');
    }

    const name = file.name.toLowerCase();

    if (name.endsWith('.geojson') || name.endsWith('.json')) {
        return getRingsFromGeoJson(JSON.parse(await file.text()));
    }

    if (name.endsWith('.kml')) {
        return getRingsFromKml(await file.text());
    }

    if (name.endsWith('.kmz')) {
        return getRingsFromKml(await getKmlFromKmz(file));
    }

    if (name.endsWith('.zip')) {
        // loaded on demand so the shapefile parser stays out of the initial bundle
        const shp = (await import('shpjs')).default;

        const result = await shp(await file.arrayBuffer());

        // a zip holding several shapefiles resolves to one feature collection per shapefile
        const collections = Array.isArray(result) ? result : [result];

        return getRingsFromGeoJson({
            type: 'FeatureCollection',
            features: collections.flatMap(
                (collection) => collection?.features || []
            ),
        });
    }

    throw new Error(
        `unsupported file type, expected one of ${SUPPORTED_AOI_FILE_EXTENSIONS.join(
            ', '
        )}`
    );
};
