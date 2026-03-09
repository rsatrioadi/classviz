import test from 'node:test';
import assert from 'node:assert/strict';

import {
	compose,
	composeT,
	filterT,
	lens,
	mapT,
	over,
	pipe,
	reduce,
	update,
	view,
	set,
} from '../src/composing.js';

test('pipe and compose evaluate in opposite directions', () => {
	const add2 = (x) => x + 2;
	const mul3 = (x) => x * 3;

	assert.equal(pipe(add2, mul3)(4), 18);
	assert.equal(compose(mul3, add2)(4), 18);
});

test('update returns immutable key update', () => {
	const original = { a: 1, b: 2 };
	const next = update('a', (x) => x + 10)(original);

	assert.deepEqual(next, { a: 11, b: 2 });
	assert.deepEqual(original, { a: 1, b: 2 });
});

test('lens view/set/over focuses nested value', () => {
	const colorMapLens = lens(
		(obj) => obj.colorMap.style_layer,
		(val, obj) => ({ ...obj, colorMap: { ...obj.colorMap, style_layer: val } })
	);
	const original = { colorMap: { style_layer: { Old: '#111' } } };

	assert.deepEqual(view(colorMapLens, original), { Old: '#111' });
	assert.deepEqual(set(colorMapLens, { New: '#222' }, original), { colorMap: { style_layer: { New: '#222' } } });
	assert.deepEqual(over(colorMapLens, (v) => ({ ...v, New: '#222' }), original), {
		colorMap: { style_layer: { Old: '#111', New: '#222' } },
	});
});

test('composeT(mapT, filterT) works with reduce', () => {
	const xf = composeT(
		mapT((x) => x * 2),
		filterT((x) => x > 4)
	);
	const appendReducer = (acc, v) => {
		acc.push(v);
		return acc;
	};

	const result = reduce(xf(appendReducer), [])([1, 2, 3, 4]);
	assert.deepEqual(result, [6, 8]);
});
