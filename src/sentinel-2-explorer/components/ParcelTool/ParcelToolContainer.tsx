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

import React, { useMemo, useRef, useState } from 'react';
import classNames from 'classnames';
import Polygon from '@arcgis/core/geometry/Polygon';
import * as geometryEngine from '@arcgis/core/geometry/geometryEngine';
import { useTranslation } from 'react-i18next';
import { useAppDispatch, useAppSelector } from '@shared/store/configureStore';
import { selectActiveAnalysisTool } from '@shared/store/ImageryScene/selectors';
import { selectImageryServiceTimeExtent } from '@shared/store/ImageryService/selectors';
import { SpectralIndex } from '@typing/imagery-service';
import {
    CSV_COLUMN_NAME_BY_SPECTRAL_INDEX,
    endYear4ParcelToolChanged,
    error4ParcelToolChanged,
    isDrawingParcelToggled,
    maxCloudCover4ParcelToolChanged,
    parcelGeometryChanged,
    selectedIndices4ParcelToolChanged,
    SPECTRAL_INDICES_4_PARCEL_REPORT,
    startYear4ParcelToolChanged,
} from '@shared/store/ParcelTool/reducer';
import {
    parseAoiFile,
    SUPPORTED_AOI_FILE_EXTENSIONS,
} from '@shared/utils/geometry/parseAoiFile';
import {
    selectCountOfProcessedScenes4ParcelTool,
    selectCountOfScenes2Process4ParcelTool,
    selectEndYear4ParcelTool,
    selectError4ParcelTool,
    selectIsDrawingParcel,
    selectMaxCloudCover4ParcelTool,
    selectParcelAreaInHectares,
    selectParcelGeometry,
    selectParcelToolData,
    selectParcelToolIsLoading,
    selectSelectedIndices4ParcelTool,
    selectStartYear4ParcelTool,
} from '@shared/store/ParcelTool/selectors';
import { extractParcelIndexReport } from '@shared/store/ParcelTool/thunks';
import { Dropdown, DropdownData } from '@shared/components/Dropdown';
import { AnalysisToolHeaderText } from '@shared/components/AnalysisToolHeader/AnalysisToolHeader';
import { downloadBlob } from '@shared/utils/snippets/downloadBlob';
import {
    copyTextToClipboard,
    isRunningInIframe,
} from '@shared/utils/snippets/copyTextToClipboard';
import {
    formatParcelIndexDataAsCsv,
    getParcelReportFileName,
} from '@shared/services/sentinel-2/formatParcelIndexDataAsCsv';

/**
 * Builds the list of years the report can cover, newest first, from the time extent of the service.
 */
const useAvailableYears = (): number[] => {
    const timeExtent = useAppSelector(selectImageryServiceTimeExtent);

    return useMemo(() => {
        const currentYear = new Date().getUTCFullYear();

        const startYear = timeExtent?.start
            ? new Date(timeExtent.start).getUTCFullYear()
            : 2015; // Sentinel-2 imagery starts in 2015

        const endYear = timeExtent?.end
            ? new Date(timeExtent.end).getUTCFullYear()
            : currentYear;

        const years: number[] = [];

        for (let year = endYear; year >= startYear; year--) {
            years.push(year);
        }

        return years;
    }, [timeExtent]);
};

