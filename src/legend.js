import { hslString, whiten } from "./colors.js";
import { h, r } from "./shorthands.js";

export const displayLegend = (sel, colorMap = {}, colorOrder = []) => {
	if (Object.keys(colorMap).length === 0) {
		r(sel, []);
	} else {
		r(sel, [
			h('p', {}, [h('b', {}, "Node Color Legend")]),
			...colorOrder.map((key) => h('div', {
				class: 'legend',
				style: `border-color: ${hslString(colorMap[key])}; background-color: ${hslString(whiten(colorMap[key], 0.75))}`
			}, [
				key
			]))
		]);
	}
};