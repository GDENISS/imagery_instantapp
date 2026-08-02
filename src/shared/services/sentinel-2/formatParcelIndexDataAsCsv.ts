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
    CSV_COLUMN_NAME_BY_SPECTRAL_INDEX,
    ParcelIndexRecord,
    SPECTRAL_INDICES_4_PARCEL_REPORT,
} from '@shared/store/ParcelTool/reducer';

/**
 * Number of decimal places used for the index means.
 *
 * Sentinel-2 reflectance is quantised at roughly 1e-4, so anything past the fourth decimal of a
 * normalized index is noise.
 */
const DECIMAL_PLACES = 4;

/**
 * Escapes a value for inclusion in a CSV field.
 *
 * Only the scene id and the parcel name can contain a comma or a quote, but quoting defensively keeps
 * the output valid regardless of what the service returns.
 */
const escapeCsvValue = (value: string | number): string => {
    const stringValue = value === null || value === undefined ? '' : `${value}`;

    if (/[",\r\n]/.test(stringValue)) {
        return `"${stringValue.replace(/"/g, '""')}"`;
    }

    return stringValue;
};

/**
 * Formats a parcel index time series as CSV.
 *
 * The layout is one row per scene and one column per index, which is the shape that spreadsheet and
 * dataframe tools expect for plotting a trend over time.
 *
 * `valid_pixel_count` is included so a row derived from a handful of pixels, for instance a parcel
 * clipped by the edge of a scene, can be told apart from a fully covered one.
 *
 * @param records the time series, one record per scene
 * @param selectedIndices which indices to write out as columns. Defaults to all of them. The records
 * always hold every index, so narrowing this changes only the export, never the underlying data.
 * The order given is ignored: columns always follow the order the report defines, so that two exports
 * of the same indices are always directly comparable.
 * @returns the CSV document as a string
 */
export const formatParcelIndexDataAsCsv = (
    records: ParcelIndexRecord[],
    selectedIndices: SpectralIndex[] = SPECTRAL_INDICES_4_PARCEL_REPORT
): string => {
    const indices = SPECTRAL_INDICES_4_PARCEL_REPORT.filter((spectralIndex) =>
        selectedIndices?.includes(spectralIndex)
    );

    // fall back to the full set rather than emitting a report with no index columns at all
    if (!indices.length) {
        indices.push(...SPECTRAL_INDICES_4_PARCEL_REPORT);
    }

    const indexColumns = indices.map(
        (spectralIndex) =>
            `${CSV_COLUMN_NAME_BY_SPECTRAL_INDEX[spectralIndex]}_mean`
    );

    const header = [
        'acquisition_date',
        'scene_id',
        'cloud_cover_pct',
        'valid_pixel_count',
        ...indexColumns,
    ];

    const rows = records.map((record) => {
        const {
            acquisitionDate,
            sceneId,
            cloudCover,
            sampleCount,
            meanByIndex,
        } = record;

        const indexValues = indices.map((spectralIndex) => {
            const value = meanByIndex?.[spectralIndex];

            // an index with no valid pixels is left blank rather than written as 0, so that it is
            // not mistaken for a real measurement
            return Number.isFinite(value) ? value.toFixed(DECIMAL_PLACES) : '';
        });

        return [
            acquisitionDate,
            sceneId,
            // cloud cover is stored as a 0-1 fraction but reads more naturally as a percentage
            (cloudCover * 100).toFixed(1),
            sampleCount,
            ...indexValues,
        ];
    });

    return [header, ...rows]
        .map((row) => row.map(escapeCsvValue).join(','))
        .join('\r\n');
};

/**
 * Builds the file name of the exported report.
 */
export const getParcelReportFileName = (
    startYear: number,
    endYear: number
): string => {
    const period =
        startYear === endYear ? `${startYear}` : `${startYear}-${endYear}`;

    return `sentinel2-parcel-indices-${period}.csv`;
};
