import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';

import { prepareGraph } from '../src/graphProcessing/migration.js';
import { assertPreparedGraphContract, assertRawGraphContract } from '../src/app/contracts.js';

const FIXTURES = [
	'./data/small.json',
	'./data/jpacman-v2.json',
	'./data/jhotdraw-5.1.json',
];

for (const fixturePath of FIXTURES) {
	test(`prepareGraph contract holds for ${fixturePath}`, async () => {
		const rawText = await fs.readFile(fixturePath, 'utf8');
		const rawGraph = JSON.parse(rawText);

		assert.doesNotThrow(() => assertRawGraphContract(rawGraph, fixturePath));
		const prepared = prepareGraph(rawGraph);
		assert.doesNotThrow(() => assertPreparedGraphContract(prepared, fixturePath));

		assert.ok(prepared.abstract.elements.nodes.length > 0);
		assert.ok(prepared.abstract.elements.edges.length > 0);
	});
}
