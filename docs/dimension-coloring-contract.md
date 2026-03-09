# Dimension Coloring Contract

## Graph metadata

- `Dimension` (`labels: ["Dimension"]`)
  - `properties.simpleName` required
  - `properties.kind` recommended (`categorical-nominal` or `categorical-ordered`)
  - `properties.dimensionKey` optional stable key
  - `properties.coloringStrategy` optional (`direct`, `aggregate`, `hybrid`)
  - `properties.appliesTo` optional (`Scope`, `Type`, `Operation`, `Variable`)
  - `properties.aggregationPath` optional array
  - `properties.palette` optional

- `Category` (`labels: ["Category"]`)
  - `properties.simpleName` required
  - `properties.order` optional numeric ordering
  - `properties.isDefault` optional

- Edges
  - `Category -[composes]-> Dimension`
  - `Element -[implements]-> Category`
  - `Category -[succeeds]-> Category` (optional natural ordering)

## Inference rules in ClassViz

- `dimensionKey` inferred from `simpleName` slug if absent.
- `appliesTo` inferred from source labels of `implements` edges.
- Strategy inferred from `appliesTo` if absent.
- Legend order uses `succeeds` topological order; falls back to `order`, then name.
- Cycles in `succeeds` are tolerated with fallback ordering and warning.
- Default category is `isDefault`, then `Undetermined`, then first category.

## App configuration

- No hard-coded color mode radios.
- Coloring modes are generated from discovered dimensions.
- `style_default` is always present.
- Fallback `style_layer` and `style_rs` remain available when corresponding dimensions are not present.
