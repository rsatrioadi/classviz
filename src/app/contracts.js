function isObject(value) {
	return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function hasLabel(nodeData, label) {
	return Array.isArray(nodeData?.labels) && nodeData.labels.includes(label);
}

function assertDimensionContracts(elements, source) {
	const nodesById = new Map();
	for (const node of elements.nodes) {
		nodesById.set(node.data.id, node.data);
	}
	const hasDimensionNodes = [...nodesById.values()].some((nodeData) => hasLabel(nodeData, 'Dimension'));
	if (!hasDimensionNodes) return;

	const categoryToDimension = new Map();
	for (const edge of elements.edges) {
		if (edge.data.label !== 'composes') continue;
		const sourceNode = nodesById.get(edge.data.source);
		const targetNode = nodesById.get(edge.data.target);
		if (!hasLabel(sourceNode, 'Category') || !hasLabel(targetNode, 'Dimension')) continue;
		if (!categoryToDimension.has(sourceNode.id)) {
			categoryToDimension.set(sourceNode.id, new Set());
		}
		categoryToDimension.get(sourceNode.id).add(targetNode.id);
	}

	for (const edge of elements.edges) {
		if (edge.data.label !== 'implements') continue;
		const targetNode = nodesById.get(edge.data.target);
		if (!hasLabel(targetNode, 'Category')) continue;
		const dimensions = categoryToDimension.get(targetNode.id);
		if (dimensions && dimensions.size > 1) {
			throw new Error(`[contract] ${source}: category ${targetNode.id} composes to multiple Dimensions`);
		}
	}

	for (const edge of elements.edges) {
		if (edge.data.label !== 'succeeds') continue;
		const sourceNode = nodesById.get(edge.data.source);
		const targetNode = nodesById.get(edge.data.target);
		if (!hasLabel(sourceNode, 'Category') || !hasLabel(targetNode, 'Category')) continue;
		const sourceDims = categoryToDimension.get(sourceNode.id);
		const targetDims = categoryToDimension.get(targetNode.id);
		if (!sourceDims || !targetDims || sourceDims.size !== 1 || targetDims.size !== 1) continue;
		const sourceDim = [...sourceDims][0];
		const targetDim = [...targetDims][0];
		if (sourceDim !== targetDim) {
			throw new Error(`[contract] ${source}: succeeds edge ${sourceNode.id} -> ${targetNode.id} crosses dimensions`);
		}
	}
}

export function assertRawGraphContract(rawGraph, source = 'graph input') {
	if (!isObject(rawGraph)) {
		throw new Error(`[contract] ${source}: expected object graph payload`);
	}
	if (!isObject(rawGraph.elements)) {
		throw new Error(`[contract] ${source}: missing elements object`);
	}
	if (!Array.isArray(rawGraph.elements.nodes)) {
		throw new Error(`[contract] ${source}: elements.nodes must be an array`);
	}
	if (!Array.isArray(rawGraph.elements.edges)) {
		throw new Error(`[contract] ${source}: elements.edges must be an array`);
	}
}

export function assertPreparedGraphContract(graph, source = 'prepared graph') {
	if (!isObject(graph) || !isObject(graph.abstract) || !isObject(graph.abstract.elements)) {
		throw new Error(`[contract] ${source}: expected graph.abstract.elements`);
	}
	if (!isObject(graph.coloringMeta)) {
		throw new Error(`[contract] ${source}: expected graph.coloringMeta object`);
	}

	const { nodes, edges } = graph.abstract.elements;
	const metaNodes = graph.coloringMeta.nodes;
	const metaEdges = graph.coloringMeta.edges;
	if (!Array.isArray(nodes) || !Array.isArray(edges)) {
		throw new Error(`[contract] ${source}: graph.abstract.elements requires nodes and edges arrays`);
	}
	if (!Array.isArray(metaNodes) || !Array.isArray(metaEdges)) {
		throw new Error(`[contract] ${source}: graph.coloringMeta requires nodes and edges arrays`);
	}

	for (const node of nodes) {
		if (!isObject(node?.data) || typeof node.data.id !== 'string') {
			throw new Error(`[contract] ${source}: node is missing data.id string`);
		}
		if (!Array.isArray(node.data.labels)) {
			throw new Error(`[contract] ${source}: node ${node.data.id} is missing data.labels[]`);
		}
	}

	for (const edge of edges) {
		if (!isObject(edge?.data)) {
			throw new Error(`[contract] ${source}: edge missing data object`);
		}
		if (typeof edge.data.source !== 'string' || typeof edge.data.target !== 'string') {
			throw new Error(`[contract] ${source}: edge requires string source/target ids`);
		}
		if (typeof edge.data.label !== 'string' || edge.data.label.length === 0) {
			throw new Error(`[contract] ${source}: edge ${edge.data.source}->${edge.data.target} missing label`);
		}
	}

	assertDimensionContracts(graph.coloringMeta, source);
}