export const ParcelToolContainer = () => {
    const { t } = useTranslation();

    const dispatch = useAppDispatch();

    const tool = useAppSelector(selectActiveAnalysisTool);

    const isDrawing = useAppSelector(selectIsDrawingParcel);

    const parcelGeometry = useAppSelector(selectParcelGeometry);

    const parcelAreaInHectares = useAppSelector(selectParcelAreaInHectares);

    const startYear = useAppSelector(selectStartYear4ParcelTool);

    const endYear = useAppSelector(selectEndYear4ParcelTool);

    const maxCloudCover = useAppSelector(selectMaxCloudCover4ParcelTool);

    const selectedIndices = useAppSelector(selectSelectedIndices4ParcelTool);

    const data = useAppSelector(selectParcelToolData);

    const loading = useAppSelector(selectParcelToolIsLoading);

    const countOfProcessedScenes = useAppSelector(
        selectCountOfProcessedScenes4ParcelTool
    );

    const countOfScenes2Process = useAppSelector(
        selectCountOfScenes2Process4ParcelTool
    );

    const error = useAppSelector(selectError4ParcelTool);

    const fileInputRef = useRef<HTMLInputElement>(null);

    /**
     * A sandboxed iframe cannot start a download unless the embedding page sets `allow-downloads`,
     * and nothing this app does can change that. When embedded, a clipboard fallback is offered
     * instead, because clipboard writes are not subject to the download sandbox.
     */
    const isEmbedded = useMemo(() => isRunningInIframe(), []);

    const [copyStatus, setCopyStatus] = useState<'idle' | 'copied' | 'failed'>(
        'idle'
    );

    const availableYears = useAvailableYears();

    const getYearDropdownData = (selectedYear: number): DropdownData[] =>
        availableYears.map((year) => ({
            value: year.toString(),
            label: year.toString(),
            selected: year === selectedYear,
        }));

    const cloudCoverDropdownData: DropdownData[] = [
        10, 20, 30, 50, 80, 100,
    ].map((percent) => ({
        value: (percent / 100).toString(),
        label: `< ${percent}%`,
        selected: Math.round(maxCloudCover * 100) === percent,
    }));

    const indexDropdownData: DropdownData[] =
        SPECTRAL_INDICES_4_PARCEL_REPORT.map((spectralIndex) => ({
            value: spectralIndex,
            label: CSV_COLUMN_NAME_BY_SPECTRAL_INDEX[
                spectralIndex
            ].toUpperCase(),
            selected: selectedIndices.includes(spectralIndex),
        }));

    const handleAoiFileSelected = async (
        event: React.ChangeEvent<HTMLInputElement>
    ) => {
        const file = event.target.files?.[0];

        // reset the input so picking the same file twice in a row still fires a change event
        event.target.value = '';

        if (!file) {
            return;
        }

        try {
            const { polygon, countOfPolygonFeatures } =
                await parseAoiFile(file);

            dispatch(
                parcelGeometryChanged({
                    geometry: polygon.toJSON(),
                    areaInHectares: Math.abs(
                        geometryEngine.geodesicArea(polygon, 'hectares')
                    ),
                })
            );

            if (countOfPolygonFeatures > 1) {
                dispatch(
                    error4ParcelToolChanged(
                        t('using_first_polygon', {
                            count: countOfPolygonFeatures,
                        })
                    )
                );
            }
        } catch (err) {
            dispatch(
                error4ParcelToolChanged(
                    (err as Error)?.message || 'could not read the file'
                )
            );
        }
    };

    const handleIndexToggled = (value: string) => {
        const spectralIndex = value as SpectralIndex;

        const updated = selectedIndices.includes(spectralIndex)
            ? selectedIndices.filter((d) => d !== spectralIndex)
            : [...selectedIndices, spectralIndex];

        dispatch(selectedIndices4ParcelToolChanged(updated));
    };

    const handleDownloadCsv = () => {
        const csv = formatParcelIndexDataAsCsv(data, selectedIndices);

        // the byte order mark keeps Excel from mangling the file when it opens it
        const blob = new Blob(['\uFEFF' + csv], {
            type: 'text/csv;charset=utf-8;',
        });

        downloadBlob(blob, getParcelReportFileName(startYear, endYear));
    };

    const handleCopyCsv = async () => {
        const csv = formatParcelIndexDataAsCsv(data, selectedIndices);

        const succeeded = await copyTextToClipboard(csv);

        setCopyStatus(succeeded ? 'copied' : 'failed');

        // let the confirmation fade so the panel does not keep stale feedback on screen
        window.setTimeout(() => setCopyStatus('idle'), 4000);
    };

    if (tool !== 'parcel') {
        return null;
    }

    return (
        <div className={classNames('w-full h-full')}>
            <div className="flex items-center w-full select-none mb-3">
                <AnalysisToolHeaderText
                    title={t('parcel')}
                    tooltipText={t('parcel_tool_tooltip')}
                />
            </div>

            <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                    <calcite-button
                        scale="s"
                        appearance={isDrawing ? 'solid' : 'outline'}
                        kind="neutral"
                        icon-start="polygon"
                        onClick={() => {
                            dispatch(isDrawingParcelToggled(!isDrawing));
                        }}
                    >
                        {isDrawing
                            ? t('cancel_drawing')
                            : parcelGeometry
                              ? t('redraw_parcel')
                              : t('draw_parcel')}
                    </calcite-button>

                    <calcite-button
                        scale="s"
                        appearance="outline"
                        kind="neutral"
                        icon-start="upload-to"
                        onClick={() => {
                            fileInputRef.current?.click();
                        }}
                    >
                        {t('upload_parcel')}
                    </calcite-button>

                    {/* hidden because the calcite button above is the visible control */}
                    <input
                        ref={fileInputRef}
                        type="file"
                        className="hidden"
                        accept={SUPPORTED_AOI_FILE_EXTENSIONS.join(',')}
                        onChange={handleAoiFileSelected}
                    />
                </div>

                {parcelGeometry ? (
                    <span className="text-xs">
                        {parcelAreaInHectares.toFixed(2)} {t('hectares')}
                    </span>
                ) : null}
            </div>

            {isDrawing ? (
                <p className="text-xs opacity-70 mb-3">
                    {t('draw_parcel_hint')}
                </p>
            ) : null}

            <div className="flex items-center justify-between mb-2">
                <span className="text-xs uppercase mr-2">{t('indices')}</span>
                <div className="flex-grow">
                    <Dropdown
                        data={indexDropdownData}
                        selectionMode="multiple"
                        title={t('indices_selected', {
                            count: selectedIndices.length,
                        })}
                        onChange={handleIndexToggled}
                    />
                </div>
            </div>

            <div className="flex items-center justify-between mb-2">
                <span className="text-xs uppercase mr-2">{t('from')}</span>
                <div className="flex-grow">
                    <Dropdown
                        data={getYearDropdownData(startYear)}
                        onChange={(value) => {
                            dispatch(startYear4ParcelToolChanged(+value));
                        }}
                    />
                </div>
            </div>

            <div className="flex items-center justify-between mb-2">
                <span className="text-xs uppercase mr-2">{t('to')}</span>
                <div className="flex-grow">
                    <Dropdown
                        data={getYearDropdownData(endYear)}
                        onChange={(value) => {
                            dispatch(endYear4ParcelToolChanged(+value));
                        }}
                    />
                </div>
            </div>

            <div className="flex items-center justify-between mb-3">
                <span className="text-xs uppercase mr-2">{t('clouds')}</span>
                <div className="flex-grow">
                    <Dropdown
                        data={cloudCoverDropdownData}
                        onChange={(value) => {
                            dispatch(maxCloudCover4ParcelToolChanged(+value));
                        }}
                    />
                </div>
            </div>

            <div className="flex items-center gap-2">
                <calcite-button
                    scale="s"
                    width="full"
                    disabled={!parcelGeometry || loading ? true : undefined}
                    loading={loading ? true : undefined}
                    onClick={() => {
                        dispatch(
                            extractParcelIndexReport(
                                Polygon.fromJSON(parcelGeometry)
                            )
                        );
                    }}
                >
                    {t('extract_indices')}
                </calcite-button>

                <calcite-button
                    scale="s"
                    width="full"
                    appearance="outline"
                    kind="neutral"
                    icon-start="download"
                    disabled={
                        !data.length || loading || !selectedIndices.length
                            ? true
                            : undefined
                    }
                    onClick={handleDownloadCsv}
                >
                    {t('donwload_as_csv')}
                </calcite-button>

                {/*
                    Only offered when embedded. A sandboxed iframe blocks downloads unless the
                    embedding page sets allow-downloads, which this app cannot influence, so the
                    clipboard is the one route out that a sandbox does not close.
                */}
                {isEmbedded ? (
                    <calcite-button
                        scale="s"
                        width="full"
                        appearance="outline"
                        kind="neutral"
                        icon-start="copy-to-clipboard"
                        disabled={
                            !data.length || loading || !selectedIndices.length
                                ? true
                                : undefined
                        }
                        onClick={handleCopyCsv}
                    >
                        {t('copy_as_csv')}
                    </calcite-button>
                ) : null}
            </div>

            {isEmbedded && data.length ? (
                <p className="mt-2 text-xs opacity-70">
                    {t('embedded_download_hint')}
                </p>
            ) : null}

            <div className="mt-2 text-xs text-center opacity-70">
                {copyStatus !== 'idle' ? (
                    <span className="text-custom-light-blue">
                        {copyStatus === 'copied'
                            ? t('csv_copied')
                            : t('csv_copy_failed')}
                    </span>
                ) : loading ? (
                    <span>
                        {t('sampling_scenes', {
                            processed: countOfProcessedScenes,
                            total: countOfScenes2Process,
                        })}
                    </span>
                ) : error ? (
                    <span className="text-custom-light-blue">{error}</span>
                ) : data.length ? (
                    <span>{t('scenes_in_report', { count: data.length })}</span>
                ) : parcelGeometry ? null : (
                    <span>{t('draw_parcel_to_start')}</span>
                )}
            </div>
        </div>
    );
};
