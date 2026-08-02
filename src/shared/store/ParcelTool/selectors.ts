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

import { RootState } from '../configureStore';

export const selectParcelGeometry = (state: RootState) =>
    state.ParcelTool.parcelGeometry;

export const selectParcelAreaInHectares = (state: RootState) =>
    state.ParcelTool.parcelAreaInHectares;

export const selectIsDrawingParcel = (state: RootState) =>
    state.ParcelTool.isDrawing;

export const selectStartYear4ParcelTool = (state: RootState) =>
    state.ParcelTool.startYear;

export const selectEndYear4ParcelTool = (state: RootState) =>
    state.ParcelTool.endYear;

export const selectMaxCloudCover4ParcelTool = (state: RootState) =>
    state.ParcelTool.maxCloudCover;

export const selectSelectedIndices4ParcelTool = (state: RootState) =>
    state.ParcelTool.selectedIndices;

export const selectParcelToolData = (state: RootState) => state.ParcelTool.data;

export const selectParcelToolIsLoading = (state: RootState) =>
    state.ParcelTool.loading;

export const selectCountOfProcessedScenes4ParcelTool = (state: RootState) =>
    state.ParcelTool.countOfProcessedScenes;

export const selectCountOfScenes2Process4ParcelTool = (state: RootState) =>
    state.ParcelTool.countOfScenes2Process;

export const selectError4ParcelTool = (state: RootState) =>
    state.ParcelTool.error;
