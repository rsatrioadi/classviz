import test from 'node:test';
import assert from 'node:assert/strict';

import { augmentGraphWithDimensionMetadata, isColoringContractCompliant } from '../src/graphProcessing/dimensionMetadata.js';

test('coloring contract compliance is true for explicit dimension/category wiring', () => {
	const graph = {
		elements: {
			nodes: [
				{ data: { id: 'dim:layer', labels: ['Dimension'], properties: { simpleName: 'Architectural Layer', dimensionKey: 'architectural_layer' } } },
				{ data: { id: 'cat:ui', labels: ['Category'], properties: { simpleName: 'Presentation Layer', kind: 'architectural layer' } } },
				{ data: { id: 'op:1', labels: ['Operation'], properties: { simpleName: 'a()' } } },
			],
			edges: [
				{ data: { source: 'cat:ui', target: 'dim:layer', label: 'composes' } },
				{ data: { source: 'op:1', target: 'cat:ui', label: 'implements' } },
			],
		},
	};

	assert.equal(isColoringContractCompliant(graph), true);
});

test('augmentation adds v2 dimension metadata for legacy layer/role properties', () => {
	const graph = {
		elements: {
			nodes: [
				{ data: { id: 'type:1', labels: ['Type'], properties: { simpleName: 'A', roleStereotype: 'Controller' } } },
				{ data: { id: 'op:1', labels: ['Operation'], properties: { simpleName: 'a()', layer: 'UI' } } },
			],
			edges: [],
		},
	};

	assert.equal(isColoringContractCompliant(graph), false);
	const augmented = augmentGraphWithDimensionMetadata(graph);
	assert.equal(isColoringContractCompliant(augmented), true);

	const nodeNames = new Set(augmented.elements.nodes.map((n) => n.data.properties?.simpleName).filter(Boolean));
	assert.ok(nodeNames.has('Role Stereotype'));
	assert.ok(nodeNames.has('Architectural Layer'));
	assert.ok(nodeNames.has('Controller'));
	assert.ok(nodeNames.has('Presentation Layer'));
});

test('v2-only augmentation does not classify non-v2 labels', () => {
	const graph = {
		elements: {
			nodes: [
				{ data: { id: 'legacy:class', labels: ['Structure'], properties: { simpleName: 'LegacyClass', roleStereotype: 'Controller' } } },
			],
			edges: [],
		},
	};

	const augmented = augmentGraphWithDimensionMetadata(graph);
	const implementsEdges = augmented.elements.edges.filter((e) => e.data.label === 'implements');
	assert.equal(implementsEdges.length, 0);
});
