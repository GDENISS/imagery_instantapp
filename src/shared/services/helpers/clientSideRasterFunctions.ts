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

import RasterFunction from '@arcgis/core/layers/support/RasterFunction';

/**
 * A rendering rule, expressed as a raster function chain.
 *
 * Nested functions use the `rasterFunction`/`rasterFunctionArguments` property names, which is the shape
 * the image service expects for the `renderingRule` parameter of its `exportImage` operation.
 *
 * @see https://developers.arcgis.com/rest/services-reference/enterprise/raster-function-objects/
 */
export type RenderingRule = {
    rasterFunction: string;
    rasterFunctionArguments?: Record<string, any>;
    outputPixelType?: string;
};

/**
 * A renderer that the app assembles itself rather than referencing by name from the image service.
 *
 * Most renderers in these apps are just the name of a raster function template that the image service
 * already publishes. When a rendering is wanted that the service has no template for, the whole raster
 * function chain is sent with every request instead, and the service evaluates it on the fly.
 */
export type ClientSideRasterFunction = {
    /**
     * Unique name of the renderer. This is what gets persisted in the URL hash and compared against the
     * selected renderer, so it has to be unique across every renderer the app offers.
     */
    name: string;
    /**
     * The raster function chain that produces the rendering.
     */
    renderingRule: RenderingRule;
    /**
     * Data URI or URL of the thumbnail shown in the renderer grid.
     */
    thumbnail?: string;
    /**
     * Data URI or URL of the legend shown in the renderer tooltip.
     */
    legend?: string;
};

/**
 * Registry of every client side renderer across the Imagery Explorer apps, keyed by renderer name.
 *
 * Renderer names are unique app-wide, so a single flat registry is enough and saves each consumer from
 * having to know which imagery service a given renderer belongs to.
 */
const clientSideRasterFunctionByName: Map<string, ClientSideRasterFunction> =
    new Map();

/**
 * Registers client side renderers so that the imagery layer and the animation frame export can resolve
 * them by name.
 *
 * This is called at module load time by the service config that owns the renderers.
 */
export const registerClientSideRasterFunctions = (
    rasterFunctions: ClientSideRasterFunction[]
): void => {
    for (const rasterFunction of rasterFunctions) {
        clientSideRasterFunctionByName.set(rasterFunction.name, rasterFunction);
    }
};

/**
 * Looks up a client side renderer by name.
 *
 * @param name name of the selected renderer
 * @returns the renderer, or undefined when the name refers to a raster function template published by
 * the image service, which is the common case.
 */
export const getClientSideRasterFunction = (
    name: string
): ClientSideRasterFunction => {
    if (!name) {
        return undefined;
    }

    return clientSideRasterFunctionByName.get(name);
};

/**
 * Resolves the selected renderer name into the `renderingRule` parameter of an `exportImage` request.
 *
 * @param name name of the selected renderer
 * @returns the full raster function chain for a client side renderer, or a rendering rule that just
 * references the raster function template by name.
 */
export const getRenderingRule4RasterFunctionName = (
    name: string
): RenderingRule => {
    const clientSideRasterFunction = getClientSideRasterFunction(name);

    if (clientSideRasterFunction) {
        return clientSideRasterFunction.renderingRule;
    }

    return { rasterFunction: name };
};

/**
 * Resolves the selected renderer name into the `rasterFunction` property of an `ImageryLayer`.
 *
 * The ArcGIS Maps SDK expects the outermost function of the chain to use the
 * `functionName`/`functionArguments` property names, while the nested functions keep the
 * `rasterFunction`/`rasterFunctionArguments` names used by the REST API.
 *
 * @param name name of the selected renderer
 * @returns a `RasterFunction` for the imagery layer.
 */
export const getRasterFunction4RasterFunctionName = (
    name: string
): RasterFunction => {
    const clientSideRasterFunction = getClientSideRasterFunction(name);

    if (!clientSideRasterFunction) {
        return new RasterFunction({
            functionName: name,
        });
    }

    const { rasterFunction, rasterFunctionArguments, outputPixelType } =
        clientSideRasterFunction.renderingRule;

    return new RasterFunction({
        functionName: rasterFunction,
        functionArguments: rasterFunctionArguments,
        // the SDK expects a lowercase pixel type, whereas the REST API uses uppercase
        outputPixelType: (outputPixelType?.toLowerCase() ||
            'u8') as RasterFunction['outputPixelType'],
    });
};
