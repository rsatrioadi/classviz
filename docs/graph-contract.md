# Internal Graph Contract

`prepareGraph(rawGraph)` must output:

- `graph.abstract.elements.nodes[]`
- `graph.abstract.elements.edges[]`

## Node requirements

Each node must have:

- `data.id` as string
- `data.labels` as array

## Edge requirements

Each edge must have:

- `data.source` as string node id
- `data.target` as string node id
- `data.label` as non-empty string

The runtime validates these invariants in `src/app/contracts.js` before graph pipelines execute.
