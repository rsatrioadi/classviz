// --- Core Composition Utilities ---
// Pipe (left-to-right)
export const pipe = (...fns) => x =>
	fns.reduce((v, f) => f(v), x);

// Compose (right-to-left)
export const compose = (...fns) =>
	x => fns.reduceRight((v, f) => f(v), x);

// Map, filter, reduce
export const map = fn => arr => arr.map(fn);
export const filter = fn => arr => arr.filter(fn);
export const reduce = (fn, init) => arr => arr.reduce(fn, init);

// Immutability Helpers
export const clone = obj => Array.isArray(obj)
	? [...obj]
	: { ...obj };

export const update = (key, fn) => obj => ({
	...obj,
	[key]: fn(obj[key])
});

// Lenses (Focused Get/Set)
export const lens = (getter, setter) => ({
	get: getter,
	set: (val, obj) => setter(val, obj)
});

export const view = (ln, obj) => ln.get(obj);
export const set = (ln, val, obj) => ln.set(val, obj);
export const over = (ln, fn, obj) => ln.set(fn(ln.get(obj)), obj);

// Transducers
export const mapT = f => reducer => (acc, v) => reducer(acc, f(v));
export const filterT = pred => reducer => (acc, v) =>
	pred(v) ? reducer(acc, v) : acc;

export const composeT = (...fns) =>
	reducer => fns.reduceRight((acc, fn) => fn(acc), reducer);

// Utilities
export const identity = x => x;
export const not = fn => (...args) => !fn(...args);
export const tap = fn => x => (fn(x), x);
