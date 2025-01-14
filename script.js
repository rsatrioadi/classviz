/*
TODO
- role stereotypes DONE
- filtering stereotypes DONE
- remove bug tab DONE
- try font sizing DONE
- animate dynamic aspects
- summaries to sidebar DONE
- architecture recovery/clustering
- collapse the classes
- more padding inside packages DONE
- tweak klay parameters
*/

document.addEventListener('DOMContentLoaded', async () => {
	const fileName = new URLSearchParams(window.location.search).get('p');
	if (fileName) {
		try {
			const [rawGraph, style] = await Promise.all([
				fetch(`data/${fileName}.json`).then(response => response.json()),
				fetch('style.cycss').then(response => response.text())
			]);

			document.getElementById("filename").textContent = `Software Visualization: ${fileName}.json`;
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
		// Show them (debug)
		// console.log(topLevelPackages);

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
		filterNodesByLabels(nodes, ["Container", "Structure", "Primitive", "Problem"]),
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
		contains: newContains || [],
		specializes: edges.specializes || [],
		nests: nests || [],
		calls: [...(calls || []), ...usesToCalls], // combine old + new "calls"
		constructs: constructs || [],
		holds: holds || [],
		accepts: accepts || [],
		returns: returns || [],

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

	return cleanEdges(abstractGraph);
};

const prepareGraph = function (graphData) {
	const nodeLabels = collectUniqueLabels(graphData.elements.nodes);
	const graphContainsScripts = nodeLabels.some(label => ['Operation', 'Constructor', 'Script'].includes(label));
	
	// Create a deep clone of graphData
	const originalGraph = JSON.parse(JSON.stringify(graphData));

	const graph = {
		original: originalGraph,
		abstract: graphContainsScripts ? abstractize(graphData) : graphData
	};

	graph.abstract.elements.nodes.forEach(node => {
		const { name, shortname, simpleName } = node.data.properties;
		node.data.name = name || shortname || simpleName;
		node.data.label = node.data.name;
	});

	graph.abstract.elements.edges.forEach(edge => {
		edge.data.interaction = edge.data.label || edge.data.labels?.join() || 'nolabel';
		edge.data.group = edge.data.interaction;
	});

	return graph;
};

const setParents = function (relationship, inverted) {
	cy.edges("#parentRel").removeClass("parentRel");

	cy.edges(`[interaction = "${relationship}"]`).forEach((edge) => {
		const child = inverted ? edge.source() : edge.target();
		const parent = inverted ? edge.target() : edge.source();

		child.move({ parent: parent.id() });
	});

	cy.edges(`[interaction = "${relationship}"]`).addClass("parentRel");
}

let parentRel = "contains";

const role_stereotypes = {
	"Controller": { symbol: "CT", color_dark: "#8B4293", color_light: "#EFDFFF" },
	"Coordinator": { symbol: "CO", color_dark: "#50A848", color_light: "#CEEECE" },
	"Information Holder": { symbol: "IH", color_dark: "#E53033", color_light: "#FFDEDE" },
	"Interfacer": { symbol: "IT", color_dark: "#AA7F00", color_light: "#F6E5B2" },
	"User Interfacer": { symbol: "ITu", color_dark: "#AA7F00", color_light: "#F6E5B2" },
	"Internal Interfacer": { symbol: "ITi", color_dark: "#AA7F00", color_light: "#F6E5B2" },
	"External Interfacer": { symbol: "ITe", color_dark: "#AA7F00", color_light: "#F6E5B2" },
	"Service Provider": { symbol: "SP", color_dark: "#4274BF", color_light: "#D2E8FF" },
	"Structurer": { symbol: "ST", color_dark: "#FF7FD2", color_light: "#FFDBFF" },
	"*": { symbol: "UR", label: "Unreliable" },
	"-": { symbol: "UD", label: "Undetermined" }
};

const ft_colors = [
	"#8dd3c7",
	"#ffffb3",
	"#bebada",
	"#fb8072",
	"#80b1d3",
	"#fdb462",
	"#b3de69",
	"#fccde5",
	"#d9d9d9",
	"#bc80bd",
	"#ccebc5",
	"#ffed6f",
];

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
	
	const cy = window.cy = cytoscape({
		container: document.getElementById('cy'),
		elements: graph.abstract.elements,

		// inititate cytoscape expand collapse
		ready: function () {
			let api = this.expandCollapse(generateExpColOptions());

			document
				.getElementById("collapseNodes")
				.addEventListener("click", () => { api.collapseAll(); api.collapseAllEdges(generateExpColOptions()) });
			document
				.getElementById("expandNodes")
				.addEventListener("click", () => { api.expandAll(); api.expandAllEdges() });
		},
		style,
		wheelSensitivity: 0.25,
	});

	setParents(parentRel, false);

	const max_pkg_depth = Math.max(...cy.nodes('[properties.kind = "package"]').map((n)=>n.ancestors().length));

	// Isolate nodes with kind equals to package
	cy.nodes('[properties.kind = "package"]').forEach((n) => {
		const d = 146;
		const l = 236;
		const depth = n.ancestors().length;
		const grey = Math.max(l - ((max_pkg_depth - depth) * 15), d);
		n.style('background-color', `rgb(${grey},${grey},${grey})`);
	});

	const max_folder_depth = Math.max(...cy.nodes('[properties.kind = "folder"]').map((n) => n.ancestors().length));

	// Isolate nodes with kind equals to package
	cy.nodes('[properties.kind = "folder"]').forEach((n) => {
		const d = 150;
		const l = 250;
		const depth = n.ancestors().length;
		const grey = Math.max(l - ((max_folder_depth - depth) * 10), d);
		n.style({
			'background-color': `rgb(${grey},${grey},${grey})`,
			'text-valign': "top"
		});
	});

	const max_ns_depth = Math.max(...cy.nodes('[properties.kind = "Namespace"]').map((n) => n.ancestors().length));

	// Isolate nodes with kind equals to Namespace
	cy.nodes('[properties.kind = "Namespace"]').forEach((n) => {
		const d = 146;
		const l = 236;
		const depth = n.ancestors().length;
		const grey = Math.max(l - ((max_ns_depth - depth) * 15), d);
		n.style('background-color', `rgb(${grey},${grey},${grey})`);
	});

	fillRSFilter(cy);
	fillRelationshipToggles(cy);
	fillFeatureDropdown(cy);

	bindRouters();

	const cbShowPrimitives = document.getElementById("showPrimitives");
	const cbShowPackages = document.getElementById("showPackages");

	cbShowPrimitives.checked = false;
	cbShowPackages.checked = true;

	showPrimitives(cbShowPrimitives);
	showPackages(cbShowPackages);

	zoom.value = cy.zoom();

	return cy;
}

// Get a reference to the div element
var infoBox = document.getElementById("infobox");
var infoTitle = document.getElementById("infotitle");
var infoBody = document.getElementById("infobody");

// Add a click event listener to the div
infoTitle.addEventListener("click", () => {
	if (infoBody.style.display === "none") {
		infoBody.style.display = "block";
		infoTitle.style.borderBottomLeftRadius = 0;
		infoTitle.style.borderBottomRightRadius = 0;
		infoTitle.style.borderBottom = "1px solid #9b999b";
	} else {
		infoBody.style.display = "none";
		infoTitle.style.borderBottomLeftRadius = "inherit";
		infoTitle.style.borderBottomRightRadius = "inherit";
		infoTitle.style.borderBottom = 0;
	}
});

const bindRouters = function () {
	// Initiate cyExpandCollapseApi
	let api = cy.expandCollapse("get");

	// right click dims the element
	cy.on('cxttap', 'node,edge',
		evt => {
			evt.target.addClass("dimmed")
			const interactions = [...document.querySelectorAll('input[name="showrels"]')]
				.filter(cb => cb.checked)
				.map(cb => cb.value);

			const edges = evt.target
				.connectedEdges()
				.filter((e) => interactions.includes(e.data("interaction")));
			edges.addClass("dimmed");
		});

	// left click highlights the node and its connected edges and nodes
	cy.on("tap", "node", (evt) => {
		evt.target.removeClass("dimmed");

		// currently visible relationship types
		const interactions = [...document.querySelectorAll('input[name="showrels"]')]
			.filter(cb => cb.checked)
			.map(cb => cb.value);

		const edges = evt.target
			.connectedEdges()
			.filter((e) => interactions.includes(e.data("interaction")));
		edges.removeClass("dimmed");
		edges.connectedNodes().removeClass("dimmed");
	});

	// left click highlights the edge and its connected nodes
	cy.on("tap", "edge", (evt) => {
		evt.target.removeClass("dimmed");
		evt.target.connectedNodes().removeClass("dimmed");
	});

	cy.on("mouseover", "node", (evt) => {
		const { properties } = evt.target.data();
		const { kind, roleStereotype } = properties;
		const infoHeader = document.createElement("h3");
		const infoSubeader = document.createElement("p");
		const infoText = document.createElement("p");

		infoHeader.textContent = properties.simpleName;
		infoText.textContent = properties.description || "(no description)";

		if (evt.target.data().labels.includes('Structure')) {
			const backgroundColor = (roleStereotype && (roleStereotype in role_stereotypes)) ? role_stereotypes[roleStereotype].color_light : "inherit";
			infoSubeader.innerHTML = `<b><i>${kind}</i>${roleStereotype ? ` – ${roleStereotype}` : ""}</b>`;
			infoBody.style.backgroundColor = backgroundColor;
		} else if (evt.target.data().labels.includes("Container")) {
			infoSubeader.innerHTML = `<b><i>${kind}</i></b>`;
			infoBody.style.backgroundColor = "inherit";
		}

		infoBody.innerHTML = "";
		infoBody.append(infoHeader, infoSubeader, infoText);

		
		// Adjust the width of the infoBox based on the content length and add text-wrapping for really long descriptions
		const maxWidth = 400; 
		const minWidth = 300;
		infoBox.style.width = "auto";
		infoBox.style.maxWidth = `${maxWidth}px`;
		infoBox.style.minWidth = `${minWidth}px`;
		infoBody.style.overflowWrap = "break-word";
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
	cy.expandCollapse(generateExpColOptions(layout));
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

const showPrimitives = function (ele) {
	cy.nodes()
		.filter((n) => n.data("labels").includes("Primitive") || n.data("id") === "java.lang.String")
		.style({ display: ele.checked ? "element" : "none" });
};

const showPackages = function (ele) {
	cy.nodes()
		.filter((n) => n.data("labels").includes("Container") && !n.data("labels").includes("Structure"))
		.toggleClass("pkghidden", !ele.checked);
};

const setVisible = function (ele) {
	cy.edges(`[interaction = "${ele.value}"]`).toggleClass(
		"hidden",
		!ele.checked
	);
};

const setLineBends = function (ele) {
	if (ele.checked) {
		cy.edges(`[interaction = "${ele.name}"]`).style("curve-style", ele.value);
	}
};

const fileUpload = function () {
	const fileSelector = document.getElementById("file-selector");
	fileSelector.click();
	fileSelector.addEventListener("change", (event) => {
		const file = event.target.files[0];
		const fileName = file.name;
		document
			.getElementById("filename")
			.textContent = `Software Visualization – ${fileName}`;
		const reader = new FileReader();
		reader.readAsText(file, "UTF-8");
		reader.onload = function (e) {
			const rawGraph = JSON.parse(e.target.result);
			const graph = prepareGraph(rawGraph);
			const style = fetch("style.cycss").then((res) => res.text());
			Promise.all([graph, style]).then(initCy);
		};
	});
};

flip = true;
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

const fillRSFilter = function (_cy) {
	const menuNodes = document.getElementById("menu-nodes");
	const rsFilters = menuNodes.getElementsByClassName('rs-filter-container');
	[...rsFilters].forEach((rsFilter) => menuNodes.removeChild(rsFilter))

	const containerDiv = document.createElement('div');
	containerDiv.setAttribute('class', 'rs-filter-container');
	const rsHeader = document.createElement("p");
	rsHeader.innerHTML = "<b>Role Stereotypes</b>";
	containerDiv.appendChild(rsHeader);

	Object.keys(role_stereotypes).forEach(key => {
		const div = document.createElement("div");
		const label = document.createElement("label");
		label.setAttribute("for", `rs-${role_stereotypes[key].symbol}`);
		label.setAttribute("class", "rslabel");
		label.style.backgroundColor = role_stereotypes[key].color_light;

		const checkbox = document.createElement("input");
		checkbox.setAttribute("type", "checkbox");
		checkbox.setAttribute("id", `rs-${role_stereotypes[key].symbol}`);
		checkbox.setAttribute("name", "showrs");
		checkbox.setAttribute("onchange", "showRS(this)");
		checkbox.setAttribute("value", key);
		checkbox.checked = true;

		const labelText = document.createTextNode(role_stereotypes[key].label || key);
		label.appendChild(checkbox);
		label.appendChild(labelText);

		div.appendChild(label);
		containerDiv.appendChild(div);
	});

	menuNodes.appendChild(containerDiv);
}

const fillRelationshipToggles = function (_cy) {
	const table = document.getElementById("reltab"); // Get the table element
	table.innerHTML = "";

	// Create the thead element
	const thead = document.createElement("thead");

	// Create the tr element for the table header row
	const headerRow = document.createElement("tr");

	// Create the th elements for the table header cells
	const th1 = document.createElement("th");
	th1.textContent = "Connection";
	const th2 = document.createElement("th");
	th2.textContent = "Ortho";
	const th3 = document.createElement("th");
	th3.textContent = "Bezier";

	// Append the th elements to the header row
	headerRow.appendChild(th1);
	headerRow.appendChild(th2);
	headerRow.appendChild(th3);

	// Append the header row to the thead element
	thead.appendChild(headerRow);

	// Append the thead element to the table element
	table.appendChild(thead);

	_cy
		.edges()
		.map((e) => e.data("interaction"))
		.filter((v, i, s) => s.indexOf(v) === i)
		.forEach((l) => {
			// Create a new row (tr)
			const row = document.createElement("tr");

			// Create the first cell (td) with a label and checkbox
			const cell1 = document.createElement("td");
			const label = document.createElement("label");
			label.setAttribute("for", l);
			const checkbox = document.createElement("input");
			checkbox.setAttribute("type", "checkbox");
			checkbox.setAttribute("id", l);
			checkbox.setAttribute("name", "showrels");
			checkbox.setAttribute("onchange", "setVisible(this)");
			checkbox.setAttribute("value", l);
			checkbox.checked = ["calls"].includes(l);
			const labelText = document.createTextNode(l);
			label.appendChild(checkbox);
			label.appendChild(labelText);
			cell1.appendChild(label);
			row.appendChild(cell1);

			// Create the second cell (td) with a radio button for taxi option
			const cell2 = document.createElement("td");
			const taxiRadio = document.createElement("input");
			taxiRadio.setAttribute("type", "radio");
			taxiRadio.setAttribute("onchange", "setLineBends(this)");
			taxiRadio.setAttribute("id", `${l}-ort`);
			taxiRadio.setAttribute("name", l);
			taxiRadio.setAttribute("value", "taxi");
			cell2.appendChild(taxiRadio);
			row.appendChild(cell2);

			// Create the third cell (td) with a radio button for bezier option
			const cell3 = document.createElement("td");
			const bezierRadio = document.createElement("input");
			bezierRadio.setAttribute("type", "radio");
			bezierRadio.setAttribute("onchange", "setLineBends(this)");
			bezierRadio.setAttribute("id", `${l}-bez`);
			bezierRadio.setAttribute("name", l);
			bezierRadio.setAttribute("value", "bezier");
			bezierRadio.checked = true;
			cell3.appendChild(bezierRadio);
			row.appendChild(cell3);

			// Append the row to the table
			table.appendChild(row);
		});

	document.querySelectorAll('input[name="showrels"]').forEach((checkbox) => {
		setVisible(checkbox);
	});
};

const fillFeatureDropdown = function (_cy) {
	let tracesSet = new Set();
	_cy.nodes().forEach((e) => {
		if (e.data("properties.traces")) {
			e.data("properties.traces").forEach((trace) => {
				tracesSet.add(trace);
			});
		}
	});

	let tracesList = [...tracesSet];

	// Get the dropdown element.
	const dropdown = document.getElementById("selectfeature");
	dropdown.innerHTML = "";

	tracesList.forEach(trace => {
		const div = document.createElement("div");
		const label = document.createElement("label");
		label.setAttribute("for", `feature-${trace}`);
		label.setAttribute("class", "featurelabel");

		const checkbox = document.createElement("input");
		checkbox.setAttribute("type", "checkbox");
		checkbox.setAttribute("id", `feature-${trace}`);
		checkbox.setAttribute("name", "showfeatures");
		checkbox.setAttribute("onchange", "showTrace(this)");
		checkbox.setAttribute("value", trace);

		const labelText = document.createTextNode(trace);
		label.appendChild(checkbox);
		label.appendChild(labelText);

		div.appendChild(label);
		dropdown.appendChild(div);
	});
};

const fillBugsDropdown = function (_cy) {
	let bugsSet = new Set();
	_cy.nodes().forEach((e) => {
		if (e.data()["properties"]["vulnerabilities"]) {
			e.data()["properties"]["vulnerabilities"]
				.forEach((bug) => {
					bugsSet.add(bug["analysis_name"])
				});
		}
	});


	let bugList = [...bugsSet]
	// console.log(bugList)

	// Get the dropdown element.
	const dropdown = document.getElementById("tab-bugs");
	dropdown.innerHTML = "";

	bugList.forEach(bug => {
		const div = document.createElement("div");
		const label = document.createElement("label");
		label.setAttribute("for", `bug-${bug}`);
		label.setAttribute("class", "buglabel");

		const checkbox = document.createElement("input");
		checkbox.setAttribute("type", "checkbox");
		checkbox.setAttribute("id", `bug-${bug}`);
		checkbox.setAttribute("name", "showbugs");
		checkbox.setAttribute("onchange", "showBug(this)");
		checkbox.setAttribute("value", bug);

		const labelText = document.createTextNode(bug);
		label.appendChild(checkbox);
		label.appendChild(labelText);

		div.appendChild(label);
		dropdown.appendChild(div);
	});
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

		const cy_classes = cy.nodes().filter((node) => classes.includes(node.data('name')));
		const cy_edges = cy_classes.edgesWith(cy_classes);
		cy_classes.removeClass("dimmed");
		cy_edges.removeClass("dimmed");
		cy.nodes('[properties.kind = "package", properties.kind = "folder"]').removeClass("dimmed");
		cy.nodes('[properties.kind = "file"]').removeClass("dimmed");
	} else {
		cy.elements().removeClass("dimmed");
	}
	cy.edges(`[interaction = "${parentRel}"]`).style("display", "none");
};

const showRS = function (evt) {
	// console.log(evt.checked, evt.value);
	if (evt.checked) {
		cy.nodes(`[properties.roleStereotype = "${evt.value}"]`).removeClass("dimmed");
		cy.nodes(`[properties.roleStereotype = "${evt.value}"]`)
			.connectedEdges()
			.filter((e) => {
				return !e.source().hasClass("dimmed") && !e.target().hasClass("dimmed");
			})
			.removeClass("dimmed");
	} else {
		cy.nodes(`[properties.roleStereotype = "${evt.value}"]`).addClass("dimmed");
		cy.nodes(`[properties.roleStereotype = "${evt.value}"]`)
			.connectedEdges()
			.addClass("dimmed");
	}
};

const showTrace = function (_evt) {

	const trace_names = [...document.getElementsByName("showfeatures")]
		.filter((e) => e.checked)
		.map((e) => e.value);

	[...document.getElementsByClassName("featurelabel")]
		.forEach((e) => { e.style.backgroundColor = ""; });

	if (trace_names.length > 0) {
		const colorMap = {};
		trace_names.forEach((trace, i) => {
			const label = document.querySelector(`label[for="feature-${trace}"]`);
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
		cy.nodes('[properties.kind = "package", properties.kind = "folder"]').removeClass("dimmed");
		feature_nodes.removeClass("feature_reset");
		feature_edges.removeClass("feature_reset");
		feature_nodes.addClass("feature_shown");
		feature_edges.addClass("feature_shown");

		feature_nodes.forEach((node) => {
			const trc = arrayIntersection(
				trace_names,
				node.data("properties.traces")
			);
			node.style(
				"background-gradient-stop-colors",
				trc.map((t) => colorMap[t]).join(" ")
			);
			// console.log(trc.map((t) => colorMap[t]).join(" "));
		});
	} else {
		cy.elements().removeClass("dimmed");
		cy.elements().removeClass("feature_shown");
		cy.elements().addClass("feature_reset");
	}
	cy.edges(`[interaction = "${parentRel}"]`).style("display", "none");
};

const showBug = function (_evt) {

	const bug_names = [...document.getElementsByName("showbugs")]
		.filter((e) => e.checked)
		.map((e) => e.value);

	[...document.getElementsByClassName("buglabel")]
		.forEach((e) => { e.style.backgroundColor = ""; });

	if (bug_names.length > 0) {
		const colorMap = {};
		bug_names.forEach((bug, i) => {
			const labelElement = document.querySelector(`label[for="bug-${bug}"]`);
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
			// console.log(trc.map((t) => colorMap[t]).join(" "));
		});
	} else {
		cy.elements().removeClass("dimmed");
		cy.elements().removeClass("bug_shown");
		cy.elements().addClass("bug_reset");
	}
	cy.edges(`[interaction = "${parentRel}"]`).style("display", "none");
};


function openSidebarTab(evt, cityName) {
	const tabs = document.getElementsByClassName("sidebar-tab");
	[...tabs].forEach(tab => {
		tab.style.display = "none";
	});

	const tablinks = document.getElementsByClassName("tablink");
	[...tablinks].forEach(tablink => {
		tablink.className = tablink.className.replace(" active", "");
	});

	document.getElementById(cityName).style.display = "block";
	evt.currentTarget.className += " active";
}
