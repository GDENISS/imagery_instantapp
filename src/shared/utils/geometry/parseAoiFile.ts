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

import Polygon from '@arcgis/core/geometry/Polygon';
import * as geometryEngine from '@arcgis/core/geometry/geometryEngine';
import { geographicToWebMercator } from '@arcgis/core/geometry/support/webMercatorUtils';
import { parseAoiFileToRings, Ring } from './parseAoiFileToRings';

export { SUPPORTED_AOI_FILE_EXTENSIONS } from './parseAoiFileToRings';

/**
 * The result of reading an area of interest out of a file.
 */
export type ParsedAoi = {
    /**
     * The parcel, in web mercator so it can be handed straight to the map and the sketch layer.
     */
    polygon: Polygon;
    /**
     * How many polygon features the file contained. Only the first is used, so a value above one means
     * the rest were ignored and the user should be told.
     */
    countOfPolygonFeatures: number;
};

/**
 * Builds a polygon in web mercator from rings expressed in WGS84 longitude/latitude.
 *
 * GeoJSON, KML and the output of shpjs all describe their rings in WGS84, but they do not agree on ring
 * winding: GeoJSON wants an anticlockwise outer ring whereas ArcGIS wants a clockwise one. Rather than
 * reversing rings by hand, the polygon is passed through `simplify`, which rewrites the winding to
 * whatever ArcGIS considers correct and repairs self-intersections at the same time.
 */
const rings2WebMercatorPolygon = (rings: Ring[]): Polygon => {
    if (!rings.length) {
        throw new Error('the file contains no polygon coordinates');
    }

    const geographicPolygon = new Polygon({
        rings,
        spatialReference: { wkid: 4326 },
    });

    const simplified = (geometryEngine.simplify(geographicPolygon) ||
        geographicPolygon) as Polygon;

    return geographicToWebMercator(simplified) as Polygon;
};

/**
 * Reads an area of interest from a file the user picked.
 *
 * Supports GeoJSON, KML, KMZ and a zipped shapefile. Whatever the format, the first polygon found is
 * returned in web mercator, ready to be used as the parcel.
 *
 * @throws when the file cannot be read, holds no polygon, or has an unrecognised extension. The message
 * is written for display in the UI.
 */
export const parseAoiFile = async (file: File): Promise<ParsedAoi> => {
    const { rings, countOfPolygonFeatures } = await parseAoiFileToRings(file);

    return {
        polygon: rings2WebMercatorPolygon(rings),
        countOfPolygonFeatures,
    };
};
