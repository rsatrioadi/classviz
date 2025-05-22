/*
TODO
- animate dynamic aspects
- summaries to sidebar
- architecture recovery/clustering
- collapse the classes
- tweak klay parameters
*/
import { blacken, ft_colors, hslString, layer_colors_from, role_stereotype_colors, role_stereotype_order, role_stereotypes } from './src/colors.js';
import { clearInfo, displayInfo } from './src/infoPanel.js';
import { $, $all, h, on, r, toJson, toText } from './src/shorthands.js';

import { aggregateLayers, homogenizeDepthsOptimized, setParents, setStyleClasses, shortenRoots } from './src/headlessTransformations.js';
import { adjustEdgeWidths, cacheNodeStyles, liftEdges, recolorContainers, removeContainmentEdges, removeExtraNodes, setLayerStyles, setRsStyles, showNeighborhood } from './src/visualTransformations.js';
import { arrayIntersection, getScratch, hasLabel, isPureContainer } from './src/utils.js';
import { displayLegend } from './src/nodesPanel.js';
import { fillFeatureDropdown } from './src/edgesPanel.js';
import { highlight, relayout } from './src/graphPanel.js';

window.state = 0;

on('DOMContentLoaded', document, async () => {

	cytoscape.warnings(false);

	on('click', $("#btn-upload"), fileUpload);
	on('click', $("#btn-download"), () => saveAsSvg('class-diagram.svg'));
	on('click', $("#btn-popup"), () => window.open(getSvgUrl(), '_blank'));
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

const colorMap = {
	'style_default': {}
};

const colorOrder = {
	'style_default': []
}

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

export let parentRel = "contains";

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
1
		hcy.startBatch();

		homogenizeDepthsOptimized(hcy, 
			e => hasLabel(e, "contains"),
			n => hasLabel(n, "Container"),
			n => hasLabel(n, "Structure"));
		// console.log(hcy.json());
		shortenRoots(hcy);
		setParents(hcy, parentRel, false);
		setStyleClasses(hcy);
		aggregateLayers(hcy);

		hcy.endBatch();

		const numEdges = hcy.edges().length;

		// then create a visualized graph
		cytoscape({
			container: $('#cy'),
			elements: hcy.json().elements,
			ready: cyReady,
			style,
			textureOnViewport: numEdges > 5000 ? true : false,
			// wheelSensitivity: 0.25,
		});
	}

	function cyReady(event) {
		window.cy = event.cy;

		// cy.startBatch();

		recolorContainers(cy);
		cacheNodeStyles(cy);
		liftEdges(cy, "calls");
		liftEdges(cy, "constructs");
		removeContainmentEdges(cy);
		adjustEdgeWidths(cy);

		initLayerColors(cy);
		initRsColors();

		setLayerStyles(cy, window.layers, window.layer_colors);
		setRsStyles(cy);
		removeExtraNodes(cy);

		applyInitialColor(cy);

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
		fillRelationshipToggles(cy);
		fillFeatureDropdown(cy, showTrace);

		bindRouters();

		// const cbShowPrimitives = $("#showPrimitives");
		// cbShowPrimitives.checked = false;
		showPrimitives(cy, {checked: false});

		// const cbShowPackages = $("#showPackages");
		// cbShowPackages.checked = true;
		// showPackages(cy, cbShowPackages);

		zoom.value = cy.zoom();
	}
}

function initLayerColors(pCy) {
	const topLayers = pCy.nodes(n => hasLabel(n, "Grouping") && n.data('properties.kind') === "architectural layer" && n.incomers(e => hasLabel(e, "allowedDependency")).empty());
	window.layers = [...topLayers.map(n => n.data('properties.simpleName')).filter(n => n).map(n => n || "Undefined")];
	var currentLayers = topLayers;
	while (!currentLayers.empty()) {
		const nextLayers = currentLayers.outgoers(e => e.data('label') === "allowedDependency").targets();
		layers.push(...nextLayers.map(n => n.data('properties.simpleName')).filter(n => n).map(n => n || "Undefined"));
		currentLayers = nextLayers;
	}
	layers.push("Undefined");
	window.layer_colors = layer_colors_from(layers);
	colorMap['style_layer'] = window.layer_colors;
	colorOrder['style_layer'] = window.layers;
}

function initRsColors() {
	colorMap['style_rs'] = role_stereotype_colors;
	colorOrder['style_rs'] = role_stereotype_order;
}

