import { $, $all, h, on, r, toJson, toText } from '../utilities/shorthands.js';

export function createUiAdapter() {
	return {
		$,
		$all,
		on,
		h,
		r,
		toJson,
		toText,
		setFilename(text) {
			$('#filename').textContent = text;
		},
		bindTabs() {
			const tablinks = $all('.tablink');
			on('click', tablinks, (event) => {
				tablinks.forEach((t) => t.classList.remove('active'));
				event.target.classList.add('active');
				const selectedTab = event.target.getAttribute('data-tab');
				$all('.sidebar-tab').forEach((t) => {
					t.style.display = 'none';
				});
				$(`[id="${selectedTab}"]`).style.display = 'block';
			});
		},
		renderRelationshipToggles(edgeLabels, handlers) {
			r('#reltab', [
				h('thead', {}, [
					h('tr', {}, [
						h('th', {}, ['Edge Type']),
						h('th', {}, ['└']),
						h('th', {}, ['╰']),
						h('th', {}, ['Action']),
					]),
				]),
				...edgeLabels.map((edgeLabel) => h('tr', {}, [
					h('td', {}, [
						h('label', { for: edgeLabel }, [
							h('input', {
								type: 'checkbox',
								id: edgeLabel,
								name: 'showrels',
								value: edgeLabel,
								class: 'edgeLabels',
							}, [], {
								change: (event) => handlers.onToggleEdge(event.target),
							}, (e) => {
								e.checked = ['calls'].includes(edgeLabel);
							}),
							edgeLabel,
						]),
					]),
					h('td', {}, [
						h('input', {
							type: 'radio',
							id: `${edgeLabel}-ort`,
							name: edgeLabel,
							value: 'taxi',
							title: 'Orthogonal',
						}, [], {
							change: (event) => handlers.onLineBend(event.target),
						}),
					]),
					h('td', {}, [
						h('input', {
							type: 'radio',
							id: `${edgeLabel}-bez`,
							name: edgeLabel,
							value: 'bezier',
							title: 'Bezier',
						}, [], {
							change: (event) => handlers.onLineBend(event.target),
						}, (e) => {
							e.checked = true;
						}),
					]),
					h('td', {}, [
						h('button', {
							class: 'sidebar',
							id: `${edgeLabel}-lift`,
							value: edgeLabel,
							title: 'Lift edges',
						}, ['⬆'], {
							click: (event) => handlers.onLift(event.target.value),
						}),
						' ',
						h('button', {
							class: 'sidebar',
							id: `${edgeLabel}-lower`,
							value: edgeLabel,
							title: 'Lower edges',
						}, ['⬇'], {
							click: (event) => handlers.onLower(event.target.value),
						}),
					]),
				])),
			]);
		},
	};
}
