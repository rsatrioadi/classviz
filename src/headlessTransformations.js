
import { counter, hasLabel, isPureContainer, mergeCounters } from './utils.js';

export const shortenRoots = function(pCy) {
	const containmentRoots = pCy.nodes((n) => 
		n.data('labels').includes("Container") && !n.data('labels').includes("Structure") && 
		n.incomers(e => e.data('label') === "contains").length===0
	);
	containmentRoots.forEach(cutRootRec);

	function cutRootRec(node) {
		const outgoers = node.outgoers(e => e.data('label') === "contains");
		if (outgoers.length > 1) return;
		const child = outgoers.target();
		if (child && !child.data('labels').includes("Structure")) {
			var name = "";
			if (child.data('properties.qualifiedName')) {
				name = child.data('properties.qualifiedName');
			} else {
				name = `${node.data('properties.simpleName')}/${child.data('properties.simpleName') }`;
			}
			child.data({
				properties: {
					...child.data('properties'),
					simpleName: name
				},
				name: name,
				label: name,
			});
			pCy.$(`[id="${node.id()}"]`).remove();
			cutRootRec(child);
		}
	}
}

export const setParents = function (pCy, relationship, inverted) {
	pCy.edges("#parentRel").removeClass("parentRel");

	pCy.edges(`[interaction = "${relationship}"]`).forEach((edge) => {
		const child = inverted ? edge.source() : edge.target();
		const parent = inverted ? edge.target() : edge.source();

		child.move({ parent: parent.id() });
	});

	pCy.edges(`[interaction = "${relationship}"]`).addClass("parentRel");
}

export const setStyleClasses = function (pCy) {
	pCy.$().forEach((ele) => {
		if (ele.data('label')) {
			ele.addClass(ele.data('label'))
		}
		if (ele.data('labels')) {
			ele.data('labels').forEach(label => ele.addClass(label));
		}
	});
	pCy.$('.Structure').removeClass("Container");
	// pCy.$('.Structure').addClass("dimmed");
}

export const aggregateLayers = function (pCy) {
	const structures = pCy.nodes(n => n.data('labels').includes("Structure"));
	structures.forEach((clasz) => {
		const methods = clasz.outgoers(e => e.data('label') === "hasScript").targets();

		const layers = [];
		
		layers.push(...methods.map((method) => method.outgoers(e => e.data('label') === "implements").targets().data('properties.simpleName'))
			.map(s => s || 'Undefined'));

		if (layers.length === 0) {
			layers.push("Undefined");
		}

		methods.forEach((method,i) => method.data('properties').layer = layers[i]);

		clasz.data('properties')['layers'] = counter(layers);
		clasz.addClass('layers');
	});

	const containers = pCy.nodes(n => n.data('labels').includes("Container") && !n.data('labels').includes("Structure"));
	containers.forEach((pkg) => {
		const contains = pkg.outgoers(e => e.data('label') === "contains" && e.target().data('labels').includes('Structure'));
		const classes = contains.targets();
		const layerCounters = classes.map(c => c.data('properties.layers'));
		pkg.data('properties')['layers'] = mergeCounters(...layerCounters);
		pkg.addClass('layers');

		// console.log(pkg.id(), pkg.data('properties.layers'));
	});
}

