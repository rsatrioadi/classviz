import { layerColorsFrom, roleStereotypeColors, roleStereotypeOrder } from '../utilities/colors.js';

function toSimpleName(nodeData) {
	return nodeData?.properties?.simpleName || 'Undefined';
}

function isLayerCategory(nodeData) {
	if (!nodeData?.labels?.includes('Category')) return false;
	if (nodeData?.properties?.kind === 'architectural layer') return true;
	return false;
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

export function deriveRelationshipLabels(elements) {
	const labels = new Set();
	for (const edge of elements.edges || []) {
		if (edge.data?.label) labels.add(edge.data.label);
	}
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