const applyInitialColor = function (pCy) {
	const selectedColorMode = $all('[name = "coloring"]').filter((e) => e.checked)[0];
	colorNodes(pCy)({ target: { value: selectedColorMode ? selectedColorMode.value : 'style_default' } });
}

const colorNodes = (pCy) => function (event) {
	const selectedColorMode = event.target.value;
	pCy.nodes().forEach((n) => {
		const style = getScratch(n, selectedColorMode) || getScratch(n, 'style_default');
		n.style(style);
	});
	// console.log("color", colorMap, colorOrder);
	displayLegend('#coloring-legend', colorMap[selectedColorMode], colorOrder[selectedColorMode]);
}

const bindRouters = function () {
	// Initiate cyExpandCollapseApi
	// cy.expandCollapse("get");

	on('click', $("#btn-reset"), () => highlight(cy, ''));
	on('click', $("#btn-relayout"), () => relayout(cy, $('#selectlayout').options[$('#selectlayout').selectedIndex].value));
	on('click', $("#btn-highlight"), () => highlight(cy, $('#highlight').value));

	// on('change', $('#showPrimitives'), () => showPrimitives(cy, $('#showPrimitives')));
	// on('change', $('#showPackages'),   () => showPackages(cy, $('#showPackages')));
	on('change', $all('.coloringlabel'), colorNodes(cy));

	const cy_div = $('#cy');

	cy.on("select", "node", (event) => {
		event.target.addClass("selected");
		displayInfo('#infobody')(event.target);
		if ($('#infobox').style["display"] !== "flex") {
			$('#infobox').style["display"] = "flex";
			const w1 = cy_div.offsetWidth;
			cy_div.style["right"] = "270px";
			const w2 = cy_div.offsetWidth;
			const z = cy.zoom();
			const rw = (w2 - w1) / w1;
			cy.animate({
				panBy: { x: -135 }
			}, {
				duration: 200
			});
		}
	});

	cy.on("unselect", "node", (event) => {
		event.target.removeClass("selected");
		setTimeout(() => {
			if (cy.$("node:selected").length === 0) {
				event.target.cy().nodes().removeClass('highlight');
				clearInfo('#infobody');
				$('#infobox').style["display"] = "none";
				const w1 = cy_div.offsetWidth;
				cy_div.style["right"] = "0px";
				const w2 = cy_div.offsetWidth;
				const z = cy.zoom();
				const rw = (w2 - w1) / w1;
				cy.animate({ 
					panBy: { x: 135 }
				}, {
					duration: 200
				});
				}
		}, 1);
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
		showNeighborhood(event.target);
	});

	// left click highlights the edge and its connected nodes
	cy.on("tap", "edge", (evt) => {
		evt.target.removeClass("dimmed");
		evt.target.connectedNodes().removeClass("dimmed");
		console.log(getScratch(evt.target, 'bundle'));
	});
}

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

const hiddenEdges = {};
const setVisible = function (e) {
	if (!e.checked) {
		hiddenEdges[e.value] = cy.edges(`[interaction = "${e.value}"]`);
		hiddenEdges[e.value].remove();
	} else {
		if (hiddenEdges[e.value]) {
			hiddenEdges[e.value].restore();
			hiddenEdges[e.value] = null;
		}
	}
	// cy.edges(`[interaction = "${e.value}"]`).toggleClass(
	// 	"hidden",
	// 	!e.checked
	// );
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

var flip = false;
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

const fillRelationshipToggles = function (pCy) {

	const edgeLabels = pCy.edges()
		.map((e) => e.data("interaction"))
		.filter((v, i, s) => s.indexOf(v) === i);
	edgeLabels.sort((a, b) => a.localeCompare(b));

	r('#reltab', [
		h("thead", {}, [
			h("tr", {}, [
				h("th", {},
					["Edge Type"]),
				h("th", {},
					["└"]),
				h("th", {},
					["╰"]),
				h("th", {},
					["Action"]),])]),
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
					})]),
				h('td', {}, [
					h('button', {
						class: 'sidebar',
						id: `${edgeLabel}-lift`,
						value: edgeLabel
					}, ["⬆"], {
						click: (event) => liftEdges(cy, event.target.value)
					}), ' ',
					h('button', {
						class: 'sidebar',
						id: `${edgeLabel}-lower`,
						value: edgeLabel
					}, ["⬇"], {
						click: (event) => {
							const label = event.target.value;
							cy.edges(`[label="${label}"]`).forEach((edge) => {
								if (edge.data('properties')['bundle']) {
									edge.data('properties')['bundle'].forEach((bundledEdge) => {
										bundledEdge.restore();
										bundledEdge.toggleClass('hidden', !$(`#${label}`).checked)
									});
									edge.remove();
								}
							});
						}
					}, (e) => e.disabled = true)
				])]))]);

	$all('input[name="showrels"]').forEach(setVisible);
};

