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
import {
	addScratch,
	counterToPercentage,
	cumulative,
	edgeHasLabel,
	isPureContainer,
	nodeHasLabel,
	repeatMiddle,
} from '../utilities/utils.js';
import { deriveColoringModes } from './pure.js';
import { hslString, whiten } from '../utilities/colors.js';
import { pipe, tap } from '../composing.js';

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

// Deprecated legacy/manual path. Keep these stage wrappers for quick rollback only.
const stageSetLayerStyles = tap(({ cy, state }) => setLayerStyles(cy, state.layers, state.layerColors));
const stageSetRsStyles = tap(({ cy }) => setRsStyles(cy));

function hasAnyLabel(node, labels) {
	for (const label of labels || []) {
		if (nodeHasLabel(node, label)) return true;
	}
	return false;
}

function addCategoryCount(counterMap, nodeId, categoryName) {
	if (!counterMap.has(nodeId)) counterMap.set(nodeId, {});
	const counter = counterMap.get(nodeId);
	counter[categoryName] = (counter[categoryName] || 0) + 1;
}

function buildModeCounters(cy, mode) {
	const counters = new Map();
	const sourceKind = mode.aggregationPath?.[0] || mode.appliesTo?.[0] || null;
	const shouldAggregate = mode.strategy === 'aggregate' || mode.strategy === 'hybrid';
	const shouldDirect = mode.strategy === 'direct' || mode.strategy === 'hybrid';

	cy.nodes().forEach((node) => {
		const value = mode.applyToNode(node.data());
		if (!value) return;
		const hasClassification = mode.hasNodeClassification ? mode.hasNodeClassification(node.data()) : true;

		const matchesApplyKinds = hasAnyLabel(node, mode.appliesTo);
		const matchesSourceKind = sourceKind ? nodeHasLabel(node, sourceKind) : matchesApplyKinds;

		if (shouldDirect && matchesApplyKinds) {
			addCategoryCount(counters, node.id(), value);
		}

		if (shouldAggregate && matchesSourceKind && hasClassification) {
			addCategoryCount(counters, node.id(), value);
			node.ancestors().forEach((ancestor) => {
				if (hasAnyLabel(ancestor, mode.aggregationPath?.slice(1) || [])) {
					addCategoryCount(counters, ancestor.id(), value);
				}
			});
		}
	});

	return counters;
}

function buildTypeLayerCounters(cy, layerMode) {
	const countersByType = new Map();

	cy.nodes('.Type').forEach((typeNode) => {
		const methods = typeNode
			.outgoers((e) => edgeHasLabel(e, 'encapsulates'))
			.targets((n) => nodeHasLabel(n, 'Operation'));
		const counter = {};

		methods.forEach((methodNode) => {
			const data = methodNode.data();
			const explicit = layerMode.hasNodeClassification ? layerMode.hasNodeClassification(data) : true;
			if (!explicit) return;
			const layerName = layerMode.applyToNode(data);
			if (!layerName) return;
			counter[layerName] = (counter[layerName] || 0) + 1;
		});

		if (Object.keys(counter).length > 0) {
			countersByType.set(typeNode.id(), counter);
		}
	});

	return countersByType;
}

function buildScopeLayerCounters(cy, countersByType) {
	const countersByScope = new Map();
	cy.nodes('.Scope').forEach((scopeNode) => {
		// Containment edges are removed in visual pipeline; rely on parent hierarchy.
		const typeChildren = scopeNode.descendants((n) => nodeHasLabel(n, 'Type'));
		const classPercentages = [];

		typeChildren.forEach((typeNode) => {
			const counter = countersByType.get(typeNode.id());
			if (!counter) return;
			classPercentages.push(counterToPercentage(counter));
		});

		if (classPercentages.length === 0) return;
		const merged = {};
		for (const percentages of classPercentages) {
			for (const [name, value] of Object.entries(percentages)) {
				merged[name] = (merged[name] || 0) + value;
			}
		}
		countersByScope.set(scopeNode.id(), merged);
	});

	return countersByScope;
}

