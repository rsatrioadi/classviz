/*
TODO
- animate dynamic aspects
- summaries to sidebar
- architecture recovery/clustering
- collapse the classes
- tweak klay parameters
*/
import { blacken, ft_colors, hslString, layerColorsFrom, roleStereotypeColors, roleStereotypeOrder, roleStereotypes } from './src/colors.js';
import { clearInfo, displayInfo } from './src/infoPanel.js';
import { $, $all, h, on, r, toJson, toText } from './src/shorthands.js';

import { aggregateLayers, homogenizeDepthsOptimized, setParents, setStyleClasses, shortenRoots, adoptOrphans, removePrimitives, collectRoleStereotypes } from './src/headlessTransformations.js';
import { adjustEdgeWidths, cacheNodeStyles, liftEdges, lowerEdges, recolorContainers, removeContainmentEdges, removeExtraNodes, setLayerStyles, setRsStyles, showNeighborhood } from './src/visualTransformations.js';
import { arrayIntersection, getScratch, nodeHasLabel, edgeHasLabel, isPureContainer } from './src/utils.js';
import { displayLegend } from './src/nodesPanel.js';
import { fillFeatureDropdown } from './src/edgesPanel.js';
import { highlight, relayout } from './src/graphPanel.js';
import { prepareGraph } from './src/migration.js';

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

export let parentRel = "encloses";

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

		hcy.startBatch();

		homogenizeDepthsOptimized(hcy, 
			e => edgeHasLabel(e, "encloses"),
			n => nodeHasLabel(n, "Scope"),
			n => nodeHasLabel(n, "Type"));
		// console.log(hcy.json());
		shortenRoots(hcy);
		removePrimitives(hcy);
		adoptOrphans(hcy);
		collectRoleStereotypes(hcy);
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

		cy.startBatch();

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

		if (cy.edges().length < 5000) relayout(cy, $('#selectlayout').options[$('#selectlayout').selectedIndex].value);

		cy.endBatch();

		// const cbShowPackages = $("#showPackages");
		// cbShowPackages.checked = true;
		// showPackages(cy, cbShowPackages);

		zoom.value = cy.zoom();
	}
}

function initLayerColors(pCy) {
	const topLayers = pCy.nodes(n => 
		nodeHasLabel(n, "Category") && 
		n.data('properties.kind') === "architectural layer" && 
		n.incomers(e => edgeHasLabel(e, "succeeds")).empty() &&
		!n.outgoers(e => edgeHasLabel(e, "succeeds")).empty() 
	);
	window.layers = [...topLayers.map(n => n.data('properties.simpleName')).filter(n => n).map(n => n || "Undefined")];
	var currentLayers = topLayers;
	while (!currentLayers.empty()) {
		const nextLayers = currentLayers.outgoers(e => e.data('label') === "succeeds").targets();
		layers.push(...nextLayers.map(n => n.data('properties.simpleName')).filter(n => n).map(n => n || "Undefined"));
		currentLayers = nextLayers;
	}
	const orphans = pCy.nodes(n =>
		nodeHasLabel(n, "Category") &&
		n.data('properties.kind') === "architectural layer" &&
		n.incomers(e => edgeHasLabel(e, "succeeds")).empty() &&
		n.outgoers(e => edgeHasLabel(e, "succeeds")).empty()
	);
	orphans.forEach((node) => {
		layers.push(node.data('properties.simpleName'));
	});
	if (!layers.includes('Undetermined')) {
		layers.push('Undetermined');
	}
	window.layer_colors = layerColorsFrom(layers, ["Undetermined"]);
	colorMap['style_layer'] = window.layer_colors;
	colorOrder['style_layer'] = window.layers;
}

function initRsColors() {
	colorMap['style_rs'] = roleStereotypeColors;
	colorOrder['style_rs'] = roleStereotypeOrder;
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

	// on('change', $('#showPackages'),   () => showPackages(cy, $('#showPackages')));
	on('change', $all('.coloringlabel'), colorNodes(cy));

	const cy_div = $('#cy');

	cy.on('select', "node", (event) => {
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

	cy.on('unselect', "node", (event) => {
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
		const edgeLabels = $all('input[name="showrels"]')
			.filter((cb) => cb.checked)
			.map((cb) => cb.value);

		const edges = event.target.descendants().merge(event.target)
			.connectedEdges()
			.filter((e) => edgeLabels.includes(e.data("label")));
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
		// console.log(getScratch(evt.target, 'bundle'));
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

// const showPackages = function (pCy, e) {
// 	pCy.nodes()
// 		.filter((n) => n.data("labels").includes("Container") && !n.data("labels").includes("Structure"))
// 		.toggleClass("pkghidden", !e.checked);
// };

const hiddenEdges = {};
const setVisible = function (e) {
	if (!e.checked) {
		hiddenEdges[e.value] = cy.edges(`[label = "${e.value}"]`);
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

const setLineBends = function ({checked, name, value}) {
	if (checked) {
		cy.edges(`[label = "${name}"]`).style("curve-style", value);
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
		...Object.keys(roleStereotypes).map(key =>
			h("div", {}, [
				h("label", {
					for: `rs-${roleStereotypes[key].symbol}`,
					class: "rslabel",
					style: `color: ${hslString(blacken(roleStereotypeColors[key], 0.1))}; font-weight: bold;`
				}, [
					h("input", {
						type: "checkbox",
						id: `rs-${roleStereotypes[key].symbol}`,
						name: "showrs",
						value: key
					}, [], {
						change: (event) => showRS(event.target)
					}, (e) => e.checked = true),
					roleStereotypes[key].label || key
				])]))]);
}

const fillRelationshipToggles = function (pCy) {

	const edgeLabels = pCy.edges()
		.map((e) => e.data("label"))
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
						click: (event) => lowerEdges(cy, event.target.value)
					})
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

	pCy.edges(`[label = "${parentRel}"]`).style("display", "none");
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
			const trc = arrayIntersection(bug_names, node.data('properties')["vulnerabilities"].map((vul) => vul["analysis_name"]));
			node.style("background-gradient-stop-colors", trc.map((t) => bugColorMap[t]).join(" "));
		});
	} else {
		pCy.elements().removeClass("dimmed");
		pCy.elements().removeClass("bug_shown");
		pCy.elements().addClass("bug_reset");
	}
	pCy.edges(`[label = "${parentRel}"]`).style("display", "none");
};

window.addEventListener("keydown", (e) => {
	if (e.key === "Control") {
		cy.boxSelectionEnabled(false);
		cy.nodes().panify();
	}
});

window.addEventListener("keyup", (e) => {
	if (e.key === "Control") {
		cy.nodes().unpanify();
		cy.boxSelectionEnabled(true);
	}
});