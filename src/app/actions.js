import { clearInfo, displayInfo } from '../uiControls/infoPanel.js';
import { displayLegend } from '../uiControls/nodesPanel.js';
import { fillFeatureDropdown } from '../uiControls/edgesPanel.js';
import { highlight, relayout } from '../uiControls/graphPanel.js';
import { adjustEdgeWidths, liftEdges, lowerEdges, showNeighborhood } from '../graphProcessing/visualTransformations.js';
import { ft_colors } from '../utilities/colors.js';
import { arrayIntersection, getScratch, edgeHasLabel, isPureContainer, nodeHasLabel } from '../utilities/utils.js';
import { deriveColorLegendModel, deriveRelationshipLabels } from './pure.js';

export function createActions({ state, ui }) {
	function colorNodes(event, pCy = state.cy) {
		const selectedColorMode = event.target.value;
		pCy.nodes().forEach((n) => {
			const style = getScratch(n, selectedColorMode) || getScratch(n, 'style_default');
			n.style(style);
		});
		const legend = deriveColorLegendModel(selectedColorMode, state.colorMap, state.colorOrder);
		displayLegend('#coloring-legend', legend.colors, legend.order);
	}

	function applyInitialColor(pCy = state.cy) {
		const selectedColorMode = ui.$all('[name = "coloring"]').filter((e) => e.checked)[0];
		colorNodes({ target: { value: selectedColorMode ? selectedColorMode.value : 'style_default' } }, pCy);
	}

	function toggleVisibility() {
		if (!state.cy) return;
		state.cy.style()
			.selector('.dimmed')
			.style({
				display: state.flip ? 'none' : 'element',
			})
			.update();
		state.flip = !state.flip;
	}

	function setEdgeVisibility(checkbox) {
		if (!state.cy) return;
		if (!checkbox.checked) {
			state.hiddenEdges[checkbox.value] = state.cy.edges(`[label = "${checkbox.value}"]`);
			state.hiddenEdges[checkbox.value].remove();
		} else if (state.hiddenEdges[checkbox.value]) {
			state.hiddenEdges[checkbox.value].restore();
			state.hiddenEdges[checkbox.value] = null;
		}
	}

	function setLineBends({ checked, name, value }) {
		if (!state.cy || !checked) return;
		state.cy.edges(`[label = "${name}"]`).style('curve-style', value);
	}

	function fillRelationshipToggles(pCy = state.cy) {
		const edgeLabels = deriveRelationshipLabels(pCy.json().elements);
		ui.renderRelationshipToggles(edgeLabels, {
			onToggleEdge: setEdgeVisibility,
			onLineBend: setLineBends,
			onLift: (label) => liftEdges(state.cy, label),
			onLower: (label) => lowerEdges(state.cy, label),
		});
		ui.$all('input[name="showrels"]').forEach(setEdgeVisibility);
	}

	function showTrace(_event, pCy = state.cy) {
		const traceNames = ui.$all('[name="showfeatures"]').filter((e) => e.checked).map((e) => e.value);
		ui.$all('.featurelabel').forEach((e) => {
			e.style.backgroundColor = '';
		});

		pCy.elements().removeClass('dimmed');
		pCy.elements().removeClass('feature_shown');
		pCy.elements().addClass('feature_reset');

		if (traceNames.length > 0) {
			const traceColorMap = {};
			traceNames.forEach((trace, i) => {
				const label = ui.$(`label[for="feature-${trace}"]`);
				if (label) label.style.backgroundColor = ft_colors[i];
				traceColorMap[trace] = ft_colors[i];
			});

			const featureNodes = pCy.nodes().filter((node) => traceNames.some((trace) => node.data('properties.traces') && node.data('properties.traces').includes(trace)));
			const featureEdges = featureNodes.edgesWith(featureNodes).union(featureNodes.ancestors().edgesWith(featureNodes.ancestors()));

			pCy.elements().addClass('dimmed');
			pCy.elements('.hidden').removeClass('hidden').addClass('hidden');
			featureNodes.removeClass('dimmed');
			featureEdges.removeClass('dimmed');
			pCy.nodes(isPureContainer).removeClass('dimmed');

			featureNodes.forEach((node) => {
				const trc = arrayIntersection(traceNames, node.data('properties.traces'));
				node.style({
					'background-fill': 'linear-gradient',
					'background-gradient-direction': 'to-right',
					'background-gradient-stop-positions': null,
					'background-gradient-stop-colors': trc.map((t) => traceColorMap[t]).join(' '),
				});
			});
		} else {
			applyInitialColor(pCy);
		}

		pCy.edges(`[label = "${state.parentRel}"]`).style('display', 'none');
	}

	function showBug(_event, pCy = state.cy) {
		const bugNames = ui.$all('[name="showbugs"]').filter((e) => e.checked).map((e) => e.value);
		ui.$all('.buglabel').forEach((e) => {
			e.style.backgroundColor = '';
		});

		if (bugNames.length > 0) {
			const bugColorMap = {};
			bugNames.forEach((bug, i) => {
				const labelElement = ui.$(`label[for="bug-${bug}"]`);
				if (labelElement) labelElement.style.backgroundColor = ft_colors[i];
				bugColorMap[bug] = ft_colors[i];
			});

			const bugNodes = pCy.nodes().filter((node) => bugNames.some((bug) => {
				const vulnerabilities = node.data('properties.vulnerabilities');
				return Array.isArray(vulnerabilities) && vulnerabilities.some((entry) => entry.analysis_name === bug);
			}));

			pCy.elements().addClass('dimmed');
			pCy.elements('.hidden').removeClass('hidden').addClass('hidden');
			bugNodes.removeClass('dimmed');
			pCy.nodes('[properties.kind = "file"]').removeClass('dimmed');
			bugNodes.removeClass('bug_reset');
			bugNodes.addClass('bug_shown');

			bugNodes.forEach((node) => {
				const trc = arrayIntersection(bugNames, node.data('properties').vulnerabilities.map((v) => v.analysis_name));
				node.style('background-gradient-stop-colors', trc.map((t) => bugColorMap[t]).join(' '));
			});
		} else {
			pCy.elements().removeClass('dimmed');
			pCy.elements().removeClass('bug_shown');
			pCy.elements().addClass('bug_reset');
		}
		pCy.edges(`[label = "${state.parentRel}"]`).style('display', 'none');
	}

	function bindGraphPanelControls() {
		ui.on('click', ui.$('#btn-reset'), () => highlight(state.cy, ''));
		ui.on('click', ui.$('#btn-relayout'), () => relayout(state.cy, ui.$('#selectlayout').options[ui.$('#selectlayout').selectedIndex].value));
		ui.on('click', ui.$('#btn-highlight'), () => highlight(state.cy, ui.$('#highlight').value));
		ui.on('change', ui.$all('.coloringlabel'), (event) => colorNodes(event));
	}

	function bindCyInteractions() {
		const cy = state.cy;
		const cyDiv = ui.$('#cy');

		cy.on('select', 'node', (event) => {
			event.target.addClass('selected');
			displayInfo('#infobody')(event.target);
			if (ui.$('#infobox').style.display !== 'flex') {
				ui.$('#infobox').style.display = 'flex';
				cyDiv.style.right = '270px';
				cy.animate({ panBy: { x: -135 } }, { duration: 200 });
			}
		});

		cy.on('unselect', 'node', (event) => {
			event.target.removeClass('selected');
			setTimeout(() => {
				if (cy.$('node:selected').length === 0) {
					event.target.cy().nodes().removeClass('highlight');
					clearInfo('#infobody');
					ui.$('#infobox').style.display = 'none';
					cyDiv.style.right = '0px';
					cy.animate({ panBy: { x: 135 } }, { duration: 200 });
				}
			}, 1);
		});

		cy.on('cxttap', 'node,edge', (event) => {
			event.target.addClass('dimmed');
			const edgeLabels = ui.$all('input[name="showrels"]').filter((cb) => cb.checked).map((cb) => cb.value);
			const edges = event.target.descendants().merge(event.target).connectedEdges().filter((e) => edgeLabels.includes(e.data('label')));
			edges.addClass('dimmed');
		});

		cy.on('tap', 'node', (event) => {
			showNeighborhood(event.target);
		});

		cy.on('tap', 'edge', (evt) => {
			evt.target.removeClass('dimmed');
			evt.target.connectedNodes().removeClass('dimmed');
		});

		cy.on('mouseover', 'node', (evt) => {
			if (cy.zoom() < 0.75) showTooltip(evt.target.data('properties.qualifiedName'), evt.originalEvent);
		});
		cy.on('mousemove', 'node', (evt) => {
			if (cy.zoom() < 0.75) moveTooltip(evt.originalEvent);
			else hideTooltip();
		});
		cy.on('mouseout', 'node', () => hideTooltip());
	}

	function bindWindowShortcuts() {
		ui.on('keydown', window, (e) => {
			if (e.key === 'Control' && state.cy) {
				state.cy.boxSelectionEnabled(false);
				state.cy.nodes().panify();
			}
		});

		ui.on('keyup', window, (e) => {
			if (e.key === 'Control' && state.cy) {
				state.cy.nodes().unpanify();
				state.cy.boxSelectionEnabled(true);
			}
		});

		ui.on('blur', window, () => {
			if (state.cy) {
				state.cy.nodes().unpanify();
				state.cy.boxSelectionEnabled(true);
			}
		});

		ui.on('visibilitychange', document, () => {
			if (document.visibilityState !== 'visible' && state.cy) {
				state.cy.nodes().unpanify();
				state.cy.boxSelectionEnabled(true);
			}
		});
	}

	function initializePostRender() {
		applyInitialColor(state.cy);
		fillRelationshipToggles(state.cy);
		fillFeatureDropdown(state.cy, showTrace);
		bindGraphPanelControls();
		bindCyInteractions();
		state.zoom.value = state.cy.zoom();
		if (state.cy.edges().length < 5000) {
			relayout(state.cy, ui.$('#selectlayout').options[ui.$('#selectlayout').selectedIndex].value);
		}
	}

	function setClassVisibilityTap(gesture) {
		if (!state.cy) return;
		state.cy.nodes((n) => nodeHasLabel(n, 'Type')).emit(gesture);
	}

	function showTooltip(text, event) {
		const tooltip = ui.$('#tooltip');
		moveTooltip(event);
		tooltip.textContent = text;
		tooltip.style.display = 'block';
	}

	function moveTooltip(event) {
		const tooltip = ui.$('#tooltip');
		const tooltipRect = tooltip.getBoundingClientRect();
		const targetRect = event.target.getBoundingClientRect();
		let tooltipX = event.clientX;
		let tooltipY = event.clientY - tooltipRect.height;

		if (tooltipX + tooltipRect.width > targetRect.right) {
			tooltipX = targetRect.right - tooltipRect.width - 5;
		}
		if (tooltipY < targetRect.top) {
			tooltipY = targetRect.top + 5;
		}

		tooltip.style.left = `${tooltipX}px`;
		tooltip.style.top = `${tooltipY}px`;
	}

	function hideTooltip() {
		ui.$('#tooltip').style.display = 'none';
	}

	function saveAsSvg(filename) {
		if (!state.cy) return;
		const svgContent = state.cy.svg({ scale: 1, full: true, bg: 'beige' });
		const blob = new Blob([svgContent], { type: 'image/svg+xml;charset=utf-8' });
		saveAs(blob, filename);
	}

	function getSvgUrl() {
		if (!state.cy) return '';
		const svgContent = state.cy.svg({ scale: 1, full: true, bg: 'beige' });
		const blob = new Blob([svgContent], { type: 'image/svg+xml;charset=utf-8' });
		return URL.createObjectURL(blob);
	}

	function normalizeAfterEdgeMutation() {
		if (!state.cy) return;
		adjustEdgeWidths(state.cy);
	}

	return {
		applyInitialColor,
		colorNodes,
		toggleVisibility,
		setEdgeVisibility,
		setLineBends,
		fillRelationshipToggles,
		showTrace,
		showBug,
		bindWindowShortcuts,
		initializePostRender,
		setClassVisibilityTap,
		saveAsSvg,
		getSvgUrl,
		normalizeAfterEdgeMutation,
	};
}