function applyModeStyles(cy, mode, counters, colorMap, colorOrder) {
	const order = colorOrder[mode.scratchKey] || [];
	const colors = colorMap[mode.scratchKey] || {};
	if (order.length === 0) return;

	const fallbackName = mode.defaultCategory || order[0];
	const fallbackColor = colors[fallbackName] || { h: 0, s: 0, l: 0.9 };

	cy.nodes('.Scope, .Type, .Operation, .Variable').forEach((node) => {
		const counter = counters.get(node.id());
		if (!counter || Object.keys(counter).length === 0) return;

		const percentages = counterToPercentage(counter);
		const ranked = [...Object.keys(percentages)].sort((a, b) => {
			const d = percentages[b] - percentages[a];
			if (d !== 0) return d;
			return order.indexOf(a) - order.indexOf(b);
		});
		const dominant = ranked[0] || fallbackName;
		const baseColor = colors[dominant] || fallbackColor;

		if (mode.containerColorMode === 'gradient' && ranked.length > 1 && (isPureContainer(node) || nodeHasLabel(node, 'Type'))) {
			const gradientStops = order.map((name) => Math.floor((percentages[name] || 0) * 100));
			addScratch(node, mode.scratchKey, {
				'border-color': 'grey',
				'background-fill': 'linear-gradient',
				'background-gradient-direction': isPureContainer(node) ? 'to-bottom-right' : 'to-right',
				'background-gradient-stop-positions': repeatMiddle(cumulative(gradientStops)).map((p) => `${p}`).join(' '),
				'background-gradient-stop-colors': order.map((name) => colors[name] || fallbackColor).map((c) => hslString(whiten(c, isPureContainer(node) ? 0.8 : 0.65))).map((c) => `${c} ${c}`).join(' '),
			});
			return;
		}

		addScratch(node, mode.scratchKey, {
			'border-color': isPureContainer(node) ? 'grey' : hslString(baseColor),
			'background-fill': 'solid',
			'background-color': hslString(whiten(baseColor, isPureContainer(node) ? 0.8 : 0.65)),
		});
	});
}

function buildMethodListScratch(cy, layerMode, layerOrder, layerColors) {
	const fallbackColor = { h: 0, s: 0, l: 0.9 };
	cy.nodes('.Type').forEach((typeNode) => {
		const methods = typeNode
			.outgoers((e) => edgeHasLabel(e, 'encapsulates'))
			.targets((n) => nodeHasLabel(n, 'Operation'))
			.map((methodNode) => {
				const data = methodNode.data();
				const layerName = layerMode ? layerMode.applyToNode(data) : null;
				return {
					...data,
					color: layerColors[layerName] || fallbackColor,
				};
			});

		methods.sort((a, b) => (a.properties?.simpleName || '').localeCompare(b.properties?.simpleName || ''));
		if (layerMode && layerOrder.length > 0) {
			methods.sort((a, b) => layerOrder.indexOf(layerMode.applyToNode(a)) - layerOrder.indexOf(layerMode.applyToNode(b)));
		}
		addScratch(typeNode, 'methods', methods);
	});
}

const stageApplyLayerModeLegacy = tap(({ cy, state }) => {
	const layerMode = (state.coloringModes || []).find((mode) => mode.scratchKey === 'style_layer');
	const layerOrder = layerMode ? (state.colorOrder.style_layer || []) : [];
	const layerColors = layerMode ? (state.colorMap.style_layer || {}) : {};
	if (!layerMode || layerOrder.length === 0) {
		buildMethodListScratch(cy, layerMode, layerOrder, layerColors);
		return;
	}

	const typeCounters = buildTypeLayerCounters(cy, layerMode);
	const scopeCounters = buildScopeLayerCounters(cy, typeCounters);
	applyModeStyles(cy, layerMode, typeCounters, state.colorMap, state.colorOrder);
	applyModeStyles(cy, layerMode, scopeCounters, state.colorMap, state.colorOrder);
	buildMethodListScratch(cy, layerMode, layerOrder, layerColors);
});

const stageBuildColoringRegistry = tap(({ cy, state }) => {
	const modes = deriveColoringModes(state.coloringMeta || { nodes: [], edges: [] });
	state.coloringModes = modes.map((mode) => ({
		id: mode.id,
		label: mode.label,
		scratchKey: mode.scratchKey,
		enabled: true,
		source: mode.dimensionId ? 'dimension' : 'fallback',
		strategy: mode.strategy,
		appliesTo: mode.appliesTo,
		aggregationPath: mode.aggregationPath,
		containerColorMode: mode.containerColorMode,
		defaultCategory: mode.defaultCategory,
		applyToNode: mode.applyToNode,
	}));

	for (const mode of modes) {
		state.colorMap[mode.scratchKey] = mode.legendColors || {};
		state.colorOrder[mode.scratchKey] = mode.legendOrder || [];
	}

	for (const mode of state.coloringModes) {
		if (mode.scratchKey === 'style_default') continue;
		if (mode.scratchKey === 'style_layer') continue;
		const counters = buildModeCounters(cy, mode);
		applyModeStyles(cy, mode, counters, state.colorMap, state.colorOrder);
	}
});

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
		// stageSetLayerStyles,
		// stageSetRsStyles,
		stageBuildColoringRegistry,
		stageApplyLayerModeLegacy,
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
