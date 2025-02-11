/*
TODO
- animate dynamic aspects
- summaries to sidebar
- architecture recovery/clustering
- collapse the classes
- tweak klay parameters
*/
import { blacken, ft_colors, hslString, layer_colors_from, role_stereotype_colors, role_stereotypes } from './src/colors.js';
import { clearInfo, displayInfo } from './src/infoPanel.js';
import { $, $all, h, on, r, toJson, toText } from './src/shorthands.js';

import { aggregateLayers, setParents, setStyleClasses, shortenRoots } from './src/headlessTransformations.js';
import { adjustEdgeWidths, cacheNodeStyles, liftEdges, recolorContainers, removeContainmentEdges, removeExtraNodes, setLayerStyles, setRsStyles } from './src/visualTransformations.js';
import { getScratch } from './src/utils.js';

on('DOMContentLoaded', document, async () => {

	cytoscape.warnings(false);

	on('click', $("#btn-upload"), fileUpload);
	on('click', $("#btn-relayout"), () => relayout($('#selectlayout').options[$('#selectlayout').selectedIndex].value));
	on('click', $("#btn-highlight"), () => highlight($('#highlight').value));
	on('click', $("#btn-download"), () => saveAsSvg('class-diagram.svg'));
	on('click', $("#btn-popup"), () => window.open(getSvgUrl(), '_blank'));
	on('click', $("#btn-reset"), () => highlight(''));
	on('click', $("#btn-toggleVisibility"), toggleVisibility);

	const tablinks = $all(".tablink");
	on('click', tablinks, (event) => {
		tablinks.forEach((t) => t.classList.remove("active"));
		event.target.classList.add("active");

		const selectedTab = event.target.getAttribute('data-tab');
		$all('.sidebar-tab').forEach((t) => t.style.display = "none");
		$(`[id="${selectedTab}"]`).style.display = "block";
	});

	const fileName = new URLSearchParams(window.location.search).get('p');
	if (fileName) {
		try {
			const [rawGraph, style] = await Promise.all([
				fetch(`data/${fileName}.json`).then(toJson),
				fetch('style.cycss').then(toText)]);

			$("#filename").textContent = `Software Visualization: ${fileName}.json`;
			clearInfo('#infobody');
			initCy([prepareGraph(rawGraph), style]);
		} catch (error) {
			console.error('Error fetching data:', error);
		}
	}
});

const collectUniqueLabels = function (dataList) {
	const uniqueLabels = new Set();

	dataList.forEach(item => {
		const labels = item.data?.labels || [];
		labels.forEach(label => uniqueLabels.add(label));
	});

	return Array.from(uniqueLabels);
}

