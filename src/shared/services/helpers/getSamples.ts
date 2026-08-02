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

import { getLockRasterMosaicRule } from './getMosaicRules';

/**
 * Parameters for the `getSamples` operation of an image service.
 */
export type GetSamplesParams = {
    /**
     * URL of the imagery service
     */
    serviceURL: string;
    /**
     * Geometry to sample within, as Esri JSON. A polygon is sampled at locations spread across its
     * interior, which is what makes this usable for reporting on a parcel.
     */
    geometry: any;
    /**
     * Geometry type of `geometry`
     */
    geometryType?:
        | 'esriGeometryPolygon'
        | 'esriGeometryEnvelope'
        | 'esriGeometryPoint'
        | 'esriGeometryMultipoint';
    /**
     * Object IDs of the imagery scenes to sample, used to build a Lock Raster mosaic rule.
     */
    objectIds?: number[];
    /**
     * Upper bound on how many locations get sampled. The service caps this, so a very large value is
     * silently reduced rather than rejected.
     */
    sampleCount?: number;
    /**
     * Abort controller to be used to cancel the request
     */
    abortController?: AbortController;
};

/**
 * A single sampled location returned by the `getSamples` operation.
 */
export type SampleData = {
    /**
     * index of the sampled location
     */
    locationId: number;
    /**
     * object Id of the raster the sample came from
     */
    rasterId: number;
    /**
     * The sampled band values as a space delimited string, e.g. `"0.0236 0.0291 0.0534"`.
     *
     * A band that has no data is returned as `NaN`, so the string is not always parseable as numbers.
     */
    value: string;
};

type GetSamplesResponse = {
    samples?: SampleData[];
    error?: {
        code: number;
        message: string;
        details?: string[];
    };
};

/**
 * Samples the pixel values of an image service at locations within the input geometry.
 *
 * Unlike `identify`, which returns the value at one point, this returns many locations in a single
 * request and includes every band. That means all spectral indices for an area of interest can be
 * derived on the client from one round trip, instead of one request per index.
 *
 * The request is sent as a POST because a digitized polygon can easily exceed the practical length
 * limit of a query string.
 *
 * @returns the sampled locations, or an empty array when the geometry covers no valid pixels
 *
 * @see https://developers.arcgis.com/rest/services-reference/enterprise/get-samples/
 */
export const getSamples = async ({
    serviceURL,
    geometry,
    geometryType = 'esriGeometryPolygon',
    objectIds,
    sampleCount = 400,
    abortController,
}: GetSamplesParams): Promise<SampleData[]> => {
    const params = new URLSearchParams({
        f: 'json',
        geometry: JSON.stringify(geometry),
        geometryType,
        sampleCount: sampleCount.toString(),
        returnFirstValueOnly: 'false',
        // nearest neighbour keeps the returned values as actual pixel values rather than blending
        // neighbouring pixels, which matters because these feed an index calculation
        interpolation: 'RSP_NearestNeighbor',
    });

    if (objectIds && objectIds.length) {
        params.append(
            'mosaicRule',
            JSON.stringify(getLockRasterMosaicRule(objectIds))
        );
    }

    const res = await fetch(`${serviceURL}/getSamples`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: params.toString(),
        signal: abortController?.signal,
    });

    const data: GetSamplesResponse = await res.json();

    if (data?.error) {
        throw new Error(data.error.message || 'failed to sample the raster');
    }

    return data?.samples || [];
};

/**
 * Parses the space delimited band values of a sample into numbers.
 *
 * @returns the band values, or null when any band is missing or not a number, which happens for
 * locations that fall on a NoData pixel (outside the scene footprint, or masked out).
 */
export const parseSampleValues = (sample: SampleData): number[] => {
    if (!sample?.value) {
        return null;
    }

    const values = sample.value
        .trim()
        .split(/\s+/)
        .map((d) => Number(d));

    if (!values.length || values.some((d) => !Number.isFinite(d))) {
        return null;
    }

    return values;
};
