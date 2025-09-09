export const prepareGraph = function (graphData) {

	// Create a deep clone of graphData
	const originalGraph = JSON.parse(JSON.stringify(graphData));

	originalGraph.elements.edges.forEach(edge => {
		edge.data.label = edge.data.label || edge.data.labels?.join() || 'nolabel';
	});

	const schemaVersion = determineSchemaVersion(originalGraph);
	console.log('schema version', schemaVersion);
	const graph = {
		original: originalGraph,
		abstract: schemaVersion.startsWith('2.0') ?
			abstractizeV2(originalGraph) :
			schemaVersion.startsWith('1.2') ?
				abstractizeV2(upgradeV1ToV2(originalGraph)) :
				upgradeV1ToV2(originalGraph)
	};
	// console.log('abstracted', graph);

	// const makeDummyContainers = homogenizeForest(
	// 	e => e.data.label === "contains",
	// 	n => n.data.labels.includes("Container"),
	// 	n => n.data.labels.includes("Structure")
	// );
	// makeDummyContainers(graph.abstract);
	graph.abstract.elements.nodes.forEach(node => {
		const { name, shortname, simpleName } = node.data.properties;
		node.data.name = name || shortname || simpleName;
		node.data.label = node.data.name;
	});

	graph.abstract.elements.edges.forEach(edge => {
		edge.data.interaction = edge.data.label;
		edge.data.group = edge.data.label;
	});

	return graph;
};

function collectUniqueNodeLabels(nodeList) {
	return Array.from(
		new Set(nodeList.flatMap(node => node.data?.labels || []))
	);
}

const upgradeV1ToV2 = function (graphData) {
	const newGraphData = JSON.parse(JSON.stringify(graphData));
	newGraphData.elements.nodes.forEach((node) => {
		if (node.data.labels.includes('Container')) {
			node.data.labels.push('Scope');
			node.data.labels.splice(node.data.labels.indexOf('Container'), 1);
		}
		if (node.data.labels.includes('Structure')) {
			node.data.labels.push('Type');
			node.data.labels.splice(node.data.labels.indexOf('Structure'), 1);
		}
		if (node.data.labels.includes('Grouping')) {
			node.data.labels.push('Category');
			node.data.labels.splice(node.data.labels.indexOf('Grouping'), 1);
		}
		if (node.data.labels.includes('Script')) {
			if (!node.data.labels.includes('Operation')) {
				node.data.labels.push('Operation');
			}
			node.data.labels.splice(node.data.labels.indexOf('Script'), 1);
		}
		if (node.data.labels.includes('Constructor')) {
			if (!node.data.labels.includes('Operation')) {
				node.data.labels.push('Operation');
			}
			node.data.labels.splice(node.data.labels.indexOf('Constructor'), 1);
			node.data.properties['kind'] = "constructor";
		}
		if (node.data.labels.includes('Primitive')) {
			if (!node.data.labels.includes('Type')) {
				node.data.labels.push('Type');
			}
			node.data.labels.splice(node.data.labels.indexOf('Primitive'), 1);
			node.data.properties['kind'] = "primitive";
		}
	});
	newGraphData.elements.edges.forEach((edge) => {
		if (edge.data.label === 'contains') {
			edge.data.label = 'encloses';
		}
		if (edge.data.label === 'hasScript') {
			edge.data.label = 'encapsulates';
		}
		if (edge.data.label === 'hasVariable') {
			edge.data.label = 'encapsulates';
		}
		if (edge.data.label === 'hasParameter') {
			const src = edge.data.source;
			const tgt = edge.data.target;
			edge.data.source = tgt;
			edge.data.target = src;
			edge.data.label = 'parameterizes';
		}
		if (edge.data.label === 'returnType') {
			edge.data.label = 'returns';
		}
		if (edge.data.label === 'type') {
			edge.data.label = 'typed';
		}
		if (edge.data.label === 'allowedDependency') {
			edge.data.label = 'succeeds';
		}
	});
	return newGraphData;
};

