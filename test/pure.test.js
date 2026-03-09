import test from 'node:test';
import assert from 'node:assert/strict';

import { deriveColorLegendModel, deriveLayerModel, deriveRelationshipLabels } from '../src/app/pure.js';

test('deriveRelationshipLabels returns unique sorted labels', () => {
	const labels = deriveRelationshipLabels({
		nodes: [],
		edges: [
			{ data: { label: 'calls' } },
			{ data: { label: 'encloses' } },
			{ data: { label: 'calls' } },
		],
	});

	assert.deepEqual(labels, ['calls', 'encloses']);
});

test('deriveLayerModel appends Undetermined', () => {
	const model = deriveLayerModel({
		nodes: [
			{ data: { id: 'l1', labels: ['Category'], properties: { kind: 'architectural layer', simpleName: 'Presentation' } } },
			{ data: { id: 'l2', labels: ['Category'], properties: { kind: 'architectural layer', simpleName: 'Domain' } } },
		],
		edges: [
			{ data: { source: 'l1', target: 'l2', label: 'succeeds' } },
		],
	});

	assert.deepEqual(model.layers, ['Presentation', 'Domain', 'Undetermined']);
	assert.ok(model.layerColors.Undetermined);
});

test('deriveColorLegendModel returns configured legend', () => {
	const legend = deriveColorLegendModel('style_layer', {
		style_layer: { A: { h: 0, s: 0, l: 0.5 } },
	}, {
		style_layer: ['A'],
	});

	assert.deepEqual(legend.order, ['A']);
	assert.ok(legend.colors.A);
});
