const ROLE_ORDER = [
	'Controller',
	'Coordinator',
	'Information Holder',
	'Interfacer',
	'User Interfacer',
	'Internal Interfacer',
	'External Interfacer',
	'Service Provider',
	'Structurer',
	'*',
	'-',
];

const LAYER_BUCKETS = [
	{ canonical: 'Presentation Layer', aliases: ['presentation layer', 'presentation', 'ui', 'user interface'] },
	{ canonical: 'Service Layer', aliases: ['service layer', 'service', 'application service', 'application layer'] },
	{ canonical: 'Domain Layer', aliases: ['domain layer', 'domain', 'logic', 'business'] },
	{ canonical: 'Data Source Layer', aliases: ['data source layer', 'data source', 'data', 'persistence', 'infrastructure'] },
	{ canonical: 'Undetermined', aliases: ['undetermined', 'unknown', '-', 'none'] },
];

const DIMENSION_SPECS = {
	role: {
		dimensionKey: 'role_stereotype',
		simpleName: 'Role Stereotype',
		kind: 'categorical-nominal',
		coloringStrategy: 'direct',
		appliesTo: ['Type'],
		aggregationPath: ['Type', 'Scope'],
		palette: 'roles',
		categoryKind: 'role stereotype',
		legacyProps: ['roleStereotype'],
	},
	layer: {
		dimensionKey: 'architectural_layer',
		simpleName: 'Architectural Layer',
		kind: 'categorical-ordered',
		coloringStrategy: 'aggregate',
		appliesTo: ['Operation', 'Type', 'Scope'],
		aggregationPath: ['Operation', 'Type', 'Scope'],
		palette: 'layer',
		categoryKind: 'architectural layer',
		legacyProps: ['layer'],
	},
	secdfd: {
		dimensionKey: 'secdfd_type',
		simpleName: 'SecDFD Type',
		kind: 'categorical-nominal',
		coloringStrategy: 'hybrid',
		appliesTo: ['Variable', 'Operation', 'Type', 'Scope'],
		aggregationPath: ['Operation', 'Type', 'Scope'],
		palette: 'categorical',
		categoryKind: 'secdfd type',
		legacyProps: ['secdfdType', 'secdfd_type', 'secdfd', 'secdfdTypeName'],
	},
};

function asArray(value) {
	return Array.isArray(value) ? value : [];
}

function hasLabel(nodeData, label) {
	return asArray(nodeData?.labels).includes(label);
}

function hasAnyLabel(nodeData, labels) {
	return labels.some((label) => hasLabel(nodeData, label));
}

function edgeLabel(edgeData) {
	if (typeof edgeData?.label === 'string' && edgeData.label.length > 0) return edgeData.label;
	const labels = asArray(edgeData?.labels);
	return typeof labels[0] === 'string' ? labels[0] : '';
}

function slug(text) {
	return String(text || '')
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, '_')
		.replace(/^_+|_+$/g, '') || 'value';
}

function getSimpleName(nodeData) {
	return nodeData?.properties?.simpleName || nodeData?.name || nodeData?.id || '';
}

function normalizeLayerName(name) {
	const normalized = String(name || '').trim();
	if (!normalized) return '';
	const lower = normalized.toLowerCase();
	for (const bucket of LAYER_BUCKETS) {
		if (bucket.aliases.includes(lower)) return bucket.canonical;
	}
	return normalized;
}

function pickDimensionTypeByCategoryKind(kind) {
	const k = String(kind || '').toLowerCase().trim();
	if (k === DIMENSION_SPECS.role.categoryKind) return 'role';
	if (k === DIMENSION_SPECS.layer.categoryKind) return 'layer';
	if (k === DIMENSION_SPECS.secdfd.categoryKind) return 'secdfd';
	return null;
}

function findFirstProp(nodeData, keys) {
	for (const key of keys) {
		const value = nodeData?.properties?.[key];
		if (typeof value === 'string' && value.trim() !== '') return value.trim();
	}
	return '';
}

function isClassifiableNode(nodeData) {
	// V2 contract: only canonical labels are considered classifiable.
	return hasAnyLabel(nodeData, ['Scope', 'Type', 'Operation', 'Variable']);
}

function buildIdFactory(nodes, edges) {
	const used = new Set();
	for (const n of nodes) used.add(n.data.id);
	for (const e of edges) if (e.data?.id) used.add(e.data.id);
	return (base) => {
		let candidate = base;
		let i = 2;
		while (used.has(candidate)) {
			candidate = `${base}_${i}`;
			i += 1;
		}
		used.add(candidate);
		return candidate;
	};
}

function applyDimensionDefaults(dimensionNode, spec) {
	const props = dimensionNode.properties || {};
	dimensionNode.properties = {
		...props,
		simpleName: props.simpleName || spec.simpleName,
		dimensionKey: props.dimensionKey || spec.dimensionKey,
		kind: props.kind || spec.kind,
		coloringStrategy: props.coloringStrategy || spec.coloringStrategy,
		appliesTo: Array.isArray(props.appliesTo) && props.appliesTo.length > 0 ? props.appliesTo : spec.appliesTo,
		aggregationPath: Array.isArray(props.aggregationPath) && props.aggregationPath.length > 0 ? props.aggregationPath : spec.aggregationPath,
		palette: props.palette || spec.palette,
	};
}