export function homogenizeDepths(pCy, isContainment, isTreeNode, isLeaf) {
	// Utility for generating unique IDs for dummy nodes
	let dummyCount = 0;
	const makeDummyId = prefix => `${prefix}.dummy.${++dummyCount}`;

	// Step A: For each container node that has both leaf and non-leaf children,
	// insert a dummy node to group leaf children.
	const containers = pCy.nodes(isPureContainer);
	containers.forEach(parent => {
		const kids = parent.outgoers(isContainment).targets();
		const leafKids = kids.filter(isLeaf);
		const nonLeafKids = kids.difference(leafKids);
		
		if (leafKids.nonempty() && nonLeafKids.nonempty()) {
			const dummyId = makeDummyId(parent.id());
			const name = parent.data('name');
			pCy.add({
				group: 'nodes',
				data: {
					id: dummyId,
					labels: ['Container'],
					name: name,
					label: name,
					properties: { ...parent.data('properties'), dummy: 1 }
				}
			});

			// Connect parent->dummy
			pCy.add({
				data: {
					source: parent.id(),
					target: dummyId,
					label: 'contains',
					interaction: 'contains',
					properties: {}
				}
			});

			// Reconnect leaf kids under the dummy node
			parent.edgesTo(leafKids).filter(isContainment).remove();
			leafKids.forEach(child => {
				pCy.add({
					data: {
						source: dummyId,
						target: child.id(),
						label: 'contains',
						interaction: 'contains',
						properties: {}
					}
				});
			});
		}
	});

	// Identify forest roots (tree nodes with no incoming containment)
	const roots = containers.filter(n => n.incomers().empty());

	function computeNodeDepths(nodes, depth, depthMap) {
		const stack = [{ nodes, depth }];
		while (stack.length) {
			const { nodes: currentNodes, depth: currentDepth } = stack.pop();
			const kids = currentNodes.outgoers(isContainment).targets();
			const leafKids = kids.filter(n => hasLabel(n, "Structure"));
			const nonleafKids = kids.difference(leafKids);
			kids.forEach(kid => depthMap.set(kid.id(), currentDepth + 1));
			if (nonleafKids && nonleafKids.length) {
				stack.push({ nodes: nonleafKids, depth: currentDepth + 1 });
			}
		}
	}

	// Map for BFS depths
	const nodeDepths = new Map();
	computeNodeDepths(roots, 0, nodeDepths);

	// Map for subtreeDepth (computed via DFS, post-order)
	const subtreeDepths = new Map();
	function computeSubtreeDepths(node) {
		let maxBelow = 0;
		node.outgoers(isContainment).targets().forEach(child => {
			maxBelow = Math.max(maxBelow, computeSubtreeDepths(child));
		});
		const depth = maxBelow + 1;
		subtreeDepths.set(node.id(), depth);
		return depth;
	}
	roots.forEach(r => computeSubtreeDepths(r));

	// Global max depth
	let L = 0;
	nodeDepths.forEach(d => { if (d > L) L = d; });
	// console.log('cy', nodeDepth, subtreeDepth);

	// Helper to insert a chain of dummy nodes
	function insertDummyChain(parent, node, count) {
		parent.edgesTo(node).filter(isContainment).remove();
		let current = parent;
		for (let i = 0; i < count; i++) {
			const dummyId = makeDummyId(`${parent.id()}.${node.id()}`);
			const props = node.data('properties') || {};
			const name = node.data('name');
			pCy.add({
				group: 'nodes',
				data: {
					id: dummyId,
					labels: ['Container'],
					name: name,
					label: name,
					properties: { ...props, dummy: 1 }
				}
			});
			pCy.add({
				group: 'edges',
				data: {
					source: current.id(),
					target: dummyId,
					label: 'contains',
					interaction: 'contains',
					properties: {}
				}
			});
			current = pCy.getElementById(dummyId);
		}
		// Link final dummy in chain to the real child
		pCy.add({
			group: 'edges',
			data: {
				source: current.id(),
				target: node.id(),
				label: 'contains',
				interaction: 'contains',
				properties: {}
			}
		});
	}

	// For each root, DFS the subtree; if the subtree’s total depth is < L,
	// insert dummy nodes to extend it.
	roots.forEach(root => {
		const stack = [root];
		while (stack.length) {
			const node = stack.pop();
			const d1 = nodeDepths.get(node.id()) || 1;
			const d2 = subtreeDepths.get(node.id()) || 1;
			const totalDepth = d1 + d2 - 1;

			if (totalDepth < L) {
				const diff = L - totalDepth;
				const parent = node.incomers(isContainment).sources().first();
				if (parent.empty()) {
					// If no parent (this is a root), create a super-root
					const superId = makeDummyId(`superRoot.${node.id()}`);
					const name = node.data('name');
					pCy.add({
						group: 'nodes',
						data: {
							id: superId,
							labels: ['Container'],
							name: name,
							label: name,
							properties: { ...(node.data('properties') || {}), dummy: 1 }
						}
					});
					insertDummyChain(pCy.getElementById(superId), node, diff);

				} else {
					// Insert chain under the existing parent
					insertDummyChain(parent, node, diff);
				}
				// BFS shift
				computeNodeDepths(node, nodeDepths.get(node.id()) + diff, nodeDepths);
				
			}
			node.outgoers(isContainment).targets().forEach(child => stack.push(child));
		}
	});
}

