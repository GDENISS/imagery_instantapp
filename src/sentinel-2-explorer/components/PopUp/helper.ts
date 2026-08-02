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
import { getPopUpContentWithLocationInfo } from '@shared/components/MapPopup/helper';
import { calcSentinel2SpectralIndex } from '@shared/services/sentinel-2/helpers';

export const getMainContent = (values: number[], mapPoint: Point) => {
    const vegetationIndex = calcSentinel2SpectralIndex(
        'vegetation',
        values
    ).toFixed(3);

    const waterIndex = calcSentinel2SpectralIndex('water', values).toFixed(3);

    const moistureIndex = calcSentinel2SpectralIndex(
        'moisture',
        values
    ).toFixed(3);

    const eviIndex = calcSentinel2SpectralIndex('evi', values).toFixed(3);

    const saviIndex = calcSentinel2SpectralIndex('savi', values).toFixed(3);

    const msaviIndex = calcSentinel2SpectralIndex('msavi', values).toFixed(3);

    const ndreIndex = calcSentinel2SpectralIndex('ndre', values).toFixed(3);

    const ndciIndex = calcSentinel2SpectralIndex('ndci', values).toFixed(3);

    // const content = `
    //     <div class='text-custom-light-blue text-xs'
    //         data-testid='sentinel-2-popup-content'
    //         data-sentinel-2-ndmi="${moistureIndex}"
    //         data-sentinel-2-ndvi="${vegetationIndex}"
    //         data-sentinel-2-mndwi="${waterIndex}"
    //     >
    //         <div class='mb-2'>
    //             <span><span class='text-custom-light-blue-50'>NDMI:</span> ${moistureIndex}</span><br />
    //             <span><span class='text-custom-light-blue-50'>NDVI:</span> ${vegetationIndex}</span><br />
    //             <span><span class='text-custom-light-blue-50'>MNDWI:</span> ${waterIndex}</span>
    //         </div>
    //     </div>
    // `;

    const content = `
        <div style='color: var(--custom-light-blue); font-size: 0.75rem; line-height: 1rem;'
            data-testid='sentinel-2-popup-content'
            data-sentinel-2-ndmi="${moistureIndex}"
            data-sentinel-2-ndvi="${vegetationIndex}"
            data-sentinel-2-mndwi="${waterIndex}"
            data-sentinel-2-evi="${eviIndex}"
            data-sentinel-2-savi="${saviIndex}"
            data-sentinel-2-msavi="${msaviIndex}"
            data-sentinel-2-ndre="${ndreIndex}"
            data-sentinel-2-ndci="${ndciIndex}"
        >
            <div style='margin-bottom: 0.5rem;'>
                <span><span style='color: var(--custom-light-blue-50);'>NDMI:</span> ${moistureIndex}</span><br />
                <span><span style='color: var(--custom-light-blue-50);'>NDVI:</span> ${vegetationIndex}</span><br />
                <span><span style='color: var(--custom-light-blue-50);'>MNDWI:</span> ${waterIndex}</span><br />
                <span><span style='color: var(--custom-light-blue-50);'>EVI:</span> ${eviIndex}</span><br />
                <span><span style='color: var(--custom-light-blue-50);'>SAVI:</span> ${saviIndex}</span><br />
                <span><span style='color: var(--custom-light-blue-50);'>MSAVI2:</span> ${msaviIndex}</span><br />
                <span><span style='color: var(--custom-light-blue-50);'>NDRE:</span> ${ndreIndex}</span><br />
                <span><span style='color: var(--custom-light-blue-50);'>NDCI:</span> ${ndciIndex}</span>
            </div>
        </div>
    `;
    return getPopUpContentWithLocationInfo(mapPoint, content);
};
