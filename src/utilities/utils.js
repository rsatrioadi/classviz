export const counter = (arr) => arr.reduce((acc, val) => {
	acc[val] = (acc[val] || 0) + 1;
	return acc;
}, {});

export const mergeCounters = (...counters) => {
	return counters.reduce((acc, counter) => {
		Object.entries(counter).forEach(([key, val]) => {
			acc[key] = (acc[key] || 0) + val;
		});
		return acc;
	}, {});
};

export function counterToPercentage(counter) {
	const total = Object.values(counter).reduce((sum, count) => sum + count, 0);
	const result = {};
	for (const key in counter) {
		result[key] = total ? counter[key] / total : 0;
	}
	return result;
}

export function cumulative(arr) {
	const result = [0];
	for (let i = 0; i < arr.length; i++) {
		result.push(result[result.length - 1] + arr[i]);
	}
	return result;
}

export function repeatMiddle(arr) {
	if (arr.length < 3) return arr; // No middle elements to repeat
	return arr.flatMap((el, i) => (i > 0 && i < arr.length - 1 ? [el, el] : el));
}

export function addScratch(ele, key, value) {
	if (!ele.scratch('_classviz')) ele.scratch('_classviz', {});
	ele.scratch('_classviz')[key] = value;
}

export function getScratch(ele, key) {
	if (ele.scratch('_classviz') && key in ele.scratch('_classviz')) return ele.scratch('_classviz')[key];
	return null;
}

export const nodeHasLabel = (n, x) => n.data('labels').includes(x);
export const edgeHasLabel = (e, x) => e.data('label') === x;

export function arrayIntersection(arr1, arr2) {
	const set2 = new Set(arr2);
	const result = arr1.filter(item => set2.has(item));
	return result;
}

export const isPureContainer = (n) => nodeHasLabel(n, "Scope") && !nodeHasLabel(n, "Type");

