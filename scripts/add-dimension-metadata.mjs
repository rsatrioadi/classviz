#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';

import { augmentGraphWithDimensionMetadata, isColoringContractCompliant } from '../src/graphProcessing/dimensionMetadata.js';

function usage() {
	console.error('Usage: node scripts/add-dimension-metadata.mjs <input.json> [output.json]');
	console.error('       node scripts/add-dimension-metadata.mjs <input.json> --in-place');
	process.exit(1);
}

function parseArgs(argv) {
	if (argv.length < 1) usage();
	const input = argv[0];
	const inPlace = argv.includes('--in-place');
	const output = inPlace ? input : (argv[1] && argv[1] !== '--in-place' ? argv[1] : null);
	if (!inPlace && !output) usage();
	return { input, output: inPlace ? input : output };
}

const { input, output } = parseArgs(process.argv.slice(2));
const rawText = await fs.readFile(input, 'utf8');
const rawGraph = JSON.parse(rawText);
const compliant = isColoringContractCompliant(rawGraph);
const augmented = compliant ? rawGraph : augmentGraphWithDimensionMetadata(rawGraph);

await fs.mkdir(path.dirname(path.resolve(output)), { recursive: true });
await fs.writeFile(output, `${JSON.stringify(augmented, null, 2)}\n`, 'utf8');

console.log(`Wrote ${output}`);
console.log(`Coloring contract compliant before augmentation: ${compliant ? 'yes' : 'no'}`);
