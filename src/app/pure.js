import { layerColorsFrom, roleStereotypeColors, roleStereotypeOrder } from '../utilities/colors.js';
import { composeT, filterT, mapT, reduce } from '../composing.js';

function toSimpleName(nodeData) {
	return nodeData?.properties?.simpleName || 'Undefined';
}

function toSlug(text) {
	return String(text || '')
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, '_')
		.replace(/^_+|_+$/g, '') || 'dimension';
}

function hasLabel(nodeData, label) {
	return Array.isArray(nodeData?.labels) && nodeData.labels.includes(label);
}

function isLayerCategory(nodeData) {
	return hasLabel(nodeData, 'Category') && nodeData?.properties?.kind === 'architectural layer';
}

function parseNumberOrNull(value) {
	if (typeof value === 'number' && Number.isFinite(value)) return value;
	if (typeof value === 'string' && value.trim() !== '' && Number.isFinite(Number(value))) return Number(value);
	return null;
}

function topologicalOrder(nodes, edges, fallbackSort) {
	const inDegree = new Map();
	const outgoing = new Map();
	nodes.forEach((n) => {
		inDegree.set(n.id, 0);
		outgoing.set(n.id, []);
	});

	edges.forEach(({ source, target }) => {
		if (!inDegree.has(source) || !inDegree.has(target)) return;
		outgoing.get(source).push(target);
		inDegree.set(target, inDegree.get(target) + 1);
	});

	const ready = nodes.filter((n) => inDegree.get(n.id) === 0).sort(fallbackSort);
	const ordered = [];

	while (ready.length > 0) {
		const next = ready.shift();
		ordered.push(next);
		for (const target of outgoing.get(next.id) || []) {
			inDegree.set(target, inDegree.get(target) - 1);
			if (inDegree.get(target) === 0) {
				const node = nodes.find((n) => n.id === target);
				if (node) {
					ready.push(node);
					ready.sort(fallbackSort);
				}
			}
		}
	}

	if (ordered.length !== nodes.length) {
		return {
			ordered: [...nodes].sort(fallbackSort),
			hasCycle: true,
		};
	}

	return {
		ordered,
		hasCycle: false,
	};
}

function pickDefaultCategoryName(categoryNodes) {
	const explicitDefault = categoryNodes.find((c) => c.properties?.isDefault === true);
	if (explicitDefault) return toSimpleName(explicitDefault);

	const undetermined = categoryNodes.find((c) => toSimpleName(c).toLowerCase() === 'undetermined');
	if (undetermined) return toSimpleName(undetermined);

	return toSimpleName(categoryNodes[0] || { properties: { simpleName: 'Undetermined' } });
}

function chooseCategoryName(weightsByName, orderedNames, defaultName) {
	if (weightsByName.size === 0) return defaultName;

	const orderedIndex = new Map(orderedNames.map((name, index) => [name, index]));
	const entries = [...weightsByName.entries()];
	entries.sort((a, b) => {
		const [nameA, weightA] = a;
		const [nameB, weightB] = b;
		if (weightB !== weightA) return weightB - weightA;
		if (nameA === defaultName && nameB !== defaultName) return -1;
		if (nameB === defaultName && nameA !== defaultName) return 1;
		return (orderedIndex.get(nameA) ?? Number.MAX_SAFE_INTEGER) - (orderedIndex.get(nameB) ?? Number.MAX_SAFE_INTEGER);
	});

	return entries[0][0];
}

function buildElementCategoryWeights(elements, categoryToDimension) {
	const perDimension = new Map();
	for (const edge of elements.edges || []) {
		if (edge.data?.label !== 'implements') continue;
		const categoryId = edge.data.target;
		const dimensionId = categoryToDimension.get(categoryId);
		if (!dimensionId) continue;

		if (!perDimension.has(dimensionId)) perDimension.set(dimensionId, new Map());
		const byElement = perDimension.get(dimensionId);
		const sourceId = edge.data.source;
		if (!byElement.has(sourceId)) byElement.set(sourceId, new Map());
		const byCategory = byElement.get(sourceId);
		const prev = byCategory.get(categoryId) || 0;
		const weight = Number(edge.data?.properties?.weight ?? 1);
		byCategory.set(categoryId, prev + (Number.isFinite(weight) ? weight : 1));
	}
	return perDimension;
}

function toDimensionModeId(dimensionName, dimensionKey) {
	const key = (dimensionKey || dimensionName || '').toLowerCase();
	if (key.includes('role') && key.includes('stereotype')) return 'style_rs';
	if (key.includes('architectural') && key.includes('layer')) return 'style_layer';
	return `style_dim_${toSlug(dimensionKey || dimensionName)}`;
}

