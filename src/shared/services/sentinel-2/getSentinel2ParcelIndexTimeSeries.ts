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

import Point from '@arcgis/core/geometry/Point';
import Polygon from '@arcgis/core/geometry/Polygon';
import { webMercatorToGeographic } from '@arcgis/core/geometry/support/webMercatorUtils';
import { SpectralIndex } from '@typing/imagery-service';
import { getSentinel2Scenes } from './getSentinel2Scenes';
import { SENTINEL_2_SERVICE_URL } from './config';
import { calcSentinel2SpectralIndex } from './helpers';
import { getSamples, parseSampleValues } from '../helpers/getSamples';
import {
    ParcelIndexRecord,
    SPECTRAL_INDICES_4_PARCEL_REPORT,
} from '@shared/store/ParcelTool/reducer';

type GetSentinel2ParcelIndexTimeSeriesParams = {
    /**
     * the parcel to report on
     */
    parcel: Polygon;
    /**
     * first year of the period to report on
     */
    startYear: number;
    /**
     * last year of the period to report on
     */
    endYear: number;
    /**
     * scenes cloudier than this are skipped, the value ranges from 0 - 1
     */
    maxCloudCover: number;
    /**
     * how many locations to sample inside the parcel per scene
     */
    sampleCount?: number;
    /**
     * called after each scene is sampled, so the UI can show progress on a long extraction
     */
    onProgress?: (countOfProcessedScenes: number, total: number) => void;
    abortController?: AbortController;
};

/**
 * How many scenes are sampled concurrently.
 *
 * Sampling is one request per scene, and a multi-year report can span a hundred scenes. Batching keeps
 * the image service from being hit with all of them at once while still being much faster than
 * sampling one at a time.
 */
const CONCURRENT_REQUESTS = 5;

/**
 * Computes the mean of each spectral index over the sampled pixels of one scene.
 *
 * @param samples band values of each sampled location that fell on a valid pixel
 * @returns the mean of each index, skipping indices that produced no finite value
 */
const calcMeanIndexValues = (
    samples: number[][]
): Partial<Record<SpectralIndex, number>> => {
    const meanByIndex: Partial<Record<SpectralIndex, number>> = {};

    for (const spectralIndex of SPECTRAL_INDICES_4_PARCEL_REPORT) {
        let sum = 0;
        let count = 0;

        for (const bandValues of samples) {
            const value = calcSentinel2SpectralIndex(spectralIndex, bandValues);

            if (Number.isFinite(value)) {
                sum += value;
                count++;
            }
        }

        if (count) {
            meanByIndex[spectralIndex] = sum / count;
        }
    }

    return meanByIndex;
};

/**
 * Extracts a spectral index time series for a parcel.
 *
 * For each Sentinel-2 scene that covers the parcel in the requested period, the raster is sampled once
 * across the parcel interior and every index is derived on the client from the returned band values.
 * That keeps the cost at one request per scene no matter how many indices are reported.
 *
 * Note that scenes are discovered using the parcel centroid rather than the full polygon. A Sentinel-2
 * scene spans roughly 110 km while a parcel is a few hundred metres across, so a scene that contains
 * the centroid contains the parcel; sampling then confirms this by returning no valid pixels for any
 * scene that does not actually cover it.
 *
 * @returns one record per scene, sorted oldest first. Scenes that yielded no valid pixels are dropped.
 */
export const getSentinel2ParcelIndexTimeSeries = async ({
    parcel,
    startYear,
    endYear,
    maxCloudCover,
    sampleCount = 400,
    onProgress,
    abortController,
}: GetSentinel2ParcelIndexTimeSeriesParams): Promise<ParcelIndexRecord[]> => {
    if (!parcel) {
        return [];
    }

    // the scene query expects a geographic coordinate, whereas the sketched parcel is in web mercator
    const centroid = parcel.centroid;

    const geographicCentroid: Point =
        parcel.spatialReference?.isWebMercator && centroid
            ? (webMercatorToGeographic(centroid) as Point)
            : centroid;

    const scenes = await getSentinel2Scenes({
        mapPoint: [geographicCentroid.x, geographicCentroid.y],
        acquisitionDateRange: {
            startDate: `${startYear}-01-01`,
            endDate: `${endYear}-12-31`,
        },
        abortController,
    });

    // Drop the cloudier scenes up front. Cloud cover is a property of the whole scene rather than of
    // the parcel, so this is a coarse filter, but it avoids paying for a sampling request on a scene
    // that is obviously unusable.
    const scenes2Sample = scenes
        .filter((scene) => scene.cloudCover <= maxCloudCover)
        // a parcel near a tile boundary is covered by more than one scene on the same day, so keep
        // only the least cloudy scene per acquisition date
        .reduce((leastCloudyByDate, scene) => {
            const existing = leastCloudyByDate.get(
                scene.formattedAcquisitionDate
            );

            if (!existing || scene.cloudCover < existing.cloudCover) {
                leastCloudyByDate.set(scene.formattedAcquisitionDate, scene);
            }

            return leastCloudyByDate;
        }, new Map<string, (typeof scenes)[number]>());

    const uniqueScenes = [...scenes2Sample.values()].sort(
        (a, b) => a.acquisitionDate - b.acquisitionDate
    );

    if (!uniqueScenes.length) {
        return [];
    }

    const parcelGeometry = parcel.toJSON();

    const records: ParcelIndexRecord[] = [];

    let countOfProcessedScenes = 0;

    for (let i = 0; i < uniqueScenes.length; i += CONCURRENT_REQUESTS) {
        const batch = uniqueScenes.slice(i, i + CONCURRENT_REQUESTS);

        const results = await Promise.all(
            batch.map(async (scene) => {
                try {
                    const samples = await getSamples({
                        serviceURL: SENTINEL_2_SERVICE_URL,
                        geometry: parcelGeometry,
                        objectIds: [scene.objectId],
                        sampleCount,
                        abortController,
                    });

                    const bandValues = samples
                        .map((sample) => parseSampleValues(sample))
                        .filter((values) => values !== null);

                    if (!bandValues.length) {
                        return null;
                    }

                    const record: ParcelIndexRecord = {
                        objectId: scene.objectId,
                        sceneId: scene.name,
                        acquisitionDate: scene.formattedAcquisitionDate,
                        acquisitionTimestamp: scene.acquisitionDate,
                        cloudCover: scene.cloudCover,
                        sampleCount: bandValues.length,
                        meanByIndex: calcMeanIndexValues(bandValues),
                    };

                    return record;
                } catch (err) {
                    // A single scene failing to sample should not lose the rest of the report, so the
                    // scene is dropped and the extraction carries on.
                    console.error(
                        `failed to sample scene ${scene.objectId}`,
                        err
                    );
                    return null;
                }
            })
        );

        for (const record of results) {
            if (record) {
                records.push(record);
            }
        }

        countOfProcessedScenes += batch.length;

        if (onProgress) {
            onProgress(countOfProcessedScenes, uniqueScenes.length);
        }
    }

    return records.sort(
        (a, b) => a.acquisitionTimestamp - b.acquisitionTimestamp
    );
};