const abstractizeV2 = function (pGraphData) {
	const graphData = JSON.parse(JSON.stringify(pGraphData));
	// Build a node dictionary and an edge dictionary from graphData
	const nodes = Object.fromEntries(graphData.elements.nodes.map((node) => [node.data.id, node.data]));
	const edges = {};

	for (const edge of graphData.elements.edges) {
		const label = edge.data.label || edge.data.labels?.join() || "";
		if (!edges[label]) {
			edges[label] = [];
		}
		edges[label].push(edge.data);
	}

	/**
	 * Helper: invert each edge in edgeList (reverse source & target).
	 */
	const invert = (edgeList) => (edgeList || []).map(({ source, target, label, ...rest }) => ({
		source: target,
		target: source,
		label: `inv_${label}`,
		...rest,
	}));

	/**
	 * Helper: compose l1 and l2 such that each l1.target matches l2.source.
	 * Multiplies 'weight' if present, aggregates them if source->target repeats.
	 */
	const compose = function (l1, l2, newlabel) {
		if (!Array.isArray(l1) || !Array.isArray(l2)) return [];

		// Create a map from l2's source -> list of { target, label, weight }
		const mapping = new Map();
		for (const { source, target, label, properties } of l2) {
			const weight = properties?.weight ?? 1;
			if (!mapping.has(source)) {
				mapping.set(source, []);
			}
			mapping.get(source).push({ target, label, weight });
		}

		// We'll aggregate weights when multiple edges share the same source->target
		const aggregatedEdges = new Map();

		// For each l1 edge, see if we can connect to any l2 target
		for (const { source: s1, target: t1, label, properties } of l1) {
			const weight1 = properties?.weight ?? 1;
			const matches = mapping.get(t1);
			if (matches) {
				for (const { target: t2, label: l2label, weight: w2 } of matches) {
					const newWeight = w2 * weight1;
					const key = `${s1}-${t2}`; // Unique key for the final edge

					if (!aggregatedEdges.has(key)) {
						aggregatedEdges.set(key, {
							source: s1,
							target: t2,
							label: newlabel || `${label}-${l2label}`,
							properties: { weight: newWeight },
						});
					} else {
						// If we already have the same source->target, just add to its weight
						aggregatedEdges.get(key).properties.weight += newWeight;
					}
				}
			}
		}

		return Array.from(aggregatedEdges.values());
	};

	/**
	 * Helper: triple-compose rel1->rel2->(inverted rel1).
	 * (Used in the original code for "calls".)
	 */
	const lift = function (rel1, rel2, newlabel) {
		return compose(compose(rel1, rel2), invert(rel1), newlabel);
	};

	/**
	 * Original logic: calls, constructs, holds, accepts, returns
	 */
	const calls = lift(edges['encapsulates'] || [], edges['invokes'] || [], "calls").filter(
		(edge) => edge.source !== edge.target
	);
	const constructs = compose(edges['encapsulates'] || [], edges['instantiates'] || [], "constructs").filter(
		(edge) => edge.source !== edge.target
	);
	const holds = compose(edges['encapsulates'] || [], edges['typed'] || [], "holds").filter(
		(edge) => edge.source !== edge.target
	);
	const accepts = compose(edges['encapsulates'] || [], compose(invert(edges['parameterizes'] || []), edges['typed'] || []), "accepts").filter(
		(edge) => edge.source !== edge.target
	);
	const returns = compose(edges['encapsulates'] || [], edges['returns'] || [], "returns").filter(
		(edge) => edge.source !== edge.target
	);

	/**
	 * Identify top-level classes by analyzing "contains" edges
	 */
	const nestedClassSet = new Set(
		(edges['encloses'] || [])
			.filter((edge) => nodes[edge.source]?.labels.includes("Type"))
			.map((edge) => edge.target)
	);

	const topLevelClasses = Object.entries(nodes)
		.filter(([_, node]) => node.labels.includes("Type"))
		.map(([id]) => id)
		.filter((id) => !nestedClassSet.has(id));
	const topLevelClassSet = new Set(topLevelClasses);

	/**
	 * Helper: extract top-level packages from an array of paths
	 */
	function extractTopLevelPackages(data) {
		// Remove the last element from each tuple -> get prefix
		const uniquePrefixes = new Set(data.map((item) => item.length > 1 ? item.slice(0, -1) : item));
		// console.log(uniquePrefixes)

		// Convert set to array and sort by length of the split arrays
		const sortedPrefixes = Array.from(uniquePrefixes)
			.sort((a, b) => a.length - b.length);

		const results = [];

		for (const prefix of sortedPrefixes) {
			// Check if 'prefix' is already contained as a prefix in 'results'
			if (!results.some((existing) => prefix.slice(0, existing.length).toString() === existing.toString())) {
				results.push(prefix);
			}
		}

		return results;
	}

	/**
	 * Helper: find path from root to a target in a tree of edges
	 */
	function findPathFromRoot(tree, targetNode) {
		const parentMap = {};
		for (const edge of tree) {
			parentMap[edge.target] = edge.source;
		}

		const path = [];
		let currentNode = targetNode;

		while (Object.hasOwn(parentMap, currentNode)) {
			path.push(currentNode);
			currentNode = parentMap[currentNode];
		}

		if (currentNode !== null) {
			path.push(currentNode);
		}

		path.reverse();
		return path;
	}

	/**
	 * Identify top-level packages and remove them from "contains" if needed
	 */
	const pkgWithClasses = new Set(
		(edges['encloses'] || [])
			.filter(
				(edge) => {
					return nodes[edge.source].labels.includes("Scope") &&
					nodes[edge.target].labels.includes("Type");
				}
			)
			.map((edge) => edge.source)
	);

	const pkgPaths = Array.from(pkgWithClasses).map((pkgId) => findPathFromRoot(edges['encloses'], pkgId));
	// console.log('pkgPaths', pkgPaths);
	const topLevelPackages = extractTopLevelPackages(pkgPaths);
	// console.log('topLevelPackages', topLevelPackages);
	const packagesToRemove = topLevelPackages.flatMap((pkg) => pkg.slice(0, -1));
	// console.log('packagesToRemove', packagesToRemove);

	let newContains = edges['encloses'];
	if (topLevelPackages &&
		Array.isArray(topLevelPackages[0]) &&
		topLevelPackages[0].length > 1) {

		newContains = edges['encloses']
			.filter((edge) => !topLevelClassSet.has(edge.source))
			.filter(
				(edge) => !packagesToRemove.includes(edge.source) && !packagesToRemove.includes(edge.target)
			);

		const components = topLevelPackages.map((pkg) => pkg[pkg.length - 1]);
		components.forEach((component) => {
			nodes[component].properties.name = nodes[component].properties.qualifiedName;
		});
	}

	/**
	 * If there's no "nests" edge, build it for top-level classes
	 */
	const nests = edges['nests'] ??
		(edges['encloses'] || [])
			.filter((edge) => topLevelClassSet.has(edge.source))
			.map((edge) => ({ ...edge, label: "nests" }));

	/**
	 * Keep a helper to filter nodes by certain labels
	 */
	const filterNodesByLabels = function (nodeObj, labels) {
		return Object.entries(nodeObj).reduce((acc, [key, object]) => {
			if (object.labels.some((lbl) => labels.includes(lbl))) {
				acc[key] = object;
			}
			return acc;
		}, {});
	};

	/**
	 * Helper: filter out nodes whose ids are in a blacklist
	 */
	function filterNodesByIds(obj, ids) {
		return Object.keys(obj).reduce((acc, key) => {
			if (!ids.includes(key)) {
				acc[key] = obj[key];
			}
			return acc;
		}, {});
	}

	/**
	 * Build the "abstract" set of nodes (remove packages to remove)
	 */
	const abstractNodes = filterNodesByIds(
		filterNodesByLabels(nodes, ["Scope", "Type", "Problem", "Operation", "Category"]),
		packagesToRemove
	);

	// Remove "contains" edges if the source node has the label "Type"
	newContains = newContains.filter((edge) => {
		const sourceNode = abstractNodes[edge.source];
		// Keep the edge only if the source node doesn't exist in abstractNodes or doesn't have "Type"
		return !sourceNode || !sourceNode.labels.includes("Type");
	});

	// Object.values(abstractNodes).forEach((node) => {
	// 	if (node.labels.includes("Container") && node.labels.includes("Structure")) {
	// 		node.labels = node.labels.filter((label) => label !== "Container");
	// 	}
	// });
	/**
	 * -----------------------------------------------------------------
	 *  (1) and (2) NEW LOGIC for edges derived from "uses":
	 *
	 *   (1) (s1)-[:uses]->(v1:Variable)<-[:hasVariable]-(s2) => (s1)-[:accesses]->(s2)
	 *   (2) (s1)-[:uses]->(o1:Operation)<-[:encapsulates]-(s2) => (s1)-[:calls]->(s2)
	 *
	 *   Then filter them to ensure both s1 and s2 are Structures.
	 * -----------------------------------------------------------------
	 */
	// "accesses" edges
	const usesHasVarInverted = invert(edges['encapsulates'] || []);
	const accesses = compose(edges['uses'] || [], usesHasVarInverted, "accesses").filter(
		(edge) => nodes[edge.source]?.labels.includes("Type") &&
			nodes[edge.target]?.labels.includes("Type") &&
			edge.source !== edge.target
	);

	// "calls" edges (from s1 uses an Operation that belongs to s2)
	const usesHasScriptInverted = invert(edges['encapsulates'] || []);
	const usesToCalls = compose(edges['uses'] || [], usesHasScriptInverted, "calls").filter(
		(edge) => nodes[edge.source]?.labels.includes("Type") &&
			nodes[edge.target]?.labels.includes("Type") &&
			edge.source !== edge.target
	);

	/**
	 * (3) We maintain any existing edges from Structure to Structure as is.
	 * The original code never removed them, so we’ll just keep them in the final set.
	 */
	/**
	 * Collect all final edges in an object so we can flatten them at the end
	 * and produce a valid Cytoscape JSON structure.
	 */
	const abstractEdges = {
		// Edges that the original code had
		encapsulates: edges['encapsulates'] || [],
		encloses: newContains || [],
		specializes: edges['specializes'] || [],
		nests: nests || [],
		calls: [...(calls || []), ...usesToCalls], // combine old + new "calls"
		constructs: constructs || [],
		holds: holds || [],
		accepts: accepts || [],
		returns: returns || [],

		implements: edges['implements'] || [],
		succeeds: edges['succeeds'] || [],

		// The newly composed "accesses" edges
		accesses,
	};

	/**
	 * Finally, remove edges referencing nodes we have removed (if any),
	 * to keep the final graph consistent.
	 */
	function cleanEdges(cyJson) {
		const { nodes: myNodes, edges: myEdges } = cyJson.elements;
		const nodeIds = new Set(myNodes.map((n) => n.data.id));
		const validEdges = myEdges.filter(
			(e) => nodeIds.has(e.data.source) && nodeIds.has(e.data.target)
		);

		return {
			...cyJson,
			elements: {
				nodes: myNodes,
				edges: validEdges,
			},
		};
	}

	/**
	 * Build final Cytoscape structure
	 */
	const abstractGraph = {
		elements: {
			nodes: Object.values(abstractNodes).map((node) => ({ data: { ...node } })),
			edges: Object.values(abstractEdges)
				.flat()
				.map((edge) => ({ data: { ...edge } })),
		},
	};

	const clean = cleanEdges(abstractGraph);

	return clean;
};

const determineSchemaVersion = function (graphData) {
	if (graphData.properties && graphData.properties.schemaVersion) {
		return graphData.properties.schemaVersion;
	}
	const nodeLabels = collectUniqueNodeLabels(graphData.elements.nodes);
	const graphContainsScripts = nodeLabels.some(label => ['Operation', 'Constructor', 'Script'].includes(label));
	if (graphContainsScripts) {
		return '1.2.0';
	}
	return '1.0.0';
};
