import { blacken, hslString, role_stereotype_colors, whiten } from "./colors.js";
import { addScratch, counterToPercentage, cumulative, repeatMiddle } from "./utils.js";

export const recolorContainers = function (pCy) {
	const isContainer = (n) => n.data('labels').includes("Container") && !n.data('labels').includes("Structure");
	const max_pkg_depth = Math.max(...pCy.nodes(isContainer).map((n) => n.ancestors().length));

	// Isolate nodes with kind equals to package
	pCy.nodes(isContainer).forEach((n) => {
		const d = 146;
		const l = 236;
		const depth = n.ancestors().length;
		const grey = Math.max(l - ((max_pkg_depth - depth) * 15), d);
		n.style('background-color', `rgb(${grey},${grey},${grey})`);
		n.style('text-background-color', `rgb(${grey},${grey},${grey})`);
	});
}

export const cacheNodeStyles = function (pCy) {
	pCy.nodes().forEach((n) => {
		const style = n.style();
		addScratch(n, 'style_default', {
			'color': style['color'],
			'border-color': style['border-color'],
			'background-color': style['background-color'],
			'background-fill': style['background-fill']
		});
	});
}

export const liftEdges = function (pCy) {
	const edges = pCy.edges((e) =>
		e.source().data('labels').includes("Structure") &&
		e.target().data('labels').includes("Structure") &&
		e.target().parent() !== e.source().parent());
	const newEdges = {};

	edges.forEach((e) => {
		const srcId = e.source().parent().id();
		const tgtId = e.target().parent().id();
		if (srcId && tgtId) {
			const key = `${srcId}-${e.data('label')}-${tgtId}`;
			if (!newEdges[key]) {
				newEdges[key] = {
					group: "edges", data: {
						source: srcId,
						target: tgtId,
						label: e.data('label'),
						interaction: e.data('label'),
						properties: {
							...e.data('properties'),
							weight: 0,
							metaSrc: "lifting"
						}
					}
				};
			}
			newEdges[key].data.properties["weight"] += 1;
		}
	});
	pCy.add(Object.values(newEdges));
	edges.remove();
}

export const removeContainmentEdges = function (pCy) {
	pCy.edges('[label="contains"]').remove();
}

export const adjustEdgeWidths = function (pCy) {
	pCy.edges().forEach((e) => {
		e.style('width', `${Math.pow(e.data('properties').weight, 0.7) * 2}px`)
	});
}

export const setLayerStyles = function (pCy, layers, layer_colors) {

	// console.log(layer_colors);
	pCy.nodes(".Container, .Structure").forEach(n => {
		if (Object.keys({ ...n.data("properties.layers") }).length > 0) {
			const isContainer = n.data('labels').includes("Container") && !n.data('labels').includes("Structure");
			const layer_percentages = counterToPercentage({ ...n.data("properties.layers") });
			const style = {
				'border-color': "grey",
				// 'background-color': null,
				'background-fill': 'linear-gradient',
				'background-gradient-stop-positions': repeatMiddle(cumulative(layers.map(l => Math.floor(layer_percentages[l] * 100) || 0))).map(p => `${p}`).join(" "),
			};
			if (isContainer) {
				style['background-gradient-direction'] = "to-bottom-right";
				style['background-gradient-stop-colors'] = layers.map(l => layer_colors[l]).map((c) => hslString(whiten(c, 0.7))).map(c => `${c} ${c}`).join(" ");
			} else {
				style['background-gradient-direction'] = "to-right";
				style['background-gradient-stop-colors'] = layers.map(l => layer_colors[l]).map((c) => hslString(blacken(c, 0.1))).map(c => `${c} ${c}`).join(" ");
			}
			// console.log(cy.$(`[id="${n.id()}"]`).id(), style);
			addScratch(n, 'style_layer', style);
			// cy.$(`[id="${n.id()}"]`).style(style);
		}
	});
	const structures = pCy.nodes(n => n.data('labels').includes("Structure"));
	structures.forEach((clasz) => {
		const methods = clasz.outgoers(e => e.data('label') === "hasScript")
			.targets()
			.map(m => ({ ...m.data(), color: layer_colors[m.data('properties.layer')] }));
		methods.sort((a, b) => a.properties['simpleName'].localeCompare(b.properties['simpleName']));
		methods.sort((a, b) => layers.indexOf(a.properties['layer']) - layers.indexOf(b.properties['layer']));

		addScratch(clasz, 'methods', methods);
	});
}

export const setRsStyles = function (pCy) {

	const structures = pCy.nodes(n => n.data('labels').includes("Structure"));
	structures.forEach((clasz) => {
		if (clasz.data('properties.roleStereotype')) {
			addScratch(clasz, 'style_rs', {
				'border-color': hslString(role_stereotype_colors[clasz.data('properties.roleStereotype')]),
				'background-fill': "solid",
				'background-color': hslString(whiten(role_stereotype_colors[clasz.data('properties.roleStereotype')], 0.75)),
			});
		}
	});
}

export const removeExtraNodes = function (pCy) {
	const extras = pCy.nodes(n => !n.data('labels').includes("Container") && !n.data('labels').includes("Structure")
		&& !n.data('labels').includes("Type") && !n.data('labels').includes("Primitive"));
	extras.remove();
}
