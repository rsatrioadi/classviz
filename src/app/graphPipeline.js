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

export function runHeadlessPipeline(headlessCy, state) {
	homogenizeDepthsOptimized(
		headlessCy,
		(e) => edgeHasLabel(e, 'encloses'),
		(n) => nodeHasLabel(n, 'Scope'),
		(n) => nodeHasLabel(n, 'Type')
	);
	shortenRoots(headlessCy);
	removePrimitives(headlessCy);
	adoptOrphans(headlessCy);
	collectRoleStereotypes(headlessCy);
	setParents(headlessCy, state.parentRel, false);
	setStyleClasses(headlessCy);
	aggregateLayers(headlessCy);
}

export function runVisualPipeline(cy, state) {
	recolorContainers(cy);
	cacheNodeStyles(cy);
	liftEdges(cy, 'calls');
	liftEdges(cy, 'calls');
	liftEdges(cy, 'constructs');
	liftEdges(cy, 'constructs');
	removeContainmentEdges(cy);
	adjustEdgeWidths(cy);

	const layerModel = deriveLayerModel(cy.json().elements);
	state.layers = layerModel.layers;
	state.layerColors = layerModel.layerColors;
	state.colorMap.style_layer = state.layerColors;
	state.colorOrder.style_layer = state.layers;

	const rsModel = defaultRoleStereotypeModel();
	state.colorMap.style_rs = rsModel.colors;
	state.colorOrder.style_rs = rsModel.order;

	setLayerStyles(cy, state.layers, state.layerColors);
	setRsStyles(cy);
	removeExtraNodes(cy);
}
