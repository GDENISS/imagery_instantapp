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
import { StoreDispatch, StoreGetState } from '../configureStore';
import {
    error4ParcelToolChanged,
    parcelToolDataUpdated,
    parcelToolIsLoadingChanged,
    parcelToolProgressChanged,
} from './reducer';
import { getSentinel2ParcelIndexTimeSeries } from '@shared/services/sentinel-2/getSentinel2ParcelIndexTimeSeries';

/**
 * Abort controller of the extraction that is currently running, so that starting a new extraction
 * cancels the pending requests of the previous one.
 */
let abortController: AbortController = null;

/**
 * Extracts the spectral index time series for the input parcel and puts it in the store.
 */
export const extractParcelIndexReport =
    (parcel: Polygon) =>
    async (dispatch: StoreDispatch, getState: StoreGetState) => {
        if (!parcel) {
            return;
        }

        if (abortController) {
            abortController.abort();
        }

        abortController = new AbortController();

        const { startYear, endYear, maxCloudCover } = getState().ParcelTool;

        try {
            dispatch(parcelToolIsLoadingChanged(true));
            dispatch(
                parcelToolProgressChanged({
                    countOfProcessedScenes: 0,
                    countOfScenes2Process: 0,
                })
            );

            const data = await getSentinel2ParcelIndexTimeSeries({
                parcel,
                startYear,
                endYear,
                maxCloudCover,
                abortController,
                onProgress: (countOfProcessedScenes, countOfScenes2Process) => {
                    dispatch(
                        parcelToolProgressChanged({
                            countOfProcessedScenes,
                            countOfScenes2Process,
                        })
                    );
                },
            });

            dispatch(parcelToolDataUpdated(data));
            dispatch(parcelToolIsLoadingChanged(false));
        } catch (err) {
            // an aborted request means a newer extraction took over, so it should not surface as an error
            if ((err as Error)?.name === 'AbortError') {
                return;
            }

            console.error('failed to extract parcel index report', err);

            dispatch(
                error4ParcelToolChanged(
                    (err as Error)?.message ||
                        'failed to extract the parcel report'
                )
            );
        }
    };
