export const $ = (sel) => document.querySelector(sel);
export const $all = (sel) => document.querySelectorAll(sel);

export const h = function (tag, attrs, children) {
	const el = document.createElement(tag);

	if (attrs != null && typeof attrs === typeof {}) {
		Object.keys(attrs).forEach(function (key) {
			const val = attrs[key];

			el.setAttribute(key, val);
		});
	} else if (typeof attrs === typeof []) {
		children = attrs;
	}

	if (children != null && typeof children === typeof []) {
		children.forEach(function (child) {
			el.appendChild(child);
		});
	} else if (children != null && typeof children === typeof '') {
		el.appendChild(document.createTextNode(children));
	}

	return el;
};

export const on = function (event, obj, handler) {
	if (obj && typeof obj.forEach === 'function') {
		obj.forEach((o) => o.addEventListener(event, handler));
	} else if (obj && typeof obj[Symbol.iterator] === 'function') {
		for (const o of obj) o.addEventListener(event, handler);
	} else {
		obj.addEventListener(event, handler); 
	}
};

export const toJson = function (obj) { return obj.json(); };
export const toText = function (obj) { return obj.text(); };
