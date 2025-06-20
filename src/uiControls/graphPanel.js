import { parentRel } from '../../script.js';
import { showNeighborhood } from '../graphProcessing/visualTransformations.js';

/* Sidebar Utility Functions */
export const relayout = function (pCy, layout) {
	pCy.$().layout({
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

// Highlight nodes based on query
export const highlight = function (pCy, text) {
	if (text) {
		const classNames = text.split(/[,\s]+/);
		pCy.elements().addClass("dimmed");
		pCy.elements(".hidden").removeClass("hidden").addClass("hidden");
		pCy.elements().removeClass("highlight");

		const classes = pCy.nodes(node => classNames.some(cn => node.data('name').includes(cn)));
		const edges = classes.edgesWith(classes);
		classes.removeClass("dimmed");
		edges.removeClass("dimmed");
		// pCy.nodes(isPureContainer).removeClass("dimmed");

		classes.addClass('highlight');

		showNeighborhood(classes);

		pCy.center(classes);
	} else {
		pCy.elements().removeClass('dimmed');
		pCy.elements().removeClass('highlight');
		pCy.fit();
	}
	pCy.edges(`[label = "${parentRel}"]`).style("display", "none");
};

