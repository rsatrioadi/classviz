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
	const filePrefix = new URLSearchParams(window.location.search).get('p');
	if (filePrefix) {
		try {
			const [rawGraph, style] = await Promise.all([
				fetch(`data/${filePrefix}.json`).then(response => response.json()),
				fetch('style.cycss').then(response => response.text())
			]);

			document.getElementById("filename").textContent = `Software Visualization: ${filePrefix}.json`;
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
	const nodes = Object.fromEntries(graphData.elements.nodes.map(node => [node.data.id, node.data]));
	const edges = {};

	for (const edge of graphData.elements.edges) {
		const label = edge.data.label || edge.data.labels.join();
		if (!edges[label]) {
			edges[label] = [];
		}
		edges[label].push(edge.data);
	}

	const invert = (edgeList) =>
		edgeList.map(({ source, target, label, ...rest }) => ({
			source: target,
			target: source,
			label: `inv_${label}`,
			...rest,
		}));

	const compose = function (l1, l2, newlabel) {
		if (l1 && l2){
			const mapping = new Map(
				l2.map((
				{ source, target, label, properties },
				) => [source, { target, label, weight: properties?.weight || 1 }]),
			);

			const result = [];
			for (const { source: s1, target: t1, label, properties } of l1) {
				const mappingEntry = mapping.get(t1);

				if (mappingEntry) {
					const newWeight = mappingEntry.weight * (properties?.weight || 1);
					const existingEntryIndex = result.findIndex((obj) =>
						obj.source === s1 && obj.target === mappingEntry.target
					);

					if (existingEntryIndex === -1) {
						result.push({
							source: s1,
							target: mappingEntry.target,
							label: newlabel || `${label}-${mappingEntry.label}`,
							properties: { weight: newWeight },
						});
					} else {
						result[existingEntryIndex].properties.weight += newWeight;
					}
				}
			}

			return result;
		}
		return [];
	}
	
	const lift = function (rel1, rel2, newlabel) {
		return compose(compose(rel1, rel2), invert(rel1), newlabel);
	}

	const calls = lift(edges.hasScript, edges.invokes, "calls").filter((edge) => edge.source != edge.target);
	const constructs = compose(edges.hasScript, edges.instantiates, "constructs").filter((edge) => edge.source != edge.target);
	const holds = compose(edges.hasVariable, edges.type, "holds").filter((edge) => edge.source != edge.target);
	const accepts = compose(edges.hasScript, compose(edges.hasParameter, edges.type), "accepts").filter((edge) => edge.source != edge.target);
	const returns = compose(edges.hasScript, edges.returnType, "returns").filter((edge) => edge.source != edge.target);

	const nestedClassSet = new Set(
		edges.contains
			.filter(edge => nodes[edge.source]?.labels.includes("Structure"))
			.map(edge => edge.target)
	);
	const topLevelClasses = Object.entries(nodes)
		.filter(([_, node]) => node.labels.includes("Structure"))
		.map(entry => entry[0])
		.filter(item => !nestedClassSet.has(item));
	const topLevelClassSet = new Set(topLevelClasses);

	function extractTopLevelPackages(data) {
		// Remove the last element from each tuple and convert to set for uniqueness
		let uniquePrefixes = new Set(data.map(item => item.slice(0, -1).toString()));

		// Convert set to array and sort uniquePrefixes by length of tuples in ascending order
		let sortedPrefixes = Array.from(uniquePrefixes).map(item => item.split(',')).sort((a, b) => a.length - b.length);

		let results = [];

		for (let prefix of sortedPrefixes) {
			// Check if the prefix is already a prefix of any result
			if (!results.some(result => prefix.slice(0, result.length).toString() === result.toString())) {
				results.push(prefix);
			}
		}

		return results;
	}

	function findPathFromRoot(tree, targetNode) {
		// Step 1: Build a dictionary to map each node to its parent
		let parentMap = {};
		for (let edge of tree) {
			parentMap[edge.target] = edge.source;
		}

		// Step 2: Trace the path from targetNode to the root
		let path = [];
		let currentNode = targetNode;
		while (parentMap.hasOwnProperty(currentNode)) {
			path.push(currentNode);
			currentNode = parentMap[currentNode];
		}

		// Step 3: Append the root node to the path
		if (currentNode !== null) {
			path.push(currentNode);
		}

		// Step 4: Reverse the path to get root to targetNode order
		path.reverse();

		return path;
	}

	let pkgWithClasses = new Set(
		edges.contains
			.filter(edge => nodes[edge.source].labels.includes('Container') && nodes[edge.target].labels.includes('Structure'))
			.map(edge => edge.source)
	);

	let pkgPaths = Array.from(pkgWithClasses).map(pkgId => findPathFromRoot(edges.contains, pkgId));
	let topLevelPackages = extractTopLevelPackages(pkgPaths);
	let packagesToRemove = topLevelPackages.flatMap(pkg => pkg.slice(0, -1));
	
	let newContains = edges.contains;
	if (topLevelPackages && Array.isArray(topLevelPackages[0]) && topLevelPackages[0].length > 1) {
		console.log(topLevelPackages);
		newContains = edges.contains
			.filter((edge) => !topLevelClassSet.has(edge.source))
			.filter((edge) => !packagesToRemove.includes(edge.source) && !packagesToRemove.includes(edge.target));

		let components = topLevelPackages.map(pkg => pkg[pkg.length - 1]);
		components.forEach((component) => {
			nodes[component].properties.name = nodes[component].properties.qualifiedName;
		});
	}
	
	const nests = edges.nests ?? edges.contains
		.filter((edge) => topLevelClassSet.has(edge.source))
		.map((edge) => ({ ...edge, label: "nests" }));

	const filterNodesByLabels = function (data, labels) {
		return Object.entries(data).reduce((filteredData, [key, object]) => {
			if (object.labels.some((label) => labels.includes(label))) {
				filteredData[key] = object;
			}
			return filteredData;
		}, {});
	}

	function filterNodesByIds(obj, ids) {
		return Object.keys(obj).reduce((acc, key) => {
			if (!ids.includes(key)) {
				acc[key] = obj[key];
			}
			return acc;
		}, {});
	}

	const abstractNodes = filterNodesByIds(filterNodesByLabels(nodes, ["Container", "Structure", "Primitive", "Problem"]), packagesToRemove);
	const abstractEdges = {
		contains: newContains,
		specializes: edges.specializes,
		nests,
		calls,
		constructs,
		holds,
		accepts,
		returns,
	};

	function cleanEdges(cytoscapeJson) {
		// Extract nodes and edges from the input JSON object
		const nodes = cytoscapeJson.elements.nodes;
		const edges = cytoscapeJson.elements.edges;

		// Create a set of valid node ids
		const nodeIds = new Set(nodes.map(node => node.data.id));

		// Filter edges to remove those with source or target not in nodeIds
		const validEdges = edges.filter(edge =>
			nodeIds.has(edge.data.source) && nodeIds.has(edge.data.target)
		);

		// Create a new Cytoscape JSON object with cleaned edges
		const cleanedCytoscapeJson = {
			...cytoscapeJson,
			elements: {
				nodes: nodes,
				edges: validEdges
			}
		};

		return cleanedCytoscapeJson;
	}

	const abstractGraph = {
		elements: {
			nodes: Object.values(abstractNodes).map((node) => ({ data: { ...node } })),
			edges: Object.values(abstractEdges).flat().map((edge) => ({
				data: { ...edge },
			})),
		},
	};

	return cleanEdges(abstractGraph);
}

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

	const max_pkg_depth = Math.max( ...cy.nodes('[properties.kind = "package"]').map((n)=>n.ancestors().length));

	// Isolate nodes with kind equals to package
	cy.nodes('[properties.kind = "package"]').forEach((n) => {
		const d = 146;
		const l = 236;
		const depth = n.ancestors().length;
		const grey = Math.max(l - ((max_pkg_depth - depth) * 15), d);
		n.style('background-color', `rgb(${grey},${grey},${grey})`);
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
		cy.nodes('[properties.kind = "package"]').removeClass("dimmed");
		cy.nodes('[properties.kind = "file"]').removeClass("dimmed");
	} else {
		cy.elements().removeClass("dimmed");
	}
	cy.edges(`[interaction = "${parentRel}"]`).style("display", "none");
};

const showRS = function (evt) {
	// console.log(evt.checked, evt.value);
	if (evt.checked) {
		cy.nodes(`[properties.rs = "${evt.value}"]`).removeClass("dimmed");
		cy.nodes(`[properties.rs = "${evt.value}"]`)
			.connectedEdges()
			.filter((e) => {
				return !e.source().hasClass("dimmed") && !e.target().hasClass("dimmed");
			})
			.removeClass("dimmed");
	} else {
		cy.nodes(`[properties.rs = "${evt.value}"]`).addClass("dimmed");
		cy.nodes(`[properties.rs = "${evt.value}"]`)
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
		cy.nodes('[properties.kind = "package"]').removeClass("dimmed");
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
