function isObject(value) {
	return value !== null && typeof value === 'object' && !Array.isArray(value);
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

	const { nodes, edges } = graph.abstract.elements;
	if (!Array.isArray(nodes) || !Array.isArray(edges)) {
		throw new Error(`[contract] ${source}: graph.abstract.elements requires nodes and edges arrays`);
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
}
