import test from 'node:test';
import assert from 'node:assert/strict';

import { assertPreparedGraphContract } from '../src/app/contracts.js';

function wrap(elements) {
	return {
		abstract: { elements: { nodes: [], edges: [] } },
		coloringMeta: elements,
	};
}

test('prepared graph allows legacy categories without dimensions', () => {
	const graph = wrap({
		nodes: [
			{ data: { id: 'cat:1', labels: ['Category'], properties: { simpleName: 'A' } } },
			{ data: { id: 'type:1', labels: ['Type'], properties: { simpleName: 'T' } } },
		],
		edges: [
			{ data: { source: 'type:1', target: 'cat:1', label: 'implements' } },
		],
	});

	assert.doesNotThrow(() => assertPreparedGraphContract(graph, 'test-graph'));
});

test('prepared graph rejects category composing to multiple dimensions', () => {
	const graph = wrap({
		nodes: [
			{ data: { id: 'dim:a', labels: ['Dimension'], properties: { simpleName: 'A' } } },
			{ data: { id: 'dim:b', labels: ['Dimension'], properties: { simpleName: 'B' } } },
			{ data: { id: 'cat:1', labels: ['Category'], properties: { simpleName: 'A1' } } },
			{ data: { id: 'type:1', labels: ['Type'], properties: { simpleName: 'T' } } },
		],
		edges: [
			{ data: { source: 'cat:1', target: 'dim:a', label: 'composes' } },
			{ data: { source: 'cat:1', target: 'dim:b', label: 'composes' } },
			{ data: { source: 'type:1', target: 'cat:1', label: 'implements' } },
		],
	});

	assert.throws(() => assertPreparedGraphContract(graph, 'test-graph'));
});

test('prepared graph rejects succeeds across dimensions', () => {
	const graph = wrap({
		nodes: [
			{ data: { id: 'dim:a', labels: ['Dimension'], properties: { simpleName: 'A' } } },
			{ data: { id: 'dim:b', labels: ['Dimension'], properties: { simpleName: 'B' } } },
			{ data: { id: 'cat:a1', labels: ['Category'], properties: { simpleName: 'A1' } } },
			{ data: { id: 'cat:b1', labels: ['Category'], properties: { simpleName: 'B1' } } },
		],
		edges: [
			{ data: { source: 'cat:a1', target: 'dim:a', label: 'composes' } },
			{ data: { source: 'cat:b1', target: 'dim:b', label: 'composes' } },
			{ data: { source: 'cat:a1', target: 'cat:b1', label: 'succeeds' } },
		],
	});

	assert.throws(() => assertPreparedGraphContract(graph, 'test-graph'));
});
