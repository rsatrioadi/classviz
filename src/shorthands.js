export const $ = s => document.querySelector(s);

export const $all = s => {
	const nodes = document.querySelectorAll(s);
	const len = nodes.length;
	const arr = new Array(len);
	for (let i = 0; i < len; i++) {
		arr[i] = nodes[i];
	}
	return arr;
};

export function h(tag, attrs = {}, children = [], on = {}, ready) {
	const el = document.createElement(tag);

	// Set attributes (expects a plain object)
	for (const key in attrs) {
		el.setAttribute(key, attrs[key]);
	}

	// Append children (expects an array; if a single child, wrap it manually)
	if (children.length) {
		const frag = document.createDocumentFragment();
		for (let i = 0, len = children.length; i < len; i++) {
			const child = children[i];
			frag.appendChild(child instanceof Node ? child : document.createTextNode(child));
		}
		el.appendChild(frag);
	}

	// Add event listeners (expects a plain object with event names as keys)
	for (const ev in on) {
		el.addEventListener(ev, on[ev]);
	}

	if (typeof ready === 'function') {
		ready(el);
	}
	return el;
}

export function r(sel, children = [], replace = true) {
	const el = $(sel);
	if (replace) el.textContent = '';
	if (children.length) {
		const frag = document.createDocumentFragment();
		for (let i = 0, len = children.length; i < len; i++) {
			const child = children[i];
			frag.appendChild(child instanceof Node ? child : document.createTextNode(child));
		}
		el.appendChild(frag);
	}
}

export function on(event, targets, handler) {
	if (targets instanceof Node) {
		targets.addEventListener(event, handler);
	} else {
		const len = targets.length;
		for (let i = 0; i < len; i++) {
			targets[i].addEventListener(event, handler);
		}
	}
}

export function off(event, targets, handler) {
	if (targets instanceof Node) {
		targets.removeEventListener(event, handler);
	} else {
		const len = targets.length;
		for (let i = 0; i < len; i++) {
			targets[i].removeEventListener(event, handler);
		}
	}
}

export const pipe = (...fns) => input => {
	let acc = input;
	for (let i = 0, len = fns.length; i < len; i++) {
		acc = fns[i](acc);
	}
	return acc;
};

export const pipeAsync = (...fns) => input =>
	fns.reduce((chain, fn) => chain.then(fn), Promise.resolve(input));

export const toJson = res => res.json();
export const toText = res => res.text();