export function isColoringContractCompliant(graph) {
	if (!graph?.elements || !Array.isArray(graph.elements.nodes) || !Array.isArray(graph.elements.edges)) return false;

	const nodes = graph.elements.nodes.map((n) => n.data);
	const edges = graph.elements.edges.map((e) => e.data);
	const nodesById = new Map(nodes.map((n) => [n.id, n]));
	const dimensions = nodes.filter((n) => hasLabel(n, 'Dimension'));
	if (dimensions.length === 0) return false;

	const categoryToDimensions = new Map();
	for (const edge of edges) {
		if (edgeLabel(edge) !== 'composes') continue;
		const source = nodesById.get(edge.source);
		const target = nodesById.get(edge.target);
		if (!hasLabel(source, 'Category') || !hasLabel(target, 'Dimension')) continue;
		if (!categoryToDimensions.has(source.id)) categoryToDimensions.set(source.id, new Set());
		categoryToDimensions.get(source.id).add(target.id);
	}

	for (const edge of edges) {
		if (edgeLabel(edge) !== 'implements') continue;
		const target = nodesById.get(edge.target);
		if (!hasLabel(target, 'Category')) continue;
		const dims = categoryToDimensions.get(target.id);
		if (!dims || dims.size !== 1) return false;
	}

	for (const edge of edges) {
		if (edgeLabel(edge) !== 'succeeds') continue;
		const source = nodesById.get(edge.source);
		const target = nodesById.get(edge.target);
		if (!hasLabel(source, 'Category') || !hasLabel(target, 'Category')) continue;
		const sourceDims = categoryToDimensions.get(source.id);
		const targetDims = categoryToDimensions.get(target.id);
		if (!sourceDims || !targetDims || sourceDims.size !== 1 || targetDims.size !== 1) return false;
		const sourceDim = [...sourceDims][0];
		const targetDim = [...targetDims][0];
		if (sourceDim !== targetDim) return false;
	}

	return true;
}