export function homogenizeDepthsOptimized(pCy, isContainment, isTreeNode, isLeaf) {
	let dummyCount = 0;
	const makeDummyId = prefix => `${prefix}.dummy.${++dummyCount}`;

	const containers = pCy.nodes(isPureContainer);
	
	const containmentTargets = new Map();
	const containmentSource = new Map();
	containers.forEach(node => {
		const children = node.outgoers(isContainment).targets();
		containmentTargets.set(node.id(), children);
		children.forEach(child => {
			containmentSource.set(child.id(), node);
		});
	});

	// For each container that has both leaf and non-leaf children,
	// insert a dummy node to group leaf children.
	containers.forEach(parent => {
		const kids = containmentTargets.get(parent.id()) || pCy.collection();
		const leafKids = pCy.collection();
		const nonLeafKids = pCy.collection();
		kids.forEach(child => {
			if (isLeaf(child)) {
				leafKids.merge(child);
			} else {
				nonLeafKids.merge(child);
			}
		});
		if (leafKids.nonempty() && nonLeafKids.nonempty()) {

			parent.edgesTo(leafKids).filter(isContainment).remove();

			const dummyId = makeDummyId(parent.id());
			const name = parent.data('name');
			pCy.add([{ // the dummy node
				group: 'nodes',
				data: {
					id: dummyId,
					labels: ['Container'],
					name,
					label: name,
					properties: { ...parent.data('properties'), dummy: 1 }
				}
			}, { // edge from parent to dummy node
				group: 'edges',
				data: {
					source: parent.id(),
					target: dummyId,
					label: 'contains',
					interaction: 'contains',
					properties: {}
				}
			}, ...leafKids.map(child => ({ // edges from dummy node to leaf kids
				group: 'edges',
				data: {
					source: dummyId,
					target: child.id(),
					label: 'contains',
					interaction: 'contains',
					properties: {}
				}
			}))]);

			const dummy = pCy.getElementById(dummyId);

			containers.merge(dummy);

			containmentTargets.set(parent.id(), nonLeafKids.union(dummy));
			containmentSource.set(dummyId, parent);
			
			containmentTargets.set(dummyId, leafKids);
			leafKids.forEach(n => {
				containmentSource.set(n.id(), dummy);
			})
		}
	});

	// Identify forest roots: here we assume a container is a root if it has no incoming containment edges.
	const roots = containers.filter(n => !containmentSource.get(n.id())||false);

	// Compute node depths via a recursive traversal that uses our containmentMap.
	const nodeDepths = new Map();
	function computeNodeDepths(nodes, depth) {
		nodes.forEach(node => {
			nodeDepths.set(node.id(), depth);
			const children = containmentTargets.get(node.id()) || [];
			computeNodeDepths(children, depth + 1);
		});
	}
	computeNodeDepths(roots, 1);

	// Compute subtree depths via a DFS that uses our containmentMap.
	const subtreeDepths = new Map();
	function computeSubtreeDepth(node) {
		const children = containmentTargets.get(node.id()) || pCy.collection();
		let maxChildDepth = 0;
		children.forEach(child => {
			maxChildDepth = Math.max(maxChildDepth, computeSubtreeDepth(child));
		});
		const d = maxChildDepth + 1;
		subtreeDepths.set(node.id(), d);
		return d;
	}
	roots.forEach(r => computeSubtreeDepth(r));

	// Global maximum depth L (from node depths).
	let L = 0;
	nodeDepths.forEach(d => {
		if (d > L) L = d;
	});

	// Helper to insert a chain of dummy nodes between a parent and a given node.
	// This function also updates our containmentMap accordingly.
	function insertDummyChain(parent, node, count) {
		// Remove the existing containment edge from parent to node.
		parent.edgesTo(node).filter(isContainment).remove();
		let current = parent;
		for (let i = 0; i < count; i++) {
			const dummyId = makeDummyId(`${parent.id()}.${node.id()}`);
			const props = node.data('properties') || {};
			const name = node.data('name');
			pCy.add([{
				group: 'nodes',
				data: {
					id: dummyId,
					labels: ['Container'],
					name,
					label: name,
					properties: { ...props, dummy: 1 }
				}
			}, {
				group: 'edges',
				data: {
					source: current.id(),
					target: dummyId,
					label: 'contains',
					interaction: 'contains',
					properties: {}
				}
			}]);
			const curChildren = containmentTargets.get(current.id()) || pCy.collection();
			curChildren.merge(pCy.getElementById(dummyId));
			containmentTargets.set(current.id(), curChildren);
			curChildren.forEach(n => {
				containmentSource.set(n.id(), current);
			});
			current = pCy.getElementById(dummyId);
		}
		// Link the final dummy in the chain to the original node.
		pCy.add({
			group: 'edges',
			data: {
				source: current.id(),
				target: node.id(),
				label: 'contains',
				interaction: 'contains',
				properties: {}
			}
		});
		const curChildren = containmentTargets.get(current.id()) || pCy.collection();
		curChildren.merge(node);
		containmentTargets.set(current.id(), curChildren);
		curChildren.forEach(n => {
			containmentSource.set(n.id(), current);
		});
	}

	// For each root, DFS the subtree; if the subtree’s total depth is < L,
	// insert dummy nodes to extend it.
	roots.forEach(root => {
		const stack = [root];
		while (stack.length) {
			const node = stack.pop();
			const d1 = nodeDepths.get(node.id()) || 1;
			const d2 = subtreeDepths.get(node.id()) || 1;
			const totalDepth = d1 + d2 - 1;

			if (totalDepth < L) {
				const diff = L - totalDepth;
				const parent = containmentSource.get(node.id());
				if (!parent) {
					// If no parent (this is a root), create a super-root
					const superId = makeDummyId(`superRoot.${node.id()}`);
					const name = node.data('name');
					pCy.add({
						group: 'nodes',
						data: {
							id: superId,
							labels: ['Container'],
							name: name,
							label: name,
							properties: { ...(node.data('properties') || {}), dummy: 1 }
						}
					});
					insertDummyChain(pCy.getElementById(superId), node, diff);

				} else {
					// Insert chain under the existing parent
					insertDummyChain(parent, node, diff);
				}
				// BFS shift
				computeNodeDepths(node, nodeDepths.get(node.id()) + diff, nodeDepths);
			}
			(containmentTargets.get(node.id())||[]).forEach(child => stack.push(child));
		}
	});
}
