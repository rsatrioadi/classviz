export const blacken = ({ h, s, l }, p) => ({
	h,
	s,
	l: l - p * l
});
export const whiten = ({ h, s, l }, p) => ({
	h,
	s,
	l: l + p * (1 - l)
});
export const desaturate = ({ h, s, l }, p) => ({
	h,
	s: s - p * s,
	l
});
export const saturate = ({ h, s, l }, p) => ({
	h,
	s: s + p * (1 - s),
	l
});

export const role_stereotypes = {
	"Controller": { symbol: "CT" },
	"Coordinator": { symbol: "CO" },
	"Information Holder": { symbol: "IH" },
	"Interfacer": { symbol: "IT" },
	"User Interfacer": { symbol: "ITu" },
	"Internal Interfacer": { symbol: "ITi" },
	"External Interfacer": { symbol: "ITe" },
	"Service Provider": { symbol: "SP" },
	"Structurer": { symbol: "ST" },
	"*": { symbol: "UR", label: "Unreliable" },
	"-": { symbol: "UD", label: "Undetermined" }
};

export const role_stereotype_colors = {
	"Controller": { h: 294, s: 0.38, l: 0.42 },
	"Coordinator": { h: 115, s: 0.4, l: 0.47 },
	"Information Holder": { h: 359, s: 0.78, l: 0.54 },
	"Interfacer": { h: 45, s: 1, l: 0.33 },
	"User Interfacer": { h: 45, s: 1, l: 0.33 },
	"Internal Interfacer": { h: 45, s: 1, l: 0.33 },
	"External Interfacer": { h: 45, s: 1, l: 0.33 },
	"Service Provider": { h: 216, s: 0.49, l: 0.5 },
	"Structurer": { h: 321, s: 1, l: 0.75 },
	"*": { h: 0, s: 0, l: 0.5 },
	"-": { h: 0, s: 0, l: 0.5 },
};

export const role_stereotype_order = [
	"Controller",
	"Coordinator",
	"Information Holder",
	"Interfacer",
	"User Interfacer",
	"Internal Interfacer",
	"External Interfacer",
	"Service Provider",
	"Structurer",
	"*",
	"-",
];

export const hslString = ({ h, s, l }) => `hsl(${h},${s * 100}%,${l * 100}%)`;

export const ft_colors = [
	"#8dd3c7",
	"#ffffb3",
	"#bebada",
	"#fb8072",
	"#80b1d3",
	"#fdb462",
	"#b3de69",
	"#fccde5",
	"#d9d9d9",
	"#bc80bd",
	"#ccebc5",
	"#ffed6f",
];

export const layer_colors_from = (layers, ignore=[]) => {
	const color_list = [
		{ h: 333, 	s: 0.7, 	l: 0.5  }, 
		{ h:  11, 	s: 0.87, 	l: 0.49 }, 
		{ h:  32, 	s: 1, 		l: 0.45 }, 
		{ h:  39, 	s: 0.96, 	l: 0.49 }, 
		{ h:  47, 	s: 1, 		l: 0.5  }, 
		{ h:  83, 	s: 0.75, 	l: 0.41 }, 
		{ h: 119, 	s: 0.62, 	l: 0.42 }, 
		{ h: 143, 	s: 0.74, 	l: 0.49 }, 
		{ h: 183, 	s: 1, 		l: 0.46 }, 
		{ h: 195, 	s: 0.99, 	l: 0.43 }, 
		{ h: 209, 	s: 0.9, 	l: 0.41 }, 
		{ h: 238, 	s: 0.54, 	l: 0.49 }
	];
	var l = [...layers];
	const greys = {};
	ignore.forEach((item) => {
		if (l.includes(item)) {
			l.splice(l.indexOf(item), 1);
			greys[item] = { h: 0, s: 0, l: 0.9 };
		}
	});
	const layer_colors = getN(color_list, l.length);
	return { ...arraysToObject(l, layer_colors), ...greys };
};

function getN(arr, N) {
	if (N <= 0) return [];
	if (N === 1) return [arr[Math.floor(arr.length / 2)]];

	const result = [];
	const interval = (arr.length - 1) / (N - 1);
	for (let i = 0; i < N; i++) {
		// For N===4 this produces [1,4,7,10] (when using a tiny epsilon adjustment)
		const idx =
			i === N - 1
				? arr.length - 1
				: Math.floor(i * interval + (i === 0 ? 0 : 1e-9));
		result.push(arr[idx]);
	}
	return result;
}

function arraysToObject(keys, values) {
	if (keys.length !== values.length) throw new Error("Arrays must be the same length");
	const result = {};
	for (let i = 0; i < keys.length; i++) {
		result[keys[i]] = values[i];
	}
	return result;
}