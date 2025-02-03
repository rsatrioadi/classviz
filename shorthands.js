export const $ = (sel) => document.querySelector(sel);

export const $all = (sel) => Array.from(document.querySelectorAll(sel));

export function h(tag, attrs = {}, children = []) {
	// If 'attrs' is an array, treat it as children and reset attrs
	if (Array.isArray(attrs)) {
		children = attrs;
		attrs = {};
	}

	const el = document.createElement(tag);

	// Set attributes
	Object.entries(attrs).forEach(([key, val]) => el.setAttribute(key, val));

	// Normalize children to an array
	if (!Array.isArray(children)) children = [children];

	// Append each child
	children.forEach((child) => {
		// If it's already a DOM node, append directly
		if (child instanceof Node) {
			el.appendChild(child);
		} else {
			// Otherwise, treat as text
			el.appendChild(document.createTextNode(String(child)));
		}
	});

	return el;
}

export function on(event, targets, handler) {
	if (!targets) return;
	if (typeof targets.forEach === 'function') {
		// Array or NodeList
		targets.forEach((t) => t.addEventListener(event, handler));
	} else if (typeof targets[Symbol.iterator] === 'function') {
		// Other iterables
		for (const t of targets) t.addEventListener(event, handler);
	} else {
		// Single element
		targets.addEventListener(event, handler);
	}
};

export const toJson = function (obj) { return obj.json(); };
export const toText = function (obj) { return obj.text(); };
