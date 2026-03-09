import { clearInfo } from '../uiControls/infoPanel.js';
import { prepareGraph } from '../graphProcessing/migration.js';
import { createActions } from './actions.js';
import { createCyAdapter } from './cyAdapter.js';
import { assertPreparedGraphContract, assertRawGraphContract } from './contracts.js';
import { runHeadlessPipeline, runVisualPipeline } from './graphPipeline.js';
import { createAppState, installWindowStateShim } from './state.js';
import { createUiAdapter } from './uiAdapter.js';

export function bootstrapApp() {
	const state = createAppState();
	const ui = createUiAdapter();
	const cyAdapter = createCyAdapter();
	const actions = createActions({ state, ui });
	installWindowStateShim(state);

	ui.on('DOMContentLoaded', document, async () => {
		cytoscape.warnings(false);
		actions.bindWindowShortcuts();
		bindStaticControls();
		ui.bindTabs();

		const fileName = new URLSearchParams(window.location.search).get('p');
		if (!fileName) return;
		try {
			const [rawGraph, style] = await Promise.all([
				fetch(`data/${fileName}.json`).then(ui.toJson),
				fetch('style.cycss').then(ui.toText),
			]);
			ui.setFilename(`Software Visualization: ${fileName}.json`);
			clearInfo('#infobody');
			await initWithRawGraph(rawGraph, style, `query param data/${fileName}.json`);
		} catch (error) {
			console.error('Error fetching data:', error);
		}
	});

	function bindStaticControls() {
		ui.on('click', ui.$('#btn-upload'), fileUpload);
		ui.on('click', ui.$('#btn-download'), () => actions.saveAsSvg('class-diagram.svg'));
		ui.on('click', ui.$('#btn-popup'), () => window.open(actions.getSvgUrl(), '_blank'));
		ui.on('click', ui.$('#btn-toggleVisibility'), actions.toggleVisibility);
		ui.on('click', ui.$('#btn-hideClasses'), () => actions.setClassVisibilityTap('cxttap'));
		ui.on('click', ui.$('#btn-showClasses'), () => actions.setClassVisibilityTap('tap'));
	}

	async function initWithRawGraph(rawGraph, style, sourceName = 'input') {
		assertRawGraphContract(rawGraph, sourceName);
		const graph = prepareGraph(rawGraph);
		assertPreparedGraphContract(graph, sourceName);
		await initCy(graph, style);
	}

	async function initCy(graph, style) {
		state.hiddenEdges = {};
		state.flip = false;
		state.hcy = await cyAdapter.createHeadless(graph.abstract.elements);
		cyAdapter.batch(state.hcy, () => runHeadlessPipeline(state.hcy, state));

		const numEdges = state.hcy.edges().length;
		state.cy = await cyAdapter.createVisual(ui.$('#cy'), state.hcy.json().elements, style, numEdges > 5000);
		cyAdapter.batch(state.cy, () => {
			runVisualPipeline(state.cy, state);
			actions.initializePostRender();
		});
	}

	function fileUpload() {
		const fileSelector = ui.$('#file-selector');
		fileSelector.click();
		ui.on('change', fileSelector, async (event) => {
			const file = event.target.files?.[0];
			if (!file) return;
			ui.setFilename(`Software Visualization – ${file.name}`);
			clearInfo('#infobody');
			try {
				const rawText = await file.text();
				const rawGraph = JSON.parse(rawText);
				const style = await fetch('style.cycss').then(ui.toText);
				await initWithRawGraph(rawGraph, style, `upload ${file.name}`);
			} catch (error) {
				console.error('Error processing uploaded graph:', error);
			}
		});
	}

	return { state, ui, actions };
}
