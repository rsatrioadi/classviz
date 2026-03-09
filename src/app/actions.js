import { clearInfo, displayInfo } from '../uiControls/infoPanel.js';
import { displayLegend } from '../uiControls/nodesPanel.js';
import { fillFeatureDropdown } from '../uiControls/edgesPanel.js';
import { highlight, relayout } from '../uiControls/graphPanel.js';
import { adjustEdgeWidths, liftEdges, lowerEdges, showNeighborhood } from '../graphProcessing/visualTransformations.js';
import { ft_colors } from '../utilities/colors.js';
import { arrayIntersection, getScratch, isPureContainer, nodeHasLabel } from '../utilities/utils.js';
import { deriveColorLegendModel, deriveRelationshipLabels } from './pure.js';
import { clone, identity, lens, not, over, pipe, tap } from '../composing.js';

const hiddenEdgesLens = lens(
	(state) => state.hiddenEdges,
	(value, state) => ({
		...state,
		hiddenEdges: value,
	})
);

const isEmpty = (arr) => arr.length === 0;

export function createActions({ state, ui }) {
	const mutateState = (transform) => Object.assign(state, transform(state));

	function colorNodes(event, pCy = state.cy) {
		const ctx = { selectedColorMode: event.target.value, pCy, state };
		return pipe(
			tap(({ pCy: cy, selectedColorMode }) => {
				cy.nodes().forEach((n) => {
					const style = getScratch(n, selectedColorMode) || getScratch(n, 'style_default');
					n.style(style);
				});
			}),
			(ctxIn) => ({
				...ctxIn,
				legend: deriveColorLegendModel(ctxIn.selectedColorMode, ctxIn.state.colorMap, ctxIn.state.colorOrder),
			}),
			tap(({ legend }) => {
				displayLegend('#coloring-legend', legend.colors, legend.order);
			})
		)(ctx);
	}

	function applyInitialColor(pCy = state.cy) {
		const selectedColorMode = ui.$all('[name = "coloring"]').find((e) => e.checked);
		const fallbackMode = state.coloringModes?.[0]?.scratchKey || 'style_default';
		return colorNodes({ target: { value: selectedColorMode ? selectedColorMode.value : fallbackMode } }, pCy);
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
		const updateHiddenEdges = (hiddenEdges) => {
			const next = clone(hiddenEdges || {});
			if (!checkbox.checked) {
				next[checkbox.value] = state.cy.edges(`[label = "${checkbox.value}"]`);
				next[checkbox.value].remove();
				return next;
			}
			if (next[checkbox.value]) {
				next[checkbox.value].restore();
				next[checkbox.value] = null;
			}
			return next;
		};
		mutateState((s) => over(hiddenEdgesLens, updateHiddenEdges, s));
	}

	function setLineBends({ checked, name, value }) {
		if (!state.cy || !checked) return;
		state.cy.edges(`[label = "${name}"]`).style('curve-style', value);
	}

	function fillRelationshipToggles(pCy = state.cy) {
		const ctx = { pCy };
		return pipe(
			(ctxIn) => ({ ...ctxIn, edgeLabels: deriveRelationshipLabels(ctxIn.pCy.json().elements) }),
			tap(({ edgeLabels }) => {
				ui.renderRelationshipToggles(edgeLabels, {
					onToggleEdge: setEdgeVisibility,
					onLineBend: setLineBends,
					onLift: (label) => liftEdges(state.cy, label),
					onLower: (label) => lowerEdges(state.cy, label),
				});
			}),
			tap(() => {
				ui.$all('input[name="showrels"]').forEach(setEdgeVisibility);
			})
		)(ctx);
	}

	function showTrace(_event, pCy = state.cy) {
		const traceContext = {
			pCy,
			traceNames: ui.$all('[name="showfeatures"]').filter((e) => e.checked).map((e) => e.value),
		};

		const resetStage = tap(({ pCy: cy }) => {
			ui.$all('.featurelabel').forEach((e) => {
				e.style.backgroundColor = '';
			});
			cy.elements().removeClass('dimmed');
			cy.elements().removeClass('feature_shown');
			cy.elements().addClass('feature_reset');
		});

		const applySelectedTraceStage = pipe(
			(ctx) => ({
				...ctx,
				traceColorMap: ctx.traceNames.reduce((acc, trace, i) => {
					const next = { ...acc, [trace]: ft_colors[i] };
					const label = ui.$(`label[for="feature-${trace}"]`);
					if (label) label.style.backgroundColor = ft_colors[i];
					return next;
				}, {}),
			}),
			(ctx) => ({
				...ctx,
				featureNodes: ctx.pCy.nodes().filter((node) => ctx.traceNames.some((trace) => node.data('properties.traces') && node.data('properties.traces').includes(trace))),
			}),
			(ctx) => ({
				...ctx,
				featureEdges: ctx.featureNodes.edgesWith(ctx.featureNodes).union(ctx.featureNodes.ancestors().edgesWith(ctx.featureNodes.ancestors())),
			}),
			tap(({ pCy: cy, featureNodes, featureEdges, traceNames, traceColorMap }) => {
				cy.elements().addClass('dimmed');
				cy.elements('.hidden').removeClass('hidden').addClass('hidden');
				featureNodes.removeClass('dimmed');
				featureEdges.removeClass('dimmed');
				cy.nodes(isPureContainer).removeClass('dimmed');
				featureNodes.forEach((node) => {
					const trc = arrayIntersection(traceNames, node.data('properties.traces'));
					node.style({
						'background-fill': 'linear-gradient',
						'background-gradient-direction': 'to-right',
						'background-gradient-stop-positions': null,
						'background-gradient-stop-colors': trc.map((t) => traceColorMap[t]).join(' '),
					});
				});
			})
		);

		const fallbackStage = tap(({ pCy: cy }) => {
			applyInitialColor(cy);
		});

		const branchStage = (ctx) => (not(isEmpty)(ctx.traceNames) ? applySelectedTraceStage : pipe(identity, fallbackStage))(ctx);

		pipe(
			resetStage,
			branchStage,
			tap(({ pCy: cy }) => {
				cy.edges(`[label = "${state.parentRel}"]`).style('display', 'none');
			})
		)(traceContext);
	}

	function showBug(_event, pCy = state.cy) {
		const bugContext = {
			pCy,
			bugNames: ui.$all('[name="showbugs"]').filter((e) => e.checked).map((e) => e.value),
		};

		const resetLabels = tap(() => {
			ui.$all('.buglabel').forEach((e) => {
				e.style.backgroundColor = '';
			});
		});

		const applySelectedBugs = pipe(
			(ctx) => ({
				...ctx,
				bugColorMap: ctx.bugNames.reduce((acc, bug, i) => {
					const next = { ...acc, [bug]: ft_colors[i] };
					const label = ui.$(`label[for="bug-${bug}"]`);
					if (label) label.style.backgroundColor = ft_colors[i];
					return next;
				}, {}),
			}),
			(ctx) => ({
				...ctx,
				bugNodes: ctx.pCy.nodes().filter((node) => ctx.bugNames.some((bug) => {
					const vulnerabilities = node.data('properties.vulnerabilities');
					return Array.isArray(vulnerabilities) && vulnerabilities.some((entry) => entry.analysis_name === bug);
				})),
			}),
			tap(({ pCy: cy, bugNodes, bugNames, bugColorMap }) => {
				cy.elements().addClass('dimmed');
				cy.elements('.hidden').removeClass('hidden').addClass('hidden');
				bugNodes.removeClass('dimmed');
				cy.nodes('[properties.kind = "file"]').removeClass('dimmed');
				bugNodes.removeClass('bug_reset');
				bugNodes.addClass('bug_shown');
				bugNodes.forEach((node) => {
					const trc = arrayIntersection(bugNames, node.data('properties').vulnerabilities.map((v) => v.analysis_name));
					node.style('background-gradient-stop-colors', trc.map((t) => bugColorMap[t]).join(' '));
				});
			})
		);

		const clearBugs = tap(({ pCy: cy }) => {
			cy.elements().removeClass('dimmed');
			cy.elements().removeClass('bug_shown');
			cy.elements().addClass('bug_reset');
		});

		const branchStage = (ctx) => (not(isEmpty)(ctx.bugNames) ? applySelectedBugs : pipe(identity, clearBugs))(ctx);

		pipe(
			resetLabels,
			branchStage,
			tap(({ pCy: cy }) => {
				cy.edges(`[label = "${state.parentRel}"]`).style('display', 'none');
			})
		)(bugContext);
	}

	function bindGraphPanelControls() {
		ui.on('click', ui.$('#btn-reset'), () => highlight(state.cy, ''));
		ui.on('click', ui.$('#btn-relayout'), () => relayout(state.cy, ui.$('#selectlayout').options[ui.$('#selectlayout').selectedIndex].value));
		ui.on('click', ui.$('#btn-highlight'), () => highlight(state.cy, ui.$('#highlight').value));
		const coloringInputs = ui.$all('input[name="coloring"]');
		if (coloringInputs.length > 0) {
			ui.on('change', coloringInputs, (event) => colorNodes(event));
		}
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
		ui.renderColoringModes(state.coloringModes || []);
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
