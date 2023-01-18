document.addEventListener('DOMContentLoaded', function () { // on dom ready

  function prepEles(eles) {

    eles.nodes.forEach((node) => {
      const annot = node.data.properties.kind !== "class"
          ? `«${node.data.properties.kind}»\n`
          : '';
      
      const name = node.data.properties.simpleName;
      node.data.label = `${annot}${name}`;
      // node.data.parent = node.data.properties.package;
    });

    eles.edges.forEach((edge) => {
      edge.data.interaction = edge.data.labels.join();
      edge.data.conn_type = edge.data.interaction;
      delete edge.data.id;
    });

    return eles;
  }

  const eles = fetch('data/input.json')
      .then(res => res.json())
      .then(json => json.elements)
      .then(eles => prepEles(eles))

  const style = fetch('style.cycss')
      .then(res => res.text());

  Promise.all([eles, style]).then(initCy);

  function initCy(payload) {

    console.log(payload[0]); // eles
    console.log(payload[1]); // style

    const cy = window.cy = cytoscape({

      container: document.getElementById('cy'),

      elements: {
        nodes: payload[0].nodes,
        edges: payload[0].edges
      },

      style: payload[1],

      // layout: {
      //   name: 'cola',
      //   directed: true,
      //   nodeSpacing: function (node) {
      //     return 32;
      //   },
      //   flow: { axis: 'y', minSeparation: -32 },
      //   edgeSymDiffLength: 8,

      //   /* for 'klay'
      //   direction: 'DOWN',
      //   // fixedAlignment: 'LEFTUP',
      //   inLayerSpacingFactor: 0.5, */
      // },

      wheelSensitivity: 0.25,
    });

    const checkboxes = document.querySelectorAll('input[name="showrels"]');
    checkboxes.forEach((checkbox) => {
      setVisible(checkbox);
    });

    constraints = [];

    // place subpackages below their parent packages
    payload[1]
      .filter((e) => ["contains"].includes(e.data.conn_type))
      .forEach((e) => {
        c = {
          "axis": "y",
          "left": cy.$id(e.data.target),
          "right": cy.$id(e.data.source),
          "gap": 128
        };
        constraints.push(c);
      });

    // place subclasses below their superclasses
    payload[1]
      .filter((e) => ["specializes", "realizes"].includes(e.data.conn_type))
      .forEach((e) => {
        let c = {
          "axis": "y",
          "left": cy.$id(e.data.target),
          "right": cy.$id(e.data.source),
          "gap": 128
        };
        constraints.push(c);
      });

    // place dependants to the left of the dependency
    payload[1]
      .filter((e) => !["specializes", "realizes", "subpackage"]
        .includes(e.data.conn_type))
      .forEach((e) => {
        let c = {
          "axis": "x",
          "left": cy.$id(e.data.source),
          "right": cy.$id(e.data.target),
          "gap": 128
        };
        constraints.push(c);
      });

    // console.log(constraints);

    cy.layout({
      name: 'cola', animate: true,
      directed: true,
      nodeSpacing: function (node) {
        return 32;
      },
      flow: { axis: 'y', minSeparation: -32 },
      edgeSymDiffLength: 8,
      gapInequalities: constraints
    }).run();

    bindRouters();
  }

  // const layoutConfig = {
  //     name: "cola",
  //     handleDisconnected: true,
  //     animate: true,
  //     avoidOverlap: false,
  //     infinite: false,
  //     unconstrIter: 1,
  //     userConstIter: 0,
  //     allConstIter: 1,
  //     ready: e => {
  //         e.cy.fit()
  //         e.cy.center()
  //     }
  // }


  // let nodeid = 1;

  function bindRouters() {

    // right click dims the element
    cy.on('cxttap', 'node,edge',
      evt => evt.target.addClass("dimmed"));

    // left click highlights the node and its connected edges and nodes
    cy.on('tap', 'node', evt => {

      // currently visible relationship types
      const conn_types = Array.from(document
        .querySelectorAll('input[name="showrels"]'))
        .filter(cb => cb.checked).map(cb => cb.value);

      const edges = evt.target.connectedEdges()
        .filter(e => conn_types.includes(e.data('conn_type')));
      edges.removeClass("dimmed");
      edges.connectedNodes().removeClass("dimmed");

    });

    // left click highlights the edge and its connected nodes
    cy.on('tap', 'edge', evt => {

      evt.target.removeClass("dimmed");
      evt.target.connectedNodes().removeClass("dimmed");

    });

  }

}); // on dom ready


const saveAsSvg = function (filename) {
  const svgContent = cy.svg({ scale: 1, full: true, bg: 'beige' });
  const blob = new Blob([svgContent],
    { type: "image/svg+xml;charset=utf-8" });
  saveAs(blob, filename);
};

const getSvgUrl = function () {
  const svgContent = cy.svg({ scale: 1, full: true, bg: 'beige' });
  const blob = new Blob([svgContent],
    { type: "image/svg+xml;charset=utf-8" });
  return URL.createObjectURL(blob);
};

const setVisible = function (ele) {
  cy.edges('[conn_type = "' + ele.value + '"]')
    .toggleClass("hidden", !ele.checked);
};

const setLineBends = function (ele) {
  // console.log(ele.name);
  if (ele.checked) {
    cy.edges('[conn_type = "' + ele.name + '"]')
      .style("curve-style", ele.value);
  }
};

const relayout = function (layout) {
  // console.log(layout);
  cy.layout({
    name: layout, animate: true,
    directed: true,
    nodeSpacing: function (node) {
      return 32;
    },
    flow: { axis: 'y', minSeparation: -32 },
    edgeSymDiffLength: 8,
    gapInequalities: constraints
  }).run();
};

const highlight = function (text) {
  if (text) {
    const classes = text.split(/[,\s]+/);
    // console.log(classes);
    cy.elements().addClass("dimmed");
    cy.elements('.hidden').removeClass('hidden').addClass("hidden");

    const cy_classes = cy.nodes()
      .filter(e => classes.includes(e.data('name')));
    // console.log(cy_classes);
    const cy_edges = cy_classes.edgesWith(cy_classes);
    cy_classes.removeClass("dimmed");
    cy_edges.removeClass("dimmed");
    cy.nodes('[abstraction = "package"]').removeClass("dimmed");
  } else {
    cy.elements().removeClass("dimmed");
  }
};

flip = true;
const toggleVisibility = function () {
  cy.style().selector('.dimmed')
    .style({
      'display': flip ? 'none' : 'element'
    })
    .update();
  flip = !flip;
};