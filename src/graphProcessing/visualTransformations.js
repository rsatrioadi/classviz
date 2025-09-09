import { hslString, roleStereotypeColors, whiten } from "../utilities/colors.js";
import { $all } from "../utilities/shorthands.js";
import { addScratch, counterToPercentage, cumulative, nodeHasLabel, isPureContainer, repeatMiddle, edgeHasLabel } from "../utilities/utils.js";

export const recolorContainers = function (pCy) {
	const max_pkg_depth = Math.max(...pCy.nodes(isPureContainer).map((n) => n.ancestors().length));

	// Isolate containers
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

export const liftEdges = function (pCy, label) {
	const edges = pCy.edges((e) =>
		e.target().parent() !== e.source().parent()).filter((e) => 
			edgeHasLabel(e, label)
		);
	const newEdges = {};

	edges.forEach((e) => {
		const srcId = e.source().parent().id();
		const tgtId = e.target().parent().id();
		if (!('level' in e.data('properties'))) {
			e.data('properties')['level'] = 0;
		}
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
							level: e.data('properties.level')+1,
							weight: 0,
							bundle: [],
							metaSrc: "lifting"
						}
					}
				};
			}
			newEdges[key].data.properties["weight"] += e.data('properties.weight');
			newEdges[key].data.properties["bundle"].push(e);
		}
	});
	pCy.add(Object.values(newEdges));
	edges.remove();

	adjustEdgeWidths(pCy);
}

export const lowerEdges = function (pCy, label) {
	const maxLevel = Math.max(...cy.edges(`[label="${label}"]`)
		.map((e) => e.data('properties.level'))
		.filter((l) => Number.isFinite(l)));
	cy.edges(`[label="${label}"]`)
		.filter((e) => e.data('properties.level') === maxLevel)
		.forEach((edge) => {
			// console.log(edge.data('properties')['bundle'])
			if ('bundle' in edge.data('properties')) {
				try {
					edge.data('properties.bundle').forEach((bundledEdge) => {
						bundledEdge.restore();
					});
					edge.remove();
				} finally {
					;
				}
			}
		});
	adjustEdgeWidths(pCy);
};

export const removeContainmentEdges = function (pCy) {
	pCy.edges('[label="encloses"]').remove();
}

export const adjustEdgeWidths = function (pCy) {
	pCy.edges().forEach((e) => {
		e.style('width', `${Math.pow(e.data('properties.weight'), 0.7) * 2}px`)
	});
}

export const setLayerStyles = function (pCy, layers, layer_colors) {

	// console.log(layer_colors);
	pCy.nodes(".Scope, .Type").forEach(n => {
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
	const structures = pCy.nodes(n => nodeHasLabel(n, 'Type'));
	structures.forEach((clasz) => {
		const methods = clasz.outgoers(e => edgeHasLabel(e, "encapsulates"))
			.targets(n => nodeHasLabel(n, 'Operation'))
			.map(m => ({ ...m.data(), color: layer_colors[m.data('properties.layer')] }));
		methods.sort((a, b) => a.properties['simpleName'].localeCompare(b.properties['simpleName']));
		methods.sort((a, b) => layers.indexOf(a.properties['layer']) - layers.indexOf(b.properties['layer']));

		addScratch(clasz, 'methods', methods);
	});
}

export const setRsStyles = function (pCy) {

	const structures = pCy.nodes(n => nodeHasLabel(n, 'Type'));
	structures.forEach((clasz) => {
		if (clasz.data('properties.roleStereotype')) {
			addScratch(clasz, 'style_rs', {
				'border-color': hslString(roleStereotypeColors[clasz.data('properties.roleStereotype'	)] || roleStereotypeColors['-']),
				'background-fill': "solid",
				'background-color': hslString(whiten(roleStereotypeColors[clasz.data('properties.roleStereotype')] || roleStereotypeColors['-'], 0.75)),
			});
		}
	});
}

export const removeExtraNodes = function (pCy) {
	const extras = pCy.nodes(n => 
		!nodeHasLabel(n, "Scope") && 
		!nodeHasLabel(n, "Type") && 
		!nodeHasLabel(n, "Primitive"));
	extras.remove();
};

export const showNeighborhood = function (nodes) {

	const to_check = nodes.children().union(nodes);
	to_check.union(nodes.ancestors()).removeClass("dimmed");

	// currently visible relationship types
	const edge_labels = $all('input[name="showrels"]')
		.filter(cb => cb.checked)
		.map(cb => cb.value);

	const edges = to_check.connectedEdges((e) => edge_labels.includes(e.data("label")));
	edges
		.union(edges.targets())
		.union(edges.targets().ancestors())
		.union(edges.sources())
		.union(edges.sources().ancestors())
		.removeClass("dimmed");
};

