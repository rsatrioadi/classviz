import test from 'node:test';
import assert from 'node:assert/strict';

import { deriveColorLegendModel, deriveColoringModes, deriveFeatureList, deriveLayerModel, deriveRelationshipLabels } from '../src/app/pure.js';

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

test('deriveFeatureList returns unique sorted traces', () => {
	const features = deriveFeatureList({
		nodes: [
			{ data: { properties: { traces: ['Checkout', 'Login'] } } },
			{ data: { properties: { traces: ['Login', 'Search'] } } },
		],
		edges: [],
	});

	assert.deepEqual(features, ['Checkout', 'Login', 'Search']);
});

test('deriveColoringModes returns only default mode when no Dimension nodes exist', () => {
	const modes = deriveColoringModes({
		nodes: [],
		edges: [],
	});
	const ids = modes.map((m) => m.id);
	assert.deepEqual(ids, ['style_default']);
});

test('deriveColoringModes builds explicit Dimension mode with order from succeeds', () => {
	const elements = {
		nodes: [
			{ data: { id: 'dim:secdfd', labels: ['Dimension'], properties: { simpleName: 'SecDFD Type', kind: 'categorical-nominal' } } },
			{ data: { id: 'cat:process', labels: ['Category'], properties: { simpleName: 'Process' } } },
			{ data: { id: 'cat:flow', labels: ['Category'], properties: { simpleName: 'Flow' } } },
			{ data: { id: 'cat:undetermined', labels: ['Category'], properties: { simpleName: 'Undetermined', isDefault: true } } },
			{ data: { id: 'op:1', labels: ['Operation'], properties: { simpleName: 'foo()' } } },
		],
		edges: [
			{ data: { source: 'cat:process', target: 'dim:secdfd', label: 'composes' } },
			{ data: { source: 'cat:flow', target: 'dim:secdfd', label: 'composes' } },
			{ data: { source: 'cat:undetermined', target: 'dim:secdfd', label: 'composes' } },
			{ data: { source: 'cat:process', target: 'cat:flow', label: 'succeeds' } },
			{ data: { source: 'op:1', target: 'cat:process', label: 'implements', properties: { weight: 1 } } },
		],
	};

	const modes = deriveColoringModes(elements);
	const secdfdMode = modes.find((m) => m.label === 'SecDFD Type');
	assert.ok(secdfdMode);
	assert.deepEqual(secdfdMode.legendOrder.slice(0, 3), ['Process', 'Flow', 'Undetermined']);
	assert.equal(secdfdMode.applyToNode(elements.nodes[4].data), 'Process');
});

test('deriveColoringModes maps role stereotype dimension to style_rs', () => {
	const elements = {
		nodes: [
			{ data: { id: 'dim:rs', labels: ['Dimension'], properties: { simpleName: 'Role Stereotype', kind: 'categorical-nominal' } } },
			{ data: { id: 'cat:controller', labels: ['Category'], properties: { simpleName: 'Controller' } } },
			{ data: { id: 'type:1', labels: ['Type'], properties: { simpleName: 'A' } } },
		],
		edges: [
			{ data: { source: 'cat:controller', target: 'dim:rs', label: 'composes' } },
			{ data: { source: 'type:1', target: 'cat:controller', label: 'implements', properties: { weight: 1 } } },
		],
	};

	const modes = deriveColoringModes(elements);
	const rsMode = modes.find((m) => m.id === 'style_rs');
	assert.ok(rsMode);
	assert.equal(rsMode.applyToNode(elements.nodes[2].data), 'Controller');
});

test('deriveColoringModes does not map unclassified node to default category', () => {
	const elements = {
		nodes: [
			{ data: { id: 'dim:layer', labels: ['Dimension'], properties: { simpleName: 'Architectural Layer', kind: 'categorical-ordered' } } },
			{ data: { id: 'cat:ui', labels: ['Category'], properties: { simpleName: 'Presentation Layer' } } },
			{ data: { id: 'cat:und', labels: ['Category'], properties: { simpleName: 'Undetermined', isDefault: true } } },
			{ data: { id: 'op:classified', labels: ['Operation'], properties: { simpleName: 'a()' } } },
			{ data: { id: 'op:unclassified', labels: ['Operation'], properties: { simpleName: 'b()' } } },
		],
		edges: [
			{ data: { source: 'cat:ui', target: 'dim:layer', label: 'composes' } },
			{ data: { source: 'cat:und', target: 'dim:layer', label: 'composes' } },
			{ data: { source: 'op:classified', target: 'cat:ui', label: 'implements' } },
		],
	};

	const mode = deriveColoringModes(elements).find((m) => m.id === 'style_layer');
	assert.ok(mode);
	assert.equal(mode.applyToNode(elements.nodes[3].data), 'Presentation Layer');
	assert.equal(mode.applyToNode(elements.nodes[4].data), null);
	assert.equal(mode.hasNodeClassification(elements.nodes[3].data), true);
	assert.equal(mode.hasNodeClassification(elements.nodes[4].data), false);
});

test('deriveColoringModes keeps explicit default-category assignment', () => {
	const elements = {
		nodes: [
			{ data: { id: 'dim:layer', labels: ['Dimension'], properties: { simpleName: 'Architectural Layer', kind: 'categorical-ordered' } } },
			{ data: { id: 'cat:ui', labels: ['Category'], properties: { simpleName: 'Presentation Layer' } } },
			{ data: { id: 'cat:und', labels: ['Category'], properties: { simpleName: 'Undetermined', isDefault: true } } },
			{ data: { id: 'op:und', labels: ['Operation'], properties: { simpleName: 'u()' } } },
		],
		edges: [
			{ data: { source: 'cat:ui', target: 'dim:layer', label: 'composes' } },
			{ data: { source: 'cat:und', target: 'dim:layer', label: 'composes' } },
			{ data: { source: 'op:und', target: 'cat:und', label: 'implements' } },
		],
	};

	const mode = deriveColoringModes(elements).find((m) => m.id === 'style_layer');
	assert.ok(mode);
	assert.equal(mode.applyToNode(elements.nodes[3].data), 'Undetermined');
	assert.equal(mode.hasNodeClassification(elements.nodes[3].data), true);
});
