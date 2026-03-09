export function createCyAdapter() {
	return {
		createHeadless(elements) {
			return new Promise((resolve) => {
				cytoscape({
					headless: true,
					elements,
					ready: (event) => resolve(event.cy),
				});
			});
		},
		createVisual(container, elements, style, textureOnViewport) {
			return new Promise((resolve) => {
				cytoscape({
					container,
					elements,
					style,
					textureOnViewport,
					ready: (event) => resolve(event.cy),
				});
			});
		},
		batch(cy, fn) {
			cy.startBatch();
			try {
				fn();
			} finally {
				cy.endBatch();
			}
		},
	};
}
