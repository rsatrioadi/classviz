import { hslString, role_stereotype_colors, whiten, blacken } from './colors.js';
import { $, h, r } from './shorthands.js';

const stringToNode = (s) => {
	console.log(s);
	const template = document.createElement('template');
	template.innerHTML = s.trim();
	console.log(template);
	const node = template.content.firstChild;
	return node;
};

const prepareRenderData = (node) => {
	const renderData = {
		title: `${node.data('properties.kind')}: ${node.data('properties.simpleName').replace(/([A-Z])/g, '\u200B$1')}`,
		properties: []
	};

	if (node.data('properties.qualifiedName')) {
		renderData.properties.push({
			key: "qualifiedName",
			value: node.data('properties.qualifiedName')
				.replace(/\./g, '.\u200B')
				.replace(/([A-Z])/g, '\u200B$1')
		});
	}

	if (node.data('properties.description')) {
		const d = h('div');
		if (node.data('properties.title')) {
			d.appendChild(h('p', {}, [h('b', {}, [node.data('properties.title')])]));
		}
		d.appendChild(h('p', {}, [node.data('properties.description')
			.replace(/\./g, '.\u200B')
			.replace(/([A-Z])/g, '\u200B$1')]));
		renderData.properties.push({
			key: "description",
			value: d
		});
	}

	function buildProp(key) {
		if (node.data(`properties.${key}`)) {
			return {
				key: key,
				value: node.data(`properties.${key}`)
			};
		}
		return {};
	}

	const props = [
		buildProp('docComment'),
		buildProp('keywords'),
		buildProp('layer'),
		(() => {
			const p = buildProp('roleStereotype');

			if (role_stereotype_colors[p.value]) {
				p['style'] = `background-color: ${hslString(whiten(role_stereotype_colors[p.value], 0.75))};`;
			}

			return p;
		})(),
		buildProp('dependencyProfile')
	];
	props.forEach((p) => renderData.properties.push(p));

	if (node.data('labels').includes("Structure")) {
		const methods = node.scratch('_classviz')['methods'];

		renderData.properties.push({
			key: "methods",
			value: methods.length > 0 ? methods.map(m => {
				return (
					h('div', {}, [
						h('h3', { class: 'info' },
							[m['properties']['simpleName']]),
						h('div', { class: 'info', style: `background-color: ${hslString(whiten(m.color, 0.75))};` }, [
							h('p', {}, [
								h('b', {}, ['description: ']),
								m.properties.description || "(no description)"]),
							h('p', {}, [
								h('b', {}, ['docComment: ']),
								(m.properties.docComment || "(no docComment)")
							]),
						])]));
			}) : h('div', { class: 'info' }, ["No method information available."])
		});
	} else if (node.data('labels').includes("Container")) {

		// 	const incoming_tmp = node.sources("dependsOn");
		// 	const outgoing_tmp = node.targets("dependsOn");

		// 	const both = incoming_tmp.filter(item => outgoing_tmp.includes(item));
		// 	const outgoing = outgoing_tmp.filter(item => !both.includes(item));
		// 	const incoming = incoming_tmp.filter(item => !both.includes(item));

		// 	const both_edges = both.map((n) => [
		// 		node._meta._graph.edges("dependsOn").find((e) => e.source().id() === n.id() && e.target().id() === node.id()),
		// 		node._meta._graph.edges("dependsOn").find((e) => e.target().id() === n.id() && e.source().id() === node.id())
		// 	]);
		// 	const incoming_edges = node._meta._graph.edges("dependsOn", (e) => e.target().id() === node.id() && incoming.map(n => n.id()).includes(e.source().id()));
		// 	const outgoing_edges = node._meta._graph.edges("dependsOn", (e) => e.source().id() === node.id() && outgoing.map(n => n.id()).includes(e.target().id()));

		// 	if (incoming_edges.length > 0) {
		// 		renderData.properties.push({
		// 			key: "incomingDependencies",
		// 			value: incoming_edges.map(e => {
		// 				const d = d3.create('div');
		// 				d.append('h3')
		// 					.attr("class", "info")
		// 					.text(e.source().data('properties.qualifiedName'));

		// 				d.append('div')
		// 					.attr("class", "info")
		// 					.html(e.data('properties.description'));

		// 				return d.node().outerHTML;
		// 			}),
		// 			style: "background-color: hsl(120, 100%, 95%);"
		// 		});
		// 	}
		// 	if (both_edges.length > 0) {
		// 		renderData.properties.push({
		// 			key: "coDependencies",
		// 			value: both_edges.map(([e1, e2]) => {
		// 				const d = d3.create('div');
		// 				d.append('h3')
		// 					.attr("class", "info")
		// 					.text(e1.source().data('properties.qualifiedName'));

		// 				const innerd = d.append('div')
		// 					.attr("class", "info");

		// 				innerd.append("p")
		// 					.html(e1.data('properties.description'));
		// 				innerd.append("p")
		// 					.html(e2.data('properties.description'));

		// 				return d.node().outerHTML;
		// 			}),
		// 			style: "background-color: hsl(43, 100%, 95%);"
		// 		});
		// 	}
		// 	if (outgoing_edges.length > 0) {
		// 		renderData.properties.push({
		// 			key: "outgoingDependencies",
		// 			value: outgoing_edges.map(e => {
		// 				const d = d3.create('div');
		// 				d.append('h3')
		// 					.attr("class", "info")
		// 					.text(e.target().data('properties.qualifiedName'));

		// 				d.append('div')
		// 					.attr("class", "info")
		// 					.html(e.data('properties.description'));


		// 				return d.node().outerHTML;
		// 			}),
		// 			style: "background-color: hsl(210, 100%, 95%);"
		// 		});
		// 	}
	}

	return renderData;
}

export const clearInfo = (sel) => {
	r(sel);
}

export const displayInfo = (sel) => (node) => {

	const element = $(sel);
	const renderData = prepareRenderData(node);

	const ulContents = renderData.properties.filter(prop => prop.key && prop.value).map(prop => {

		const propAttr = { class: 'info' };
		if (prop.style) {
			propAttr['style'] = prop.style;
		}

		const propChildren = [];
		if (Array.isArray(prop.value)) {
			// Nested list for arrays
			propChildren.push(h('ul', {}, prop.value.map(item => h('li', { class: 'info' }, [item]))));
		// } else if (typeof prop.value === 'string' || prop.value instanceof String) {
		// 	propChildren.push(stringToNode(prop.value));
		} else {
			propChildren.push(prop.value);
		}

		const li = h('li', { class: 'info' }, [
			h('h3', { class: 'info' }, [prop.key]),
			h('div', propAttr, propChildren)]);

		return li;
	});

	// Render the properties
	const ul = h("ul", {}, ulContents);

	element.textContent = "";
	element.appendChild(h('h2', {}, [renderData.title]));
	element.appendChild(ul);
}