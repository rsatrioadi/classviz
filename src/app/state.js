import { DEFAULT_COLOR_MAP, DEFAULT_COLOR_ORDER, PARENT_REL } from './constants.js';

export function createAppState() {
	return {
		cy: null,
		hcy: null,
		layers: [],
		layerColors: {},
		colorMap: { ...DEFAULT_COLOR_MAP },
		colorOrder: { ...DEFAULT_COLOR_ORDER },
		hiddenEdges: {},
		flip: false,
		zoom: { value: 1 },
		expandedNodesIdx: [],
		collapsedNodes: [],
		parentRel: PARENT_REL,
	};
}

export function installWindowStateShim(state) {
	const readonly = (getter) => ({
		get: getter,
		set() {
			// Keep legacy callers from crashing if they still attempt assignment.
		},
		configurable: true,
	});

	Object.defineProperty(window, 'cy', readonly(() => state.cy));
	Object.defineProperty(window, 'hcy', readonly(() => state.hcy));
	Object.defineProperty(window, 'layers', readonly(() => state.layers));
	Object.defineProperty(window, 'layer_colors', readonly(() => state.layerColors));
	Object.defineProperty(window, 'state', readonly(() => state));
}
