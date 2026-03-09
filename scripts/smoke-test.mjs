import fs from 'node:fs/promises';

import { prepareGraph } from '../src/graphProcessing/migration.js';
import { assertPreparedGraphContract, assertRawGraphContract } from '../src/app/contracts.js';
import { deriveRelationshipLabels } from '../src/app/pure.js';

const fixtures = [
	'./data/small.json',
	'./data/jpacman-v2.json',
	'./data/jhotdraw-5.1.json',
];

for (const fixture of fixtures) {
	const rawText = await fs.readFile(fixture, 'utf8');
	const raw = JSON.parse(rawText);
	assertRawGraphContract(raw, fixture);
	const prepared = prepareGraph(raw);
	assertPreparedGraphContract(prepared, fixture);

	const rels = deriveRelationshipLabels(prepared.abstract.elements);
	if (rels.length === 0) {
		throw new Error(`Smoke failure for ${fixture}: no relationship labels found`);
	}
	if (prepared.abstract.elements.nodes.length === 0) {
		throw new Error(`Smoke failure for ${fixture}: no nodes found`);
	}
	if (prepared.abstract.elements.edges.length === 0) {
		throw new Error(`Smoke failure for ${fixture}: no edges found`);
	}
}

console.log('Smoke tests passed for fixtures:', fixtures.join(', '));