const showRS = function (event, pCy) {
	if (event.checked) {
		pCy.nodes(`[properties.roleStereotype = "${event.value}"]`)
			.removeClass("dimmed")
			.connectedEdges()
			.filter((e) => !e.source().hasClass("dimmed") && !e.target().hasClass("dimmed"))
			.removeClass("dimmed");
	} else {
		pCy.nodes(`[properties.roleStereotype = "${event.value}"]`)
			.addClass("dimmed")
			.connectedEdges()
			.addClass("dimmed");
	}
};

export const showTrace = function (event, pCy) {

	const traceNames = $all('[name="showfeatures"]')
		.filter((e) => e.checked)
		.map((e) => e.value);

	$all(".featurelabel").forEach((e) => { e.style.backgroundColor = ""; });

	pCy.elements().removeClass("dimmed");
	pCy.elements().removeClass("feature_shown");
	pCy.elements().addClass("feature_reset");

	if (traceNames.length > 0) {
		const traceColorMap = {};
		traceNames.forEach((trace, i) => {
			const label = $(`label[for="feature-${trace}"]`);
			label.style.backgroundColor = ft_colors[i];
			traceColorMap[trace] = ft_colors[i];
		});

		const featureNodes = pCy.nodes().filter(function (node) {
			return traceNames.some((trace) => node.data("properties.traces") && node.data("properties.traces").includes(trace));
		});

		const featureEdges = featureNodes.edgesWith(featureNodes).union(featureNodes.ancestors().edgesWith(featureNodes.ancestors()));

		pCy.elements().addClass("dimmed");
		pCy.elements(".hidden").removeClass("hidden").addClass("hidden");
		featureNodes.removeClass("dimmed");
		featureEdges.removeClass("dimmed");
		pCy.nodes(isPureContainer).removeClass("dimmed");

		featureNodes.forEach((node) => {
			const trc = arrayIntersection(
				traceNames,
				node.data("properties.traces")
			);
			node.style({
				"background-fill": "linear-gradient",
				"background-gradient-direction": "to-right",
				"background-gradient-stop-positions": null,
				"background-gradient-stop-colors": trc.map((t) => traceColorMap[t]).join(" "),
			});
		});
	} else {
		applyInitialColor(pCy);
	}

	pCy.edges(`[interaction = "${parentRel}"]`).style("display", "none");
};

export const showBug = function (event, pCy) {

	const bug_names = $all('[name="showbugs"]')
		.filter((e) => e.checked)
		.map((e) => e.value);

	$all(".buglabel")
		.forEach((e) => { e.style.backgroundColor = ""; });

	if (bug_names.length > 0) {
		const bugColorMap = {};
		bug_names.forEach((bug, i) => {
			const labelElement = $(`label[for="bug-${bug}"]`);
			labelElement.style.backgroundColor = ft_colors[i];
			bugColorMap[bug] = ft_colors[i];
		});

		const bug_nodes = pCy.nodes().filter(function (node) {
			return bug_names.some((bug) => {
				try {
					return node.data()["properties"]["vulnerabilities"] && node.data()["properties"]["vulnerabilities"].some((e) => e["analysis_name"] === bug);
				} catch (e) {
				}
			});
		});

		pCy.elements().addClass("dimmed");
		pCy.elements(".hidden").removeClass("hidden").addClass("hidden");
		bug_nodes.removeClass("dimmed");

		pCy.nodes('[properties.kind = "file"]').removeClass("dimmed");
		bug_nodes.removeClass("bug_reset");

		bug_nodes.addClass("bug_shown");

		bug_nodes.forEach((node) => {
			const trc = arrayIntersection(bug_names, node.data()["properties"]["vulnerabilities"].map((vul) => vul["analysis_name"]));
			node.style("background-gradient-stop-colors", trc.map((t) => bugColorMap[t]).join(" "));
		});
	} else {
		pCy.elements().removeClass("dimmed");
		pCy.elements().removeClass("bug_shown");
		pCy.elements().addClass("bug_reset");
	}
	pCy.edges(`[interaction = "${parentRel}"]`).style("display", "none");
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
	// console.log('outside', nodeDepth, subtreeDepth);

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
			console.log("outside-new", node, nodeDepth);
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
