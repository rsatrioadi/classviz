import {
	aggregateLayers,
	homogenizeDepthsOptimized,
	setParents,
	setStyleClasses,
	shortenRoots,
	adoptOrphans,
	removePrimitives,
	collectRoleStereotypes,
} from '../graphProcessing/headlessTransformations.js';
import {
	adjustEdgeWidths,
	cacheNodeStyles,
	liftEdges,
	recolorContainers,
	removeContainmentEdges,
	removeExtraNodes,
	setLayerStyles,
	setRsStyles,
} from '../graphProcessing/visualTransformations.js';
import { edgeHasLabel, nodeHasLabel } from '../utilities/utils.js';
import { deriveLayerModel, defaultRoleStereotypeModel } from './pure.js';
import { lens, over, pipe, tap } from '../composing.js';

const colorMapStyleLayerLens = lens(
	(state) => state.colorMap.style_layer,
	(value, state) => ({
		...state,
		colorMap: {
			...state.colorMap,
			style_layer: value,
		},
	})
);

const colorOrderStyleLayerLens = lens(
	(state) => state.colorOrder.style_layer,
	(value, state) => ({
		...state,
		colorOrder: {
			...state.colorOrder,
			style_layer: value,
		},
	})
);

const colorMapStyleRsLens = lens(
	(state) => state.colorMap.style_rs,
	(value, state) => ({
		...state,
		colorMap: {
			...state.colorMap,
			style_rs: value,
		},
	})
);

const colorOrderStyleRsLens = lens(
	(state) => state.colorOrder.style_rs,
	(value, state) => ({
		...state,
		colorOrder: {
			...state.colorOrder,
			style_rs: value,
		},
	})
);

const stageHomogenizeDepths = tap(({ cy }) => {
	homogenizeDepthsOptimized(
		cy,
		(e) => edgeHasLabel(e, 'encloses'),
		(n) => nodeHasLabel(n, 'Scope'),
		(n) => nodeHasLabel(n, 'Type')
	);
});

const stageShortenRoots = tap(({ cy }) => shortenRoots(cy));
const stageRemovePrimitives = tap(({ cy }) => removePrimitives(cy));
const stageAdoptOrphans = tap(({ cy }) => adoptOrphans(cy));
const stageCollectRoleStereotypes = tap(({ cy }) => collectRoleStereotypes(cy));
const stageSetParents = tap(({ cy, state }) => setParents(cy, state.parentRel, false));
const stageSetStyleClasses = tap(({ cy }) => setStyleClasses(cy));
const stageAggregateLayers = tap(({ cy }) => aggregateLayers(cy));

const stageRecolorContainers = tap(({ cy }) => recolorContainers(cy));
const stageCacheNodeStyles = tap(({ cy }) => cacheNodeStyles(cy));
const stageLiftCallsOnce = tap(({ cy }) => liftEdges(cy, 'calls'));
const stageLiftConstructsOnce = tap(({ cy }) => liftEdges(cy, 'constructs'));
const stageRemoveContainmentEdges = tap(({ cy }) => removeContainmentEdges(cy));
const stageAdjustEdgeWidths = tap(({ cy }) => adjustEdgeWidths(cy));

const stageBuildLayerState = tap(({ cy, state }) => {
	const layerModel = deriveLayerModel(cy.json().elements);
	state.layers = layerModel.layers;
	state.layerColors = layerModel.layerColors;
	Object.assign(state, over(colorMapStyleLayerLens, () => state.layerColors, state));
	Object.assign(state, over(colorOrderStyleLayerLens, () => state.layers, state));
});

const stageBuildRoleStereotypeState = tap(({ state }) => {
	const rsModel = defaultRoleStereotypeModel();
	Object.assign(state, over(colorMapStyleRsLens, () => rsModel.colors, state));
	Object.assign(state, over(colorOrderStyleRsLens, () => rsModel.order, state));
});

const stageSetLayerStyles = tap(({ cy, state }) => setLayerStyles(cy, state.layers, state.layerColors));
const stageSetRsStyles = tap(({ cy }) => setRsStyles(cy));
const stageRemoveExtraNodes = tap(({ cy }) => removeExtraNodes(cy));

export function createHeadlessPipeline({ state }) {
	const pipeline = pipe(
		stageHomogenizeDepths,
		stageShortenRoots,
		stageRemovePrimitives,
		stageAdoptOrphans,
		stageCollectRoleStereotypes,
		stageSetParents,
		stageSetStyleClasses,
		stageAggregateLayers
	);
	return (ctx) => pipeline({ ...ctx, state });
}

export function createVisualPipeline({ state }) {
	const pipeline = pipe(
		stageRecolorContainers,
		stageCacheNodeStyles,
		stageLiftCallsOnce,
		stageLiftCallsOnce,
		stageLiftConstructsOnce,
		stageLiftConstructsOnce,
		stageRemoveContainmentEdges,
		stageAdjustEdgeWidths,
		stageBuildLayerState,
		stageBuildRoleStereotypeState,
		stageSetLayerStyles,
		stageSetRsStyles,
		stageRemoveExtraNodes
	);
	return (ctx) => pipeline({ ...ctx, state });
}

export function runHeadlessPipeline(headlessCy, state) {
	return createHeadlessPipeline({ state })({ cy: headlessCy });
}

export function runVisualPipeline(cy, state) {
	return createVisualPipeline({ state })({ cy });
}
