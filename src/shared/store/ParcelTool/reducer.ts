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

import { createSlice, PayloadAction } from '@reduxjs/toolkit';
import { SpectralIndex } from '@typing/imagery-service';

/**
 * The spectral indices that the parcel report extracts, in the order they appear as columns of the
 * exported CSV.
 *
 * Every index here is computed on the client from the raw band values returned by a single sampling
 * request, so adding one costs no extra network traffic.
 */
export const SPECTRAL_INDICES_4_PARCEL_REPORT: SpectralIndex[] = [
    'vegetation',
    'moisture',
    'water',
    'evi',
    'savi',
    'msavi',
    'ndre',
    'ndci',
];

/**
 * Short names used as the CSV column headers, so the export reads in the language of remote sensing
 * rather than in the app's internal index names.
 */
export const CSV_COLUMN_NAME_BY_SPECTRAL_INDEX: Partial<
    Record<SpectralIndex, string>
> = {
    vegetation: 'ndvi',
    moisture: 'ndmi',
    water: 'mndwi',
    evi: 'evi',
    savi: 'savi',
    msavi: 'msavi2',
    ndre: 'ndre',
    ndci: 'ndci',
};

/**
 * The mean value of every spectral index across a parcel, for a single Sentinel-2 scene.
 */
export type ParcelIndexRecord = {
    /**
     * object Id of the Sentinel-2 scene the values were sampled from
     */
    objectId: number;
    /**
     * Sentinel-2 product name of the scene
     */
    sceneId: string;
    /**
     * acquisition date as a string in ISO format (YYYY-MM-DD)
     */
    acquisitionDate: string;
    /**
     * acquisition date in unix timestamp, used to sort the records chronologically
     */
    acquisitionTimestamp: number;
    /**
     * percent of cloud cover of the scene, the value ranges from 0 - 1
     */
    cloudCover: number;
    /**
     * number of sampled pixels inside the parcel that produced a usable value.
     *
     * This is exported alongside the means so that a row backed by only a handful of pixels can be
     * told apart from one backed by the whole parcel.
     */
    sampleCount: number;
    /**
     * mean value of each spectral index across the sampled pixels
     */
    meanByIndex: Partial<Record<SpectralIndex, number>>;
};

export type ParcelToolState = {
    /**
     * The parcel drawn by the user, stored as polygon JSON so that the state stays serializable.
     */
    parcelGeometry: any;
    /**
     * Area of the parcel in hectares, shown in the UI so the user can sanity check what they drew.
     */
    parcelAreaInHectares: number;
    /**
     * if true, the sketch view model is waiting for the user to draw a polygon
     */
    isDrawing: boolean;
    /**
     * first year of the period to report on
     */
    startYear: number;
    /**
     * last year of the period to report on
     */
    endYear: number;
    /**
     * scenes cloudier than this are excluded from the report, the value ranges from 0 - 1
     */
    maxCloudCover: number;
    /**
     * the indices the user wants in the exported CSV.
     *
     * This only narrows the columns of the export. Every index is still computed during extraction,
     * because they all come from the same sampled band values at no extra cost, which means the
     * selection can be changed after the fact without having to sample the scenes again.
     */
    selectedIndices: SpectralIndex[];
    /**
     * the extracted time series, one record per scene
     */
    data: ParcelIndexRecord[];
    /**
     * if true, the report is being extracted
     */
    loading: boolean;
    /**
     * number of scenes that have been sampled so far, used to show progress during a long extraction
     */
    countOfProcessedScenes: number;
    /**
     * total number of scenes that will be sampled
     */
    countOfScenes2Process: number;
    /**
     * message from the error that was caught while extracting the report
     */
    error: string;
};

const currentYear = new Date().getUTCFullYear();

export const initialParcelToolState: ParcelToolState = {
    parcelGeometry: null,
    parcelAreaInHectares: 0,
    isDrawing: false,
    startYear: currentYear,
    endYear: currentYear,
    maxCloudCover: 0.3,
    selectedIndices: [...SPECTRAL_INDICES_4_PARCEL_REPORT],
    data: [],
    loading: false,
    countOfProcessedScenes: 0,
    countOfScenes2Process: 0,
    error: null,
};

const slice = createSlice({
    name: 'ParcelTool',
    initialState: initialParcelToolState,
    reducers: {
        isDrawingParcelToggled: (state, action: PayloadAction<boolean>) => {
            state.isDrawing = action.payload;
        },
        parcelGeometryChanged: (
            state,
            action: PayloadAction<{
                geometry: any;
                areaInHectares: number;
            }>
        ) => {
            state.parcelGeometry = action.payload?.geometry || null;
            state.parcelAreaInHectares = action.payload?.areaInHectares || 0;
            state.isDrawing = false;
            // the previous report belongs to the previous parcel, so it must not be left on screen
            state.data = [];
            state.error = null;
        },
        startYear4ParcelToolChanged: (state, action: PayloadAction<number>) => {
            state.startYear = action.payload;

            // keep the range valid when the user picks a start year after the current end year
            if (state.endYear < action.payload) {
                state.endYear = action.payload;
            }

            state.data = [];
        },
        endYear4ParcelToolChanged: (state, action: PayloadAction<number>) => {
            state.endYear = action.payload;

            if (state.startYear > action.payload) {
                state.startYear = action.payload;
            }

            state.data = [];
        },
        maxCloudCover4ParcelToolChanged: (
            state,
            action: PayloadAction<number>
        ) => {
            state.maxCloudCover = action.payload;
            state.data = [];
        },
        selectedIndices4ParcelToolChanged: (
            state,
            action: PayloadAction<SpectralIndex[]>
        ) => {
            // Keep the canonical order rather than the order the user happened to click in, so the CSV
            // columns are always laid out the same way.
            state.selectedIndices = SPECTRAL_INDICES_4_PARCEL_REPORT.filter(
                (spectralIndex) => action.payload.includes(spectralIndex)
            );

            // deliberately does not clear `data`: the extracted record already holds every index, so
            // changing the selection only changes which columns get written out
        },
        parcelToolDataUpdated: (
            state,
            action: PayloadAction<ParcelIndexRecord[]>
        ) => {
            state.data = action.payload;
        },
        parcelToolIsLoadingChanged: (state, action: PayloadAction<boolean>) => {
            state.loading = action.payload;

            if (action.payload) {
                state.error = null;
            }
        },
        parcelToolProgressChanged: (
            state,
            action: PayloadAction<{
                countOfProcessedScenes: number;
                countOfScenes2Process: number;
            }>
        ) => {
            state.countOfProcessedScenes =
                action.payload.countOfProcessedScenes;
            state.countOfScenes2Process = action.payload.countOfScenes2Process;
        },
        error4ParcelToolChanged: (state, action: PayloadAction<string>) => {
            state.error = action.payload;
            state.loading = false;
        },
    },
});

const { reducer } = slice;

export const {
    isDrawingParcelToggled,
    parcelGeometryChanged,
    startYear4ParcelToolChanged,
    endYear4ParcelToolChanged,
    maxCloudCover4ParcelToolChanged,
    selectedIndices4ParcelToolChanged,
    parcelToolDataUpdated,
    parcelToolIsLoadingChanged,
    parcelToolProgressChanged,
    error4ParcelToolChanged,
} = slice.actions;

export default reducer;
