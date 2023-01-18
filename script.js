document.addEventListener('DOMContentLoaded', function () { // on dom ready

  const nodes = new Promise((resolve, reject) => {
    console.log("load nodes");
    Papa.parse('/data/jhotdraw-nodes.csv', {
      download: true, header: true, skipEmptyLines: true,
      complete: (res) => resolve(transformData(res, prepNodes))
    });
  });

  const edges = new Promise((resolve, reject) => {
    Papa.parse('/data/jhotdraw-edges.csv', {
      download: true, header: true, skipEmptyLines: true,
      complete: (res) => resolve(transformData(res, prepEdges))
    });
  });

  function transformData(es, fn) {
    const f = es.data.map((e) => {
      return {data: e}
    });
    if (fn) {
      return fn(f);
    }
    return f;
  }

  function prepNodes(nodes) {
    nodes.forEach((node) => {
      const annot = node.data.abstraction
          ? node.data.abstraction !== "concrete"
              ? `«${node.data.abstraction}»\n`
              : ''
          : '';
      // const names = node.data.id.split(".");
      const name = node.data.name;
      // node.data.label = `${annot}${names[names.length - 1]}`;
      node.data.label = `${annot}${name}`;
    });
    return nodes;
  }

  function prepEdges(edges) {
    edges.forEach((edge) => {
      edge.data.conn_type = edge.data.interaction;
    });
    return edges;
  }

  const toText = function (obj) {
    return obj.text();
  };
  const style = fetch('style.cycss').then(toText);

  Promise.all([nodes, edges, style]).then(initCy);

  function initCy(payload) {

    // console.log(payload[0]); // nodes
    // console.log(payload[1]); // edges

    const cy = window.cy = cytoscape({
      container: document.getElementById('cy'),

      style: payload[2],

      elements: {
        nodes: payload[0],
        edges: payload[1]
      },

      layout: {
        name: 'cola',
        directed: true,
        nodeSpacing: function (node) {
          return 32;
        },
        flow: {axis: 'y', minSeparation: -32},
        edgeSymDiffLength: 8,

        /* for 'klay'
        direction: 'DOWN',
        // fixedAlignment: 'LEFTUP',
        inLayerSpacingFactor: 0.5, */
      },
      
      wheelSensitivity: 0.25,
    });

    const checkboxes = document.querySelectorAll('input[name="showrels"]');
    checkboxes.forEach((checkbox) => {
      setVisible(checkbox);
    });

    constraints = [];

    // place subpackages below their parent packages
    payload[1]
        .filter((e) => ["subpackage"].includes(e.data.conn_type))
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
      flow: {axis: 'y', minSeparation: -32},
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
  const svgContent = cy.svg({scale: 1, full: true, bg: 'beige'});
  const blob = new Blob([svgContent],
      {type: "image/svg+xml;charset=utf-8"});
  saveAs(blob, filename);
};

const getSvgUrl = function () {
  const svgContent = cy.svg({scale: 1, full: true, bg: 'beige'});
  const blob = new Blob([svgContent],
      {type: "image/svg+xml;charset=utf-8"});
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
    flow: {axis: 'y', minSeparation: -32},
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