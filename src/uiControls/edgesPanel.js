import { r, h } from '../utilities/shorthands.js';
import { deriveFeatureList } from '../app/pure.js';

export const fillFeatureDropdown = function (pCy, action) {
	const tracesList = deriveFeatureList(pCy.json().elements);

	r('#selectfeature', tracesList.map((trace) => h('div', {}, [
		h('label', {
			for: `feature-${trace}`,
			class: 'featurelabel',
		}, [
			h('input', {
				type: 'checkbox',
				id: `feature-${trace}`,
				name: 'showfeatures',
				value: trace,
			}, [], {
				change: (event) => action(event.target, pCy),
			}),
			trace,
		]),
	])));
};

const fillBugsDropdown = function (pCy, action) {
	let bugsSet = new Set();
	pCy.nodes().forEach((e) => {
		if (e.data().properties.vulnerabilities) {
			e.data().properties.vulnerabilities.forEach((bug) => {
				bugsSet.add(bug.analysis_name);
			});
		}
	});

	const bugList = [...bugsSet];
	r('#tab-bugs', bugList.map((bug) => h('div', {}, [
		h('label', {
			for: `bug-${bug}`,
			class: 'buglabel',
		}, [
			h('input', {
				type: 'checkbox',
				id: `bug-${bug}`,
				name: 'showbugs',
				value: bug,
			}, [], {
				change: (event) => action(event.target, pCy),
			}),
			bug,
		]),
	])));
};
