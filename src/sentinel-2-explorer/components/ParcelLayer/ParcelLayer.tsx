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

import React, { FC, useEffect, useRef } from 'react';
import MapView from '@arcgis/core/views/MapView';
import GroupLayer from '@arcgis/core/layers/GroupLayer';
import GraphicsLayer from '@arcgis/core/layers/GraphicsLayer';
import Graphic from '@arcgis/core/Graphic';
import Polygon from '@arcgis/core/geometry/Polygon';
import SketchViewModel from '@arcgis/core/widgets/Sketch/SketchViewModel';
import * as geometryEngine from '@arcgis/core/geometry/geometryEngine';
import { useAppDispatch, useAppSelector } from '@shared/store/configureStore';
import {
    isDrawingParcelToggled,
    parcelGeometryChanged,
} from '@shared/store/ParcelTool/reducer';
import {
    selectIsDrawingParcel,
    selectParcelGeometry,
} from '@shared/store/ParcelTool/selectors';
import { selectActiveAnalysisTool } from '@shared/store/ImageryScene/selectors';

type Props = {
    mapView?: MapView;
    groupLayer?: GroupLayer;
};

/**
 * Symbol of the drawn parcel. It is deliberately mostly transparent so the imagery and any index
 * rendering stay readable underneath the outline.
 */
const PARCEL_SYMBOL = {
    type: 'simple-fill' as const,
    color: [0, 0, 0, 0.08],
    outline: {
        color: [255, 255, 0, 1],
        width: 2,
    },
};

/**
 * Computes the area of the parcel in hectares.
 *
 * Geodesic area is used rather than planar area because web mercator badly overstates area away from
 * the equator, which would be misleading for a parcel anywhere outside the tropics.
 */
const getAreaInHectares = (polygon: Polygon): number => {
    try {
        return Math.abs(geometryEngine.geodesicArea(polygon, 'hectares'));
    } catch (err) {
        console.error('failed to compute parcel area', err);
        return 0;
    }
};

/**
 * Hosts the graphics layer that the parcel is drawn into, and the sketch view model that digitizes it.
 */
export const ParcelLayer: FC<Props> = ({ mapView, groupLayer }) => {
    const dispatch = useAppDispatch();

    const analysisTool = useAppSelector(selectActiveAnalysisTool);

    const isDrawing = useAppSelector(selectIsDrawingParcel);

    const parcelGeometry = useAppSelector(selectParcelGeometry);

    const graphicsLayerRef = useRef<GraphicsLayer>(null);

    const sketchViewModelRef = useRef<SketchViewModel>(null);

    useEffect(() => {
        if (!mapView || !groupLayer || graphicsLayerRef.current) {
            return;
        }

        graphicsLayerRef.current = new GraphicsLayer();

        groupLayer.add(graphicsLayerRef.current);

        sketchViewModelRef.current = new SketchViewModel({
            view: mapView,
            layer: graphicsLayerRef.current,
            polygonSymbol: PARCEL_SYMBOL as any,
            defaultCreateOptions: {
                // vertices are placed on click and the parcel is committed on double click
                mode: 'click',
            },
        } as any);

        sketchViewModelRef.current.on('create', (event) => {
            if (event.state !== 'complete') {
                return;
            }

            const polygon = event.graphic?.geometry as Polygon;

            if (!polygon) {
                dispatch(isDrawingParcelToggled(false));
                return;
            }

            // only one parcel is reported on at a time, so anything drawn earlier is discarded
            const graphics = graphicsLayerRef.current.graphics.toArray();

            for (const graphic of graphics) {
                if (graphic !== event.graphic) {
                    graphicsLayerRef.current.remove(graphic);
                }
            }

            dispatch(
                parcelGeometryChanged({
                    geometry: polygon.toJSON(),
                    areaInHectares: getAreaInHectares(polygon),
                })
            );
        });

        return () => {
            sketchViewModelRef.current?.destroy();
            sketchViewModelRef.current = null;
        };
    }, [mapView, groupLayer]);

    // start or cancel digitizing when the user toggles the draw button in the tool panel
    useEffect(() => {
        const sketchViewModel = sketchViewModelRef.current;

        if (!sketchViewModel) {
            return;
        }

        if (isDrawing) {
            graphicsLayerRef.current.removeAll();
            sketchViewModel.create('polygon');
        } else if (sketchViewModel.state === 'active') {
            sketchViewModel.cancel();
        }
    }, [isDrawing]);

    // clear the drawn graphic when the parcel is cleared from the tool panel
    useEffect(() => {
        if (!graphicsLayerRef.current) {
            return;
        }

        if (!parcelGeometry) {
            graphicsLayerRef.current.removeAll();
            return;
        }

        // redraw when the parcel came from somewhere other than the sketch, so the map always reflects
        // the parcel currently held in the store
        if (!graphicsLayerRef.current.graphics.length) {
            const polygon = Polygon.fromJSON(parcelGeometry);

            graphicsLayerRef.current.add(
                new Graphic({
                    geometry: polygon,
                    symbol: PARCEL_SYMBOL as any,
                })
            );

            // An uploaded parcel is usually nowhere near wherever the map happens to be looking, so
            // bring it into view. A drawn parcel never reaches this branch, because the sketch has
            // already added its own graphic, and zooming out from under the user would be jarring.
            mapView?.goTo(polygon.extent.expand(1.5)).catch((err) => {
                // goTo rejects when the user interrupts the animation, which is not a failure
                if (err?.name !== 'AbortError') {
                    console.error('failed to zoom to the parcel', err);
                }
            });
        }
    }, [parcelGeometry]);

    // the parcel is only relevant while its own tool is open
    useEffect(() => {
        if (!graphicsLayerRef.current) {
            return;
        }

        graphicsLayerRef.current.visible = analysisTool === 'parcel';
    }, [analysisTool]);

    return null;
};