function inferStrategy(appliesTo, explicitStrategy) {
	if (explicitStrategy && ['direct', 'aggregate', 'hybrid'].includes(explicitStrategy)) {
		return explicitStrategy;
	}
	const kinds = new Set(appliesTo);
	if (kinds.size === 1 && kinds.has('Type')) return 'direct';
	if (kinds.size === 1 && kinds.has('Operation')) return 'aggregate';
	if (kinds.size === 1 && kinds.has('Variable')) return 'aggregate';
	if (kinds.has('Operation') || kinds.has('Variable')) return 'hybrid';
	return 'direct';
}

function inferAggregationPath(appliesTo, explicitPath) {
	if (Array.isArray(explicitPath) && explicitPath.length > 0) return explicitPath;
	const kinds = new Set(appliesTo);
	if (kinds.has('Operation')) return ['Operation', 'Type', 'Scope'];
	if (kinds.has('Variable')) return ['Variable', 'Type', 'Scope'];
	return ['Type', 'Scope'];
}

function buildLegendColors(modeId, orderedCategoryNames, palette) {
	if (modeId === 'style_rs' || palette === 'roles') {
		const colors = {};
		orderedCategoryNames.forEach((name) => {
			colors[name] = roleStereotypeColors[name] || roleStereotypeColors['-'] || { h: 0, s: 0, l: 0.5 };
		});
		return colors;
	}
	return layerColorsFrom(orderedCategoryNames, orderedCategoryNames.filter((n) => n.toLowerCase() === 'undetermined'));
}

export function buildNodeIndex(elements) {
	const nodesById = new Map();
	for (const n of elements.nodes || []) {
		nodesById.set(n.data.id, n.data);
	}
	return nodesById;
}

export function deriveLayerModel(elements) {
	const nodesById = buildNodeIndex(elements);
	const succeedsIn = new Map();
	const succeedsOut = new Map();

	for (const edge of elements.edges || []) {
		if (edge.data.label !== 'succeeds') continue;
		if (!succeedsOut.has(edge.data.source)) succeedsOut.set(edge.data.source, []);
		if (!succeedsIn.has(edge.data.target)) succeedsIn.set(edge.data.target, []);
		succeedsOut.get(edge.data.source).push(edge.data.target);
		succeedsIn.get(edge.data.target).push(edge.data.source);
	}

	const isLayerNode = (id) => isLayerCategory(nodesById.get(id));
	const allLayerIds = [...nodesById.keys()].filter(isLayerNode);
	const topLayerIds = allLayerIds.filter((id) => !succeedsIn.get(id)?.length && (succeedsOut.get(id)?.length || 0) > 0);
	const orphanLayerIds = allLayerIds.filter((id) => !succeedsIn.get(id)?.length && !succeedsOut.get(id)?.length);

	const ordered = [];
	const visited = new Set();
	const queue = [...topLayerIds];

	while (queue.length > 0) {
		const id = queue.shift();
		if (visited.has(id)) continue;
		visited.add(id);
		ordered.push(toSimpleName(nodesById.get(id)));
		for (const next of succeedsOut.get(id) || []) {
			queue.push(next);
		}
	}

	for (const orphanId of orphanLayerIds) {
		ordered.push(toSimpleName(nodesById.get(orphanId)));
	}

	if (!ordered.includes('Undetermined')) {
		ordered.push('Undetermined');
	}

	const layers = ordered.filter(Boolean);
	const layerColors = layerColorsFrom(layers, ['Undetermined']);

	return {
		layers,
		layerColors,
	};
}

