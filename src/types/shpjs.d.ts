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
 * Minimal typings for `shpjs`, which ships no types of its own.
 *
 * Only the shape actually used by the AOI file parser is declared: hand it the bytes of a zipped
 * shapefile and it resolves to GeoJSON, reprojecting to WGS84 using the `.prj` in the archive. A zip
 * holding several shapefiles resolves to one feature collection per shapefile.
 *
 * @see https://github.com/calvinmetcalf/shapefile-js
 */
declare module 'shpjs' {
    type ShpJsGeoJson = {
        type: string;
        features?: any[];
        [key: string]: any;
    };

    function shp(
        source: ArrayBuffer | string
    ): Promise<ShpJsGeoJson | ShpJsGeoJson[]>;

    export default shp;
}