const abstractize = function (graphData) {
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
	const invert = (edgeList) =>
		edgeList.map(({ source, target, label, ...rest }) => ({
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
	const calls = lift(edges.hasScript, edges.invokes, "calls").filter(
		(edge) => edge.source !== edge.target
	);
	const constructs = compose(edges.hasScript, edges.instantiates, "constructs").filter(
		(edge) => edge.source !== edge.target
	);
	const holds = compose(edges.hasVariable, edges.type, "holds").filter(
		(edge) => edge.source !== edge.target
	);
	const accepts = compose(edges.hasScript, compose(edges.hasParameter, edges.type), "accepts").filter(
		(edge) => edge.source !== edge.target
	);
	const returns = compose(edges.hasScript, edges.returnType, "returns").filter(
		(edge) => edge.source !== edge.target
	);

	/**
	 * Identify top-level classes by analyzing "contains" edges
	 */
	const nestedClassSet = new Set(
		(edges.contains || [])
			.filter((edge) => nodes[edge.source]?.labels.includes("Structure"))
			.map((edge) => edge.target)
	);

	const topLevelClasses = Object.entries(nodes)
		.filter(([_, node]) => node.labels.includes("Structure"))
		.map(([id]) => id)
		.filter((id) => !nestedClassSet.has(id));
	const topLevelClassSet = new Set(topLevelClasses);

	/**
	 * Helper: extract top-level packages from an array of paths
	 */
	function extractTopLevelPackages(data) {
		// Remove the last element from each tuple -> get prefix
		const uniquePrefixes = new Set(data.map((item) => item.slice(0, -1).toString()));

		// Convert set to array and sort by length of the split arrays
		const sortedPrefixes = Array.from(uniquePrefixes)
			.map((item) => item.split(","))
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
		(edges.contains || [])
			.filter(
				(edge) =>
					nodes[edge.source].labels.includes("Container") &&
					nodes[edge.target].labels.includes("Structure")
			)
			.map((edge) => edge.source)
	);

	const pkgPaths = Array.from(pkgWithClasses).map((pkgId) => findPathFromRoot(edges.contains, pkgId));
	const topLevelPackages = extractTopLevelPackages(pkgPaths);
	const packagesToRemove = topLevelPackages.flatMap((pkg) => pkg.slice(0, -1));

	let newContains = edges.contains;
	if (
		topLevelPackages &&
		Array.isArray(topLevelPackages[0]) &&
		topLevelPackages[0].length > 1
	) {

		newContains = edges.contains
			.filter((edge) => !topLevelClassSet.has(edge.source))
			.filter(
				(edge) =>
					!packagesToRemove.includes(edge.source) && !packagesToRemove.includes(edge.target)
			);

		const components = topLevelPackages.map((pkg) => pkg[pkg.length - 1]);
		components.forEach((component) => {
			nodes[component].properties.name = nodes[component].properties.qualifiedName;
		});
	}

	/**
	 * If there's no "nests" edge, build it for top-level classes
	 */
	const nests =
		edges.nests ??
		(edges.contains || [])
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
		filterNodesByLabels(nodes, ["Container", "Structure", "Primitive", "Problem", "Script", "Operation", "Constructor", "Grouping"]),
		packagesToRemove
	);

	// Remove "contains" edges if the source node has the label "Structure"
	newContains = newContains.filter((edge) => {
		const sourceNode = abstractNodes[edge.source];
		// Keep the edge only if the source node doesn't exist in abstractNodes or doesn't have "Structure"
		return !sourceNode || !sourceNode.labels.includes("Structure");
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
	 *   (2) (s1)-[:uses]->(o1:Operation)<-[:hasScript]-(s2) => (s1)-[:calls]->(s2)
	 *
	 *   Then filter them to ensure both s1 and s2 are Structures.
	 * -----------------------------------------------------------------
	 */

	// "accesses" edges
	const usesHasVarInverted = invert(edges.hasVariable || []);
	const accesses = compose(edges.uses || [], usesHasVarInverted, "accesses").filter(
		(edge) =>
			nodes[edge.source]?.labels.includes("Structure") &&
			nodes[edge.target]?.labels.includes("Structure") &&
			edge.source !== edge.target
	);

	// "calls" edges (from s1 uses an Operation that belongs to s2)
	const usesHasScriptInverted = invert(edges.hasScript || []);
	const usesToCalls = compose(edges.uses || [], usesHasScriptInverted, "calls").filter(
		(edge) =>
			nodes[edge.source]?.labels.includes("Structure") &&
			nodes[edge.target]?.labels.includes("Structure") &&
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
		hasScript: edges.hasScript || [],
		contains: newContains || [],
		specializes: edges.specializes || [],
		nests: nests || [],
		calls: [...(calls || []), ...usesToCalls], // combine old + new "calls"
		constructs: constructs || [],
		holds: holds || [],
		accepts: accepts || [],
		returns: returns || [],

		implements: edges.implements || [],
		allowedDependency: edges.allowedDependency || [],

		// The newly composed "accesses" edges
		accesses,
	};

	/**
	 * Finally, remove edges referencing nodes we have removed (if any),
	 * to keep the final graph consistent.
	 */
	function cleanEdges(cytoscapeJson) {
		const { nodes, edges } = cytoscapeJson.elements;
		const nodeIds = new Set(nodes.map((n) => n.data.id));
		const validEdges = edges.filter(
			(e) => nodeIds.has(e.data.source) && nodeIds.has(e.data.target)
		);

		return {
			...cytoscapeJson,
			elements: {
				nodes,
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

const prepareGraph = function (graphData) {
	const nodeLabels = collectUniqueLabels(graphData.elements.nodes);
	const graphContainsScripts = nodeLabels.some(label => ['Operation', 'Constructor', 'Script'].includes(label));

	// Create a deep clone of graphData
	const originalGraph = JSON.parse(JSON.stringify(graphData));

	originalGraph.elements.edges.forEach(edge => {
		edge.data.label = edge.data.label || edge.data.labels?.join() || 'nolabel';
	});

	const graph = {
		original: originalGraph,
		abstract: graphContainsScripts ? abstractize(graphData) : graphData
	};

	const makeDummyContainers = homogenizeForest(
		e => e.data.label === "contains",
		n => n.data.labels.includes("Container"),
		n => n.data.labels.includes("Structure")
	);

	graph.abstract = makeDummyContainers(graph.abstract);

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

let parentRel = "contains";

function generateExpColOptions(_layoutName = "klay") {
	let cyExpandCollapseOptions = {
		// set default layout by klay
		layoutBy: null,
		animate: true,
		fisheye: false,
		undoable: false,
		cueEnabled: true,
		expandCollapseCuePosition: "top-left",
		groupEdgesOfSameTypeOnCollapse: true,
		allowNestedEdgeCollapse: true,
	};

	return cyExpandCollapseOptions;
}

// Memory to save expanded and collapsed nodes in stack
let expandedNodesIdx = [];
let collapsedNodes = [];
let zoom = { value: 1 };

const initCy = async function (payload) {
	const graph = payload[0];
	const style = payload[1];

	// first create a headless graph
	cytoscape({
		headless: true,
		elements: graph.abstract.elements,
		ready: hcyReady
	});

	function hcyReady(event) {
		window.hcy = event.cy;

		shortenRoots(hcy);
		setParents(hcy, parentRel, false);
		setStyleClasses(hcy);
		aggregateLayers(hcy);

		// then create a visualized graph
		cytoscape({
			container: $('#cy'),
			elements: hcy.json().elements,

			// inititate cytoscape expand collapse
			ready: cyReady,
			style,
			wheelSensitivity: 0.25,
		});
	}

	function cyReady(event) {
		window.cy = event.cy;

		// cy.startBatch();

		recolorContainers(cy);
		cacheNodeStyles(cy);
		liftEdges(cy);
		removeContainmentEdges(cy);
		adjustEdgeWidths(cy);

		determineLayerColors(cy);

		setLayerStyles(cy, window.layers, window.layer_colors);
		setRsStyles(cy);
		removeExtraNodes(cy);

		applyColor(cy);

		// cy.endBatch();

		// let api = this.expandCollapse(generateExpColOptions());

		// on("click", $("#collapseNodes"), () => {
		// 	api.collapseAll();
		// 	api.collapseAllEdges(generateExpColOptions())
		// });
		// on("click", $("#expandNodes"), () => {
		// 	api.expandAll();
		// 	api.expandAllEdges()
		// });

		// fillRSFilter();
		fillRelationshipToggles();
		fillFeatureDropdown();

		bindRouters();

		const cbShowPrimitives = $("#showPrimitives");
		cbShowPrimitives.checked = false;
		showPrimitives(cy, cbShowPrimitives);

		// const cbShowPackages = $("#showPackages");
		// cbShowPackages.checked = true;
		// showPackages(cy, cbShowPackages);

		zoom.value = cy.zoom();
	}
}

function determineLayerColors(pCy) {
	const topLayers = pCy.nodes(n => n.data('labels').includes("Grouping") && n.data('properties.kind') === "architectural layer" && n.incomers(e => e.data('label') === "allowedDependency").empty());
	window.layers = [...topLayers.map(n => n.data('properties.simpleName')).filter(n => n).map(n => n || "Undefined")];
	var currentLayers = topLayers;
	while (!currentLayers.empty()) {
		const nextLayers = currentLayers.outgoers(e => e.data('label') === "allowedDependency").targets();
		layers.push(...nextLayers.map(n => n.data('properties.simpleName')).filter(n => n).map(n => n || "Undefined"));
		currentLayers = nextLayers;
	}
	layers.push("Undefined");
	window.layer_colors = layer_colors_from(layers);
}

const applyColor = function (pCy) {
	const selectedColorMode = $all('[name = "coloring"]').filter((e) => e.checked)[0];
	colorNodes(pCy)({ target: { value: selectedColorMode ? selectedColorMode.value : 'style_default' } });
}

const colorNodes = (pCy) => function (event) {
	pCy.nodes().forEach((n) => {
		const style = getScratch(n, event.target.value) || getScratch(n, 'style_default');
		n.style(style);
	});
}

const bindRouters = function () {
	// Initiate cyExpandCollapseApi
	// cy.expandCollapse("get");

	on('change', $('#showPrimitives'), () => showPrimitives(cy, $('#showPrimitives')));
	// on('change', $('#showPackages'),   () => showPackages(cy, $('#showPackages')));
	on('change', $all('.coloringlabel'), colorNodes(cy));

	cy.on("select", "node", (event) => {
		event.target.addClass("selected");
		displayInfo('#infobody')(event.target);
	});

	cy.on("unselect", "node", (event) => {
		event.target.removeClass("selected");
		clearInfo('#infobody');
	});

	// right click dims the element
	cy.on('cxttap', 'node,edge', (event) => {
		event.target.addClass("dimmed")
		const interactions = $all('input[name="showrels"]')
			.filter(cb => cb.checked)
			.map(cb => cb.value);

		const edges = event.target.descendants().merge(event.target)
			.connectedEdges()
			.filter((e) => interactions.includes(e.data("interaction")));
		edges.addClass("dimmed");
	});

	// left click highlights the node and its connected edges and nodes
	cy.on("tap", "node", (event) => {

		const to_activate = event.target.children().union(event.target.ancestors()).merge(event.target)
		to_activate.removeClass("dimmed");

		// currently visible relationship types
		const interactions = $all('input[name="showrels"]')
			.filter(cb => cb.checked)
			.map(cb => cb.value);

		const edges = event.target.children().merge(event.target)
			.connectedEdges()
			.filter((e) => interactions.includes(e.data("interaction")));
		edges.removeClass("dimmed");
		edges.targets().merge(edges.targets().ancestors()).removeClass("dimmed");
	});

	// left click highlights the edge and its connected nodes
	cy.on("tap", "edge", (evt) => {
		evt.target.removeClass("dimmed");
		evt.target.connectedNodes().removeClass("dimmed");
	});

	cy.on("mouseover", "node", (evt) => {

	});
}

/* Sidebar Utility Functions */
const relayout = function (layout) {
	cy.layout({
		name: layout,
		animate: true,
		nodeDimensionsIncludeLabels: true,
		klay: {
			direction: "DOWN",
			edgeRouting: "ORTHOGONAL",
			routeSelfLoopInside: true,
			thoroughness: 4,
			spacing: 32,
		},
	}).run();
	// Re set the expandCollapse options
	// cy.expandCollapse(generateExpColOptions(layout));
};

const saveAsSvg = function (filename) {
	const svgContent = cy.svg({ scale: 1, full: true, bg: 'beige' });
	const blob = new Blob([svgContent], { type: "image/svg+xml;charset=utf-8" });
	saveAs(blob, filename);
};

const getSvgUrl = function () {
	const svgContent = cy.svg({ scale: 1, full: true, bg: 'beige' });
	const blob = new Blob([svgContent], { type: "image/svg+xml;charset=utf-8" });
	return URL.createObjectURL(blob);
};

const showPrimitives = function (pCy, e) {
	pCy.nodes()
		.filter((n) => n.data("labels").includes("Primitive") || n.data("id") === "java.lang.String")
		.style({ display: e.checked ? "element" : "none" });
};

// const showPackages = function (pCy, e) {
// 	pCy.nodes()
// 		.filter((n) => n.data("labels").includes("Container") && !n.data("labels").includes("Structure"))
// 		.toggleClass("pkghidden", !e.checked);
// };

const setVisible = function (e) {
	cy.edges(`[interaction = "${e.value}"]`).toggleClass(
		"hidden",
		!e.checked
	);
};

const setLineBends = function (e) {
	if (e.checked) {
		cy.edges(`[interaction = "${e.name}"]`).style("curve-style", e.value);
	}
};

const fileUpload = function () {
	const fileSelector = $("#file-selector");
	fileSelector.click();
	on("change", fileSelector, (event) => {
		const file = event.target.files[0];
		const fileName = file.name;
		$("#filename").textContent = `Software Visualization – ${fileName}`;
		clearInfo('#infobody');
		const reader = new FileReader();
		reader.readAsText(file, "UTF-8");
		reader.onload = function (e) {
			const rawGraph = JSON.parse(e.target.result);
			const graph = prepareGraph(rawGraph);
			const style = fetch("style.cycss").then(toText);
			Promise.all([graph, style]).then(initCy);
		};
	});
};

var flip = true;
const toggleVisibility = function () {
	cy.style()
		.selector(".dimmed")
		.style({
			display: flip ? "none" : "element",
		})
		.update();
	flip = !flip;
};

/* ======================================== */

const fillRSFilter = function () {

	if (!$('#menu-nodes .rs-filter-container')) {
		r('#menu-nodes', [h('div', { class: "rs-filter-container" })], false);
	}

	r('#menu-nodes .rs-filter-container', [
		h('p', {}, [h('b', {}, ["Role Stereotypes"])]),
		...Object.keys(role_stereotypes).map(key =>
			h("div", {}, [
				h("label", {
					for: `rs-${role_stereotypes[key].symbol}`,
					class: "rslabel",
					style: `color: ${hslString(blacken(role_stereotype_colors[key], 0.1))}; font-weight: bold;`
				}, [
					h("input", {
						type: "checkbox",
						id: `rs-${role_stereotypes[key].symbol}`,
						name: "showrs",
						value: key
					}, [], {
						change: (event) => showRS(event.target)
					}, (e) => e.checked = true),
					role_stereotypes[key].label || key
				])]))]);
}

const fillRelationshipToggles = function () {

	const edgeLabels = cy.edges()
		.map((e) => e.data("interaction"))
		.filter((v, i, s) => s.indexOf(v) === i);
	edgeLabels.sort((a, b) => a.localeCompare(b));

	r('#reltab', [
		h("thead", {}, [
			h("tr", {}, [
				h("th", {},
					["Connection"]),
				h("th", {},
					["Orthogonal"]),
				h("th", {},
					["Bezier"]),])]),
		...edgeLabels.map((edgeLabel) =>
			h("tr", {}, [
				h("td", {}, [
					h("label", {
						for: edgeLabel
					}, [
						h("input", {
							type: "checkbox",
							id: edgeLabel,
							name: "showrels",
							value: edgeLabel,
						}, [], {
							change: (event) => setVisible(event.target)
						}, (e) => {
							e.checked = ["calls"].includes(edgeLabel);
						}),
						edgeLabel])]),
				h("td", {}, [
					h("input", {
						type: "radio",
						id: `${edgeLabel}-ort`,
						name: edgeLabel,
						value: "taxi",
					}, [], {
						change: (event) => setLineBends(event.target)
					})
				]),
				h("td", {}, [
					h("input", {
						type: "radio",
						id: `${edgeLabel}-bez`,
						name: edgeLabel,
						value: "bezier",
					}, [], {
						change: (event) => setLineBends(event.target)
					}, (e) => {
						e.checked = true;
					})])]))]);

	$all('input[name="showrels"]').forEach(setVisible);
};

const fillFeatureDropdown = function () {
	let tracesSet = new Set();
	cy.nodes().forEach((e) => {
		const traces = e.data("properties.traces");
		if (traces) {
			traces.forEach((trace) => tracesSet.add(trace));
		}
	});

	let tracesList = [...tracesSet];

	r("#selectfeature", tracesList.map(trace =>
		h("div", {}, [
			h("label", {
				for: `feature-${trace}`,
				class: "featurelabel"
			}, [
				h("input", {
					type: "checkbox",
					id: `feature-${trace}`,
					name: "showfeatures",
					value: trace,
				}, [], {
					change: (event) => showTrace(event.target)
				}),
				trace
			])
		])
	));
};

const fillBugsDropdown = function () {
	let bugsSet = new Set();
	cy.nodes().forEach((e) => {
		if (e.data()["properties"]["vulnerabilities"]) {
			e.data()["properties"]["vulnerabilities"]
				.forEach((bug) => {
					bugsSet.add(bug["analysis_name"])
				});
		}
	});

	let bugList = [...bugsSet]
	// console.log(bugList)

	r("#tab-bugs", bugList.map(bug =>
		h("div", {}, [
			h("label", {
				for: `bug-${bug}`,
				class: "buglabel"
			}, [
				h("input", {
					type: "checkbox",
					id: `bug-${bug}`,
					name: "showbugs",
					value: bug,
				}, [], {
					change: (event) => showBug(event.target)
				}),
				bug])])));
};

function arrayIntersection(arr1, arr2) {
	const set2 = new Set(arr2);
	const result = arr1.filter(item => set2.has(item));
	return result;
}

// Highlight nodes based on query
const highlight = function (text) {
	if (text) {
		const classes = text.split(/[,\s]+/);
		cy.elements().addClass("dimmed");
		cy.elements(".hidden").removeClass("hidden").addClass("hidden");

		const cy_classes = cy.nodes((node) => classes.includes(node.data('name')));
		const cy_edges = cy_classes.edgesWith(cy_classes);
		cy_classes.removeClass("dimmed");
		cy_edges.removeClass("dimmed");
		cy.nodes(n => n.data('labels').includes('Container') && !n.data('labels').includes('Structure')).removeClass("dimmed");
	} else {
		cy.elements().removeClass("dimmed");
	}
	cy.edges(`[interaction = "${parentRel}"]`).style("display", "none");
};

const showRS = function (evt) {
	if (evt.checked) {
		cy.nodes(`[properties.roleStereotype = "${evt.value}"]`)
			.removeClass("dimmed")
			.connectedEdges()
			.filter((e) => !e.source().hasClass("dimmed") && !e.target().hasClass("dimmed"))
			.removeClass("dimmed");
	} else {
		cy.nodes(`[properties.roleStereotype = "${evt.value}"]`)
			.addClass("dimmed")
			.connectedEdges()
			.addClass("dimmed");
	}
};

const showTrace = function (_evt) {

	const trace_names = $all('[name="showfeatures"]')
		.filter((e) => e.checked)
		.map((e) => e.value);

	$all(".featurelabel").forEach((e) => { e.style.backgroundColor = ""; });

	cy.elements().removeClass("dimmed");
	cy.elements().removeClass("feature_shown");
	cy.elements().addClass("feature_reset");

	if (trace_names.length > 0) {
		const colorMap = {};
		trace_names.forEach((trace, i) => {
			const label = $(`label[for="feature-${trace}"]`);
			label.style.backgroundColor = ft_colors[i];
			colorMap[trace] = ft_colors[i];
		});

		const feature_nodes = cy.nodes().filter(function (node) {
			return trace_names.some((trace) => node.data("properties.traces") && node.data("properties.traces").includes(trace));
		});

		const feature_edges = cy.edges().filter(function (edge) {
			return trace_names.some((trace) => edge.data("properties.traces") && edge.data("properties.traces").includes(trace));
		});

		cy.elements().addClass("dimmed");
		cy.elements(".hidden").removeClass("hidden").addClass("hidden");
		feature_nodes.removeClass("dimmed");
		feature_edges.removeClass("dimmed");
		cy.nodes(n => n.data('labels').includes('Container')).removeClass("dimmed");

		feature_nodes.forEach((node) => {
			const trc = arrayIntersection(
				trace_names,
				node.data("properties.traces")
			);
			node.style({
				"background-fill": "linear-gradient",
				"background-gradient-direction": "to-right",
				"background-gradient-stop-positions": null,
				"background-gradient-stop-colors": trc.map((t) => colorMap[t]).join(" "),
			});
		});
	} else {
		applyColor(cy);
	}

	cy.edges(`[interaction = "${parentRel}"]`).style("display", "none");
};

const showBug = function (_evt) {

	const bug_names = $all('[name="showbugs"]')
		.filter((e) => e.checked)
		.map((e) => e.value);

	$all(".buglabel")
		.forEach((e) => { e.style.backgroundColor = ""; });

	if (bug_names.length > 0) {
		const colorMap = {};
		bug_names.forEach((bug, i) => {
			const labelElement = $(`label[for="bug-${bug}"]`);
			labelElement.style.backgroundColor = ft_colors[i];
			colorMap[bug] = ft_colors[i];
		});

		const bug_nodes = cy.nodes().filter(function (node) {
			return bug_names.some((bug) => {
				try {
					return node.data()["properties"]["vulnerabilities"] && node.data()["properties"]["vulnerabilities"].some((e) => e["analysis_name"] === bug);
				} catch (e) {
				}
			});
		});

		cy.elements().addClass("dimmed");
		cy.elements(".hidden").removeClass("hidden").addClass("hidden");
		bug_nodes.removeClass("dimmed");

		cy.nodes('[properties.kind = "file"]').removeClass("dimmed");
		bug_nodes.removeClass("bug_reset");

		bug_nodes.addClass("bug_shown");

		bug_nodes.forEach((node) => {
			const trc = arrayIntersection(bug_names, node.data()["properties"]["vulnerabilities"].map((vul) => vul["analysis_name"]));
			node.style("background-gradient-stop-colors", trc.map((t) => colorMap[t]).join(" "));
		});
	} else {
		cy.elements().removeClass("dimmed");
		cy.elements().removeClass("bug_shown");
		cy.elements().addClass("bug_reset");
	}
	cy.edges(`[interaction = "${parentRel}"]`).style("display", "none");
};

// EXPERIMENTAL!!!!!!!!!!!!!
var homogenizeForest = (isContainment, isTreeNode, isLeaf) => ({ elements: { nodes, edges }, ...rest }) => {
	// Build maps for quick lookups
	const nodeMap = new Map(nodes.map(n => [n.data.id, n]));
	const edgeKey = (s, t) => `${s} -> ${t}`;

	// Partition edges into containment vs. others
	const containmentEdges = edges.filter(isContainment);
	const otherEdges = edges.filter(e => !isContainment(e));

	// Adjacency (children) and single-parent tracking
	var childrenMap = new Map();
	var parentMap = new Map();
	for (const e of containmentEdges) {
		const { source, target } = e.data;
		if (!childrenMap.has(source)) childrenMap.set(source, []);
		childrenMap.get(source).push(target);
		parentMap.set(target, source); // assumption: single parent
	}

	// Convert edges to a map for easy mutation
	const edgeMap = new Map();
	for (const e of containmentEdges) {
		edgeMap.set(edgeKey(e.data.source, e.data.target), e);
	}

	// We'll add or modify nodes in this map
	const newNodes = new Map(nodes.map(n => [n.data.id, { ...n }]));
	let dummyCount = 0;

	// Step A: For each container node that has children:
	//         If it "contains" both leaf and non-leaf children, create a single dummy node
	//         and move all leaf children under that dummy.
	for (const [parentId, kids] of childrenMap.entries()) {

		const leafChildren = [];
		const nonLeafChildren = [];
		for (const k of kids) {
			if (isLeaf(nodeMap.get(k))) {
				leafChildren.push(k);
			} else {
				nonLeafChildren.push(k);
			}
		}

		// Only do the wrapping if there are BOTH leaves and non-leaves
		if (leafChildren.length > 0 && nonLeafChildren.length > 0) {
			dummyCount++;
			const dummyId = `${parentId}.dummy.${dummyCount}`;
			newNodes.set(dummyId, {
				data: {
					id: dummyId,
					labels: ["Container"],
					properties: { ...nodeMap.get(parentId).data.properties, dummy: 1 }
				}
			});

			// Insert edge parent->dummy
			edgeMap.set(edgeKey(parentId, dummyId), {
				data: {
					source: parentId,
					target: dummyId,
					label: "contains",
					properties: {}
				}
			});

			// Remove edges parent->leafChild
			// Add edges dummy->leafChild
			for (const childId of leafChildren) {
				edgeMap.delete(edgeKey(parentId, childId));
				edgeMap.set(edgeKey(dummyId, childId), {
					data: {
						source: dummyId,
						target: childId,
						label: "contains",
						properties: {}
					}
				});
				parentMap.set(childId, dummyId);
			}

			// Update childrenMap
			childrenMap.set(parentId, nonLeafChildren);
			childrenMap.set(dummyId, leafChildren);
		}
	}

	// Adjacency (children) and single-parent tracking
	childrenMap = new Map();
	parentMap = new Map();
	for (const e of edgeMap.values()) {
		const { source, target } = e.data;
		if (!childrenMap.has(source)) childrenMap.set(source, []);
		childrenMap.get(source).push(target);
		parentMap.set(target, source); // assumption: single parent
	}

	// Identify roots (no parent).
	const allTreeNodeIds = nodes.filter(isTreeNode).map(n => n.data.id);
	const allIdsWithoutParent = new Set(allTreeNodeIds);
	for (const childId of parentMap.keys()) allIdsWithoutParent.delete(childId);
	const roots = [...allIdsWithoutParent]; // forest roots

	// BFS to compute nodeDepth
	const nodeDepth = new Map();
	function bfsComputeDepth(root) {
		const queue = [root];
		nodeDepth.set(root, 1);
		while (queue.length) {
			const current = queue.shift();
			if (childrenMap.has(current)) {
				for (const child of childrenMap.get(current)) {
					if (!nodeDepth.has(child)) {
						nodeDepth.set(child, nodeDepth.get(current) + 1);
						queue.push(child);
					}
				}
			}
		}
	}
	roots.forEach(r => bfsComputeDepth(r));

	// Post-order DFS to compute subtreeDepth
	const subtreeDepth = new Map();
	function dfsComputeSubtreeDepth(node) {
		let maxBelow = 0;
		if (childrenMap.has(node)) {
			for (const c of childrenMap.get(node)) {
				maxBelow = Math.max(maxBelow, dfsComputeSubtreeDepth(c));
			}
		}
		const depth = maxBelow + 1;
		subtreeDepth.set(node, depth);
		return depth;
	}
	roots.forEach(r => dfsComputeSubtreeDepth(r));

	// Find maximum leaf depth in the forest
	let L = 0;
	for (const d of subtreeDepth.values()) {
		if (d > L) L = d;
	}

	// Insert dummy nodes above a node if its subtree doesn't reach the global deepest level
	function insertDummyChain(parent, node, d) {
		edgeMap.delete(edgeKey(parent, node));
		let currentParent = parent;
		for (let i = 0; i < d; i++) {
			dummyCount++;
			const dummyId = `${parent}.${node}.dummy.${dummyCount}`;
			const props = nodeMap.get(node)
				? nodeMap.get(node).data.properties
				: newNodes.get(node)
					? newNodes.get(node).data.properties
					: {};
			const dummy = {
				data: {
					id: dummyId,
					labels: ["Container"],
					properties: { ...props, dummy: 1 }
				}
			};
			newNodes.set(dummyId, dummy);
			edgeMap.set(edgeKey(currentParent, dummyId), {
				data: {
					source: currentParent,
					target: dummyId,
					label: "contains",
					properties: {}
				}
			});
			parentMap.set(dummyId, currentParent);
			currentParent = dummyId;
		}
		edgeMap.set(edgeKey(currentParent, node), {
			data: {
				source: currentParent,
				target: node,
				label: "contains",
				properties: {}
			}
		});
		parentMap.set(node, currentParent);
	}

	// Recursively ensure subtree extends to depth L
	function fixSubtree(node) {
		const d1 = nodeDepth.get(node) || 1;
		const d2 = subtreeDepth.get(node) || 1;
		const totalDepth = d1 + d2 - 1;
		if (totalDepth < L) {
			const d = L - totalDepth;
			const p = parentMap.get(node);
			if (!p) {
				// Node is root, create a super-root
				dummyCount++;
				const superRoot = `superRoot.${node}.dummy.${dummyCount}`;
				newNodes.set(superRoot, {
					data: {
						id: superRoot,
						labels: ["Container"],
						properties: { ...node.properties, dummy: 1 }
					}
				});
				roots.push(superRoot);
				nodeDepth.set(superRoot, 1);
				insertDummyChain(superRoot, node, d);
			} else {
				insertDummyChain(p, node, d);
			}
			// Shift nodeDepth in subtree
			const queue = [node];
			while (queue.length) {
				const curr = queue.shift();
				nodeDepth.set(curr, (nodeDepth.get(curr) || 1) + d);
				if (childrenMap.has(curr)) {
					for (const c of childrenMap.get(curr)) {
						queue.push(c);
					}
				}
			}
		}
		// Recurse
		if (childrenMap.has(node)) {
			for (const c of childrenMap.get(node)) fixSubtree(c);
		}
	}
	roots.forEach(r => fixSubtree(r));

	// Final result arrays
	const finalNodes = [...newNodes.values()];
	// Keep updated containment edges + all other edges
	const finalEdges = [...edgeMap.values(), ...otherEdges];

	return { elements: { nodes: finalNodes, edges: finalEdges }, ...rest };
};