export function augmentGraphWithDimensionMetadata(rawGraph) {
	const graph = JSON.parse(JSON.stringify(rawGraph));
	if (!graph?.elements || !Array.isArray(graph.elements.nodes) || !Array.isArray(graph.elements.edges)) return graph;

	const nodes = graph.elements.nodes;
	const edges = graph.elements.edges;
	const nextId = buildIdFactory(nodes, edges);
	const nodeById = new Map(nodes.map((n) => [n.data.id, n.data]));
	const edgeKey = (source, target, label) => `${source}::${target}::${label}`;
	const edgeIndex = new Map();
	for (const edge of edges) {
		const label = edgeLabel(edge.data);
		if (label) {
			edge.data.label = label;
			edgeIndex.set(edgeKey(edge.data.source, edge.data.target, label), edge.data);
		}
	}

	const dimensionsByType = new Map();
	for (const node of nodes) {
		const data = node.data;
		if (!hasLabel(data, 'Dimension')) continue;
		const key = String(data.properties?.dimensionKey || '').toLowerCase();
		const simple = String(data.properties?.simpleName || '').toLowerCase();
		for (const [type, spec] of Object.entries(DIMENSION_SPECS)) {
			if (key === spec.dimensionKey || simple === spec.simpleName.toLowerCase()) {
				dimensionsByType.set(type, data);
			}
		}
	}

	for (const [type, spec] of Object.entries(DIMENSION_SPECS)) {
		let dim = dimensionsByType.get(type);
		if (!dim) {
			dim = { id: nextId(`dimension:${spec.dimensionKey}`), labels: ['Dimension'], properties: {} };
			nodes.push({ data: dim });
			nodeById.set(dim.id, dim);
			dimensionsByType.set(type, dim);
		}
		applyDimensionDefaults(dim, spec);
	}

	const categoriesByTypeAndName = new Map();
	for (const [type] of Object.entries(DIMENSION_SPECS)) categoriesByTypeAndName.set(type, new Map());

	function ensureEdge(source, target, label) {
		const key = edgeKey(source, target, label);
		if (edgeIndex.has(key)) return false;
		const edgeData = {
			id: nextId(`edge:${label}:${slug(source)}:${slug(target)}`),
			source,
			target,
			label,
		};
		edges.push({ data: edgeData });
		edgeIndex.set(key, edgeData);
		return true;
	}

	function ensureCategory(type, categoryName) {
		const spec = DIMENSION_SPECS[type];
		const byName = categoriesByTypeAndName.get(type);
		const key = categoryName.toLowerCase();
		if (byName.has(key)) return byName.get(key);

		let existing = null;
		for (const node of nodes) {
			const data = node.data;
			if (!hasLabel(data, 'Category')) continue;
			if (getSimpleName(data).toLowerCase() !== key) continue;
			const kindType = pickDimensionTypeByCategoryKind(data.properties?.kind);
			if (kindType === type || !kindType) {
				existing = data;
				break;
			}
		}

		if (!existing) {
			existing = {
				id: nextId(`category:${spec.dimensionKey}:${slug(categoryName)}`),
				labels: ['Category'],
				properties: {
					simpleName: categoryName,
					kind: spec.categoryKind,
				},
			};
			nodes.push({ data: existing });
			nodeById.set(existing.id, existing);
		}

		existing.properties = {
			...(existing.properties || {}),
			simpleName: existing.properties?.simpleName || categoryName,
			kind: existing.properties?.kind || spec.categoryKind,
			categoryKey: existing.properties?.categoryKey || slug(existing.properties?.simpleName || categoryName),
		};
		byName.set(key, existing);
		return existing;
	}

	const existingCategoryToType = new Map();
	for (const node of nodes) {
		if (!hasLabel(node.data, 'Category')) continue;
		const type = pickDimensionTypeByCategoryKind(node.data.properties?.kind);
		if (!type) continue;
		categoriesByTypeAndName.get(type).set(getSimpleName(node.data).toLowerCase(), node.data);
		existingCategoryToType.set(node.data.id, type);
	}

	for (const edge of edges) {
		const label = edgeLabel(edge.data);
		if (label !== 'composes') continue;
		const source = nodeById.get(edge.data.source);
		const target = nodeById.get(edge.data.target);
		if (!source || !target || !hasLabel(source, 'Category') || !hasLabel(target, 'Dimension')) continue;
		for (const [type] of Object.entries(DIMENSION_SPECS)) {
			if (dimensionsByType.get(type)?.id === target.id) {
				categoriesByTypeAndName.get(type).set(getSimpleName(source).toLowerCase(), source);
				existingCategoryToType.set(source.id, type);
			}
		}
	}

	for (const node of nodes) {
		const data = node.data;
		if (hasAnyLabel(data, ['Category', 'Dimension'])) continue;
		if (!isClassifiableNode(data)) continue;

		for (const [type, spec] of Object.entries(DIMENSION_SPECS)) {
			let rawValue = findFirstProp(data, spec.legacyProps);
			if (!rawValue) continue;
			if (type === 'layer') rawValue = normalizeLayerName(rawValue);
			const category = ensureCategory(type, rawValue);
			ensureEdge(category.id, dimensionsByType.get(type).id, 'composes');
			ensureEdge(data.id, category.id, 'implements');
		}
	}

	for (const edge of edges) {
		if (edgeLabel(edge.data) !== 'implements') continue;
		const category = nodeById.get(edge.data.target);
		if (!category || !hasLabel(category, 'Category')) continue;
		const knownType = existingCategoryToType.get(category.id) || pickDimensionTypeByCategoryKind(category.properties?.kind);
		if (!knownType) continue;
		const dim = dimensionsByType.get(knownType);
		if (dim) ensureEdge(category.id, dim.id, 'composes');
	}

	const roleMap = categoriesByTypeAndName.get('role');
	for (const [i, name] of ROLE_ORDER.entries()) {
		const category = roleMap.get(name.toLowerCase());
		if (!category) continue;
		category.properties = {
			...(category.properties || {}),
			order: typeof category.properties?.order === 'number' ? category.properties.order : i,
			isDefault: category.properties?.isDefault === true ? true : name === '-' || name.toLowerCase() === 'undetermined',
		};
	}

	const layerMap = categoriesByTypeAndName.get('layer');
	const layerFoundByBucket = [];
	for (const bucket of LAYER_BUCKETS) {
		let found = null;
		for (const [name, category] of layerMap.entries()) {
			if (bucket.aliases.includes(name) || name === bucket.canonical.toLowerCase()) {
				found = category;
				break;
			}
		}
		layerFoundByBucket.push(found);
	}

	for (let i = 0; i < layerFoundByBucket.length - 1; i += 1) {
		const src = layerFoundByBucket[i];
		const dst = layerFoundByBucket[i + 1];
		if (!src || !dst) continue;
		ensureEdge(src.id, dst.id, 'succeeds');
	}

	for (let i = 0; i < layerFoundByBucket.length; i += 1) {
		const category = layerFoundByBucket[i];
		if (!category) continue;
		category.properties = {
			...(category.properties || {}),
			order: typeof category.properties?.order === 'number' ? category.properties.order : i,
			isDefault: category.properties?.isDefault === true ? true : i === layerFoundByBucket.length - 1,
		};
	}

	const secdfdMap = categoriesByTypeAndName.get('secdfd');
	for (const category of secdfdMap.values()) {
		const lower = getSimpleName(category).toLowerCase();
		category.properties = {
			...(category.properties || {}),
			isDefault: category.properties?.isDefault === true ? true : lower === 'undetermined' || lower === 'unknown',
		};
	}

	return graph;
}
