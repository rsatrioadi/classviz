import { blacken, hslString, role_stereotype_colors, whiten } from "./colors.js";
import { addScratch, counterToPercentage, cumulative, hasLabel, isPureContainer, repeatMiddle } from "./utils.js";

export const recolorContainers = function (pCy) {
	const max_pkg_depth = Math.max(...pCy.nodes(isPureContainer).map((n) => n.ancestors().length));

	// Isolate nodes with kind equals to package
	pCy.nodes(isPureContainer).forEach((n) => {
		const dark = 0.75;
		const light = 0.9;
		const depth = n.ancestors().length;
		const l = light - (light-dark)*(max_pkg_depth-depth)/max_pkg_depth;
		n.style('background-color', hslString({h:0,s:0,l}));
		n.style('text-background-color', hslString({ h: 0, s: 0, l }));
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
		e.target().parent() !== e.source().parent()).filter((e) => 
			["calls","constructs"].includes(e.data('label'))
		);
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
			const layer_percentages = counterToPercentage({ ...n.data("properties.layers") });
			const style = {
				'border-color': "grey",
				// 'background-color': null,
				'background-fill': 'linear-gradient',
				'background-gradient-stop-positions': repeatMiddle(cumulative(layers.map(l => Math.floor(layer_percentages[l] * 100) || 0))).map(p => `${p}`).join(" "),
			};
			if (isPureContainer(n)) {
				style['background-gradient-direction'] = "to-bottom-right";
				style['background-gradient-stop-colors'] = layers.map(l => layer_colors[l]).map((c) => hslString(whiten(c, 0.8))).map(c => `${c} ${c}`).join(" ");
			} else {
				style['background-gradient-direction'] = "to-right";
				style['background-gradient-stop-colors'] = layers.map(l => layer_colors[l]).map((c) => hslString(whiten(c, 0.5))).map(c => `${c} ${c}`).join(" ");
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
				'border-color': hslString(role_stereotype_colors[clasz.data('properties.roleStereotype'	)] || role_stereotype_colors['-']),
				'background-fill': "solid",
				'background-color': hslString(whiten(role_stereotype_colors[clasz.data('properties.roleStereotype')] || role_stereotype_colors['-'], 0.75)),
			});
		}
	});
}

export const removeExtraNodes = function (pCy) {
	const extras = pCy.nodes(n => !hasLabel(n, "Container") && !hasLabel(n, "Structure")
		&& !hasLabel(n, "Type") && !hasLabel(n, "Primitive"));
	extras.remove();
}
