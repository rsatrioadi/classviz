
import { counter, mergeCounters } from './utils.js';

export const shortenRoots = function(pCy) {
	const containmentRoots = pCy.nodes((n) => 
		n.data('labels').includes("Container") && !n.data('labels').includes("Structure") && 
		n.incomers(e => e.data('label') === "contains").length===0
	);
	containmentRoots.forEach(cutRootRec);

	function cutRootRec(node) {
		const outgoers = node.outgoers(e => e.data('label') === "contains");
		if (outgoers.length > 1) return;
		const child = outgoers.target();
		if (child && !child.data('labels').includes("Structure")) {
			var name = "";
			if (child.data('properties.qualifiedName')) {
				name = child.data('properties.qualifiedName');
			} else {
				name = `${node.data('properties.simpleName')}/${child.data('properties.simpleName') }`;
			}
			child.data({
				properties: {
					...child.data('properties'),
					simpleName: name
				},
				name: name,
				label: name,
			});
			pCy.$(`[id="${node.id()}"]`).remove();
			cutRootRec(child);
		}
	}
}

export const setParents = function (pCy, relationship, inverted) {
	pCy.edges("#parentRel").removeClass("parentRel");

	pCy.edges(`[interaction = "${relationship}"]`).forEach((edge) => {
		const child = inverted ? edge.source() : edge.target();
		const parent = inverted ? edge.target() : edge.source();

		child.move({ parent: parent.id() });
	});

	pCy.edges(`[interaction = "${relationship}"]`).addClass("parentRel");
}

export const setStyleClasses = function (pCy) {
	pCy.$().forEach((ele) => {
		if (ele.data('label')) {
			ele.addClass(ele.data('label'))
		}
		if (ele.data('labels')) {
			ele.data('labels').forEach(label => ele.addClass(label));
		}
	});
	pCy.$('.Structure').removeClass("Container");
}

export const aggregateLayers = function (pCy) {
	const structures = pCy.nodes(n => n.data('labels').includes("Structure"));
	structures.forEach((clasz) => {
		const methods = clasz.outgoers(e => e.data('label') === "hasScript").targets();

		const layers = [];
		
		layers.push(...methods.map((method) => method.outgoers(e => e.data('label') === "implements").targets().data('properties.simpleName'))
			.map(s => s || 'Undefined'));

		if (layers.length === 0) {
			layers.push("Undefined");
		}

		methods.forEach((method,i) => method.data('properties').layer = layers[i]);

		clasz.data('properties')['layers'] = counter(layers);
		clasz.addClass('layers');
	});

	const containers = pCy.nodes(n => n.data('labels').includes("Container") && !n.data('labels').includes("Structure"));
	containers.forEach((pkg) => {
		const contains = pkg.outgoers(e => e.data('label') === "contains" && e.target().data('labels').includes('Structure'));
		const classes = contains.targets();
		const layerCounters = classes.map(c => c.data('properties.layers'));
		pkg.data('properties')['layers'] = mergeCounters(...layerCounters);
		pkg.addClass('layers');

		// console.log(pkg.id(), pkg.data('properties.layers'));
	});
}
