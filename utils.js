export var $ = function (sel) { return document.querySelector(sel); };

export var h = function (tag, attrs, children) {
	var el = document.createElement(tag);

	if (attrs != null && typeof attrs === typeof {}) {
		Object.keys(attrs).forEach(function (key) {
			var val = attrs[key];

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

export var toJson = function (obj) { return obj.json(); };
export var toText = function (obj) { return obj.text(); };