export function deriveColoringModes(elements) {
	const nodesById = buildNodeIndex(elements);
	const categoryNodes = (elements.nodes || []).map((n) => n.data).filter((node) => hasLabel(node, 'Category'));
	const dimensionNodes = (elements.nodes || []).map((n) => n.data).filter((node) => hasLabel(node, 'Dimension'));
	const edges = elements.edges || [];

	const categoriesByDimension = new Map();
	const categoryToDimension = new Map();

	for (const edge of edges) {
		if (edge.data?.label !== 'composes') continue;
		const source = nodesById.get(edge.data.source);
		const target = nodesById.get(edge.data.target);
		if (!source || !target) continue;
		if (!hasLabel(source, 'Category') || !hasLabel(target, 'Dimension')) continue;
		categoryToDimension.set(source.id, target.id);
		if (!categoriesByDimension.has(target.id)) categoriesByDimension.set(target.id, []);
		categoriesByDimension.get(target.id).push(source);
	}

	const elementCategoryWeightsByDimension = buildElementCategoryWeights(elements, categoryToDimension);
	const modes = [];

	for (const dim of dimensionNodes) {
		const dimCategories = categoriesByDimension.get(dim.id) || [];
		if (dimCategories.length === 0) continue;

		const dimCategoryIds = new Set(dimCategories.map((c) => c.id));
		const fallbackSort = (a, b) => {
			const orderA = parseNumberOrNull(a.properties?.order);
			const orderB = parseNumberOrNull(b.properties?.order);
			if (orderA !== null && orderB !== null && orderA !== orderB) return orderA - orderB;
			if (orderA !== null && orderB === null) return -1;
			if (orderA === null && orderB !== null) return 1;
			return toSimpleName(a).localeCompare(toSimpleName(b));
		};

		const succeedsEdges = edges
			.filter((edge) => edge.data?.label === 'succeeds')
			.filter((edge) => dimCategoryIds.has(edge.data.source) && dimCategoryIds.has(edge.data.target))
			.map((edge) => ({ source: edge.data.source, target: edge.data.target }));

		const { ordered: orderedCategories, hasCycle } = topologicalOrder(dimCategories, succeedsEdges, fallbackSort);
		if (hasCycle) {
			console.warn(`[coloring] Cycle detected in succeeds edges for dimension "${toSimpleName(dim)}"; falling back to order/name sort.`);
		}

		const orderedCategoryNames = orderedCategories.map((c) => toSimpleName(c));
		const categoryNameById = new Map(orderedCategories.map((c) => [c.id, toSimpleName(c)]));
		const defaultCategory = pickDefaultCategoryName(orderedCategories);
		const dimensionKey = dim.properties?.dimensionKey || toSlug(toSimpleName(dim));
		const modeId = toDimensionModeId(toSimpleName(dim), dimensionKey);
		const modeLabel = toSimpleName(dim);

		const appliesTo = new Set();
		for (const edge of edges) {
			if (edge.data?.label !== 'implements') continue;
			if (!dimCategoryIds.has(edge.data.target)) continue;
			const sourceNode = nodesById.get(edge.data.source);
			if (!sourceNode) continue;
			for (const label of ['Scope', 'Type', 'Operation', 'Variable']) {
				if (hasLabel(sourceNode, label)) appliesTo.add(label);
			}
		}

		const explicitAppliesTo = Array.isArray(dim.properties?.appliesTo) ? dim.properties.appliesTo : null;
		const appliesToKinds = explicitAppliesTo && explicitAppliesTo.length > 0 ? explicitAppliesTo : [...appliesTo];
		const strategy = inferStrategy(appliesToKinds, dim.properties?.coloringStrategy);
		const aggregationPath = inferAggregationPath(appliesToKinds, dim.properties?.aggregationPath);
		const palette = dim.properties?.palette || (String(dim.properties?.kind || '').includes('ordered') ? 'sequential' : 'categorical');
		const legendColors = buildLegendColors(modeId, orderedCategoryNames, palette);

		const perElementCategoryWeights = elementCategoryWeightsByDimension.get(dim.id) || new Map();

			modes.push({
			id: modeId,
			label: modeLabel,
			scratchKey: modeId,
			dimensionId: dim.id,
			dimensionKey,
			strategy,
			palette,
			appliesTo: appliesToKinds,
			aggregationPath,
			containerColorMode: modeId === 'style_layer' ? 'gradient' : 'majority',
			legendOrder: orderedCategoryNames,
			legendColors,
				defaultCategory,
				categoryNameById,
				hasNodeClassification(nodeData) {
					return perElementCategoryWeights.has(nodeData.id);
				},
				applyToNode(nodeData) {
					const byCategory = perElementCategoryWeights.get(nodeData.id);
					if (!byCategory || byCategory.size === 0) return null;
					const byName = new Map();
					for (const [categoryId, weight] of byCategory.entries()) {
						const name = categoryNameById.get(categoryId);
						if (!name) continue;
						byName.set(name, (byName.get(name) || 0) + weight);
					}
					if (byName.size === 0) return null;
					return chooseCategoryName(byName, orderedCategoryNames, defaultCategory);
				},
			});
		}

	return [{
		id: 'style_default',
		label: 'None',
		scratchKey: 'style_default',
		strategy: 'direct',
		palette: 'none',
		appliesTo: [],
		aggregationPath: [],
		containerColorMode: 'majority',
		legendOrder: [],
		legendColors: {},
		defaultCategory: null,
		hasNodeClassification: () => false,
		applyToNode: () => null,
	}, ...modes];
}

export function deriveRelationshipLabels(elements) {
	const reducer = (acc, label) => {
		acc.add(label);
		return acc;
	};
	const xf = composeT(
		mapT((edge) => edge?.data?.label),
		filterT(Boolean)
	);
	const labels = reduce(xf(reducer), new Set())(elements.edges || []);
	return [...labels].sort((a, b) => a.localeCompare(b));
}

export function deriveFeatureList(elements) {
	const features = new Set();
	for (const node of elements.nodes || []) {
		const traces = node.data?.properties?.traces;
		if (Array.isArray(traces)) {
			for (const trace of traces) {
				features.add(trace);
			}
		}
	}
	return [...features].sort((a, b) => a.localeCompare(b));
}

export function deriveColorLegendModel(selectedMode, colorMap, colorOrder) {
	return {
		colors: colorMap[selectedMode] || {},
		order: colorOrder[selectedMode] || [],
	};
}

export function defaultRoleStereotypeModel() {
	return {
		colors: roleStereotypeColors,
		order: roleStereotypeOrder,
	};
}
