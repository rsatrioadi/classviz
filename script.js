const prepareEles = function (eles) {

  eles.nodes.forEach((node) => {
    node.data.name = node.data.properties.shortname ? node.data.properties.shortname : node.data.properties.simpleName;
    node.data.label = `${node.data.name}`;
  });

  eles.edges.forEach((edge) => {
    edge.data.interaction = edge.data.label ? edge.data.label : edge.data.labels.join();
  });

  return eles;
}

function setParents(relationship, inverted) {
  cy.edges("#parentRel").removeClass("parentRel")
  if (inverted) {
    cy.edges(`[interaction = "${relationship}"]`).forEach(edge => {
      edge.source().move({ parent: edge.target().id() });
    });
  } else {
    cy.edges(`[interaction = "${relationship}"]`).forEach(edge => {
      edge.target().move({ parent: edge.source().id() });
    });
  }
  cy.edges(`[interaction = "${relationship}"]`).addClass("parentRel");
}

function initCy(payload) {

  const cy = window.cy = cytoscape({

    container: document.getElementById('cy'),

    elements: {
      nodes: payload[0].nodes,
      edges: payload[0].edges
    },

    style: payload[1],

    wheelSensitivity: 0.25,
  });

  setParents("contains", false);

  fillRelationshipToggles(cy);
  fillFeatureDropdown(cy);

  constraints = [];

  // place subclasses below their superclasses
  payload[0].edges
    .filter((e) => ["specializes", "realizes"].includes(e.data.interaction))
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
  payload[0].edges
    .filter((e) => !["specializes", "realizes", "contains"].includes(e.data.interaction))
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

  bindRouters();

  const cbShowPrimitives = document.getElementById("showPrimitives");
  const cbShowPackages = document.getElementById("showPackages");

  cbShowPrimitives.checked = false;
  cbShowPackages.checked = true;

  showPrimitives(cbShowPrimitives);
  showPackages(cbShowPackages);

  cy.layout({
    name: 'klay', animate: true,
    nodeDimensionsIncludeLabels: true,
    klay: {
      direction: 'DOWN',
      edgeRouting: 'ORTHOGONAL',
      routeSelfLoopInside: true,
      thoroughness: 4,
      spacing: 32
    }
  }).run();

  return cy;
}

function bindRouters() {

  // right click dims the element
  cy.on('cxttap', 'node,edge',
    evt => {
      evt.target.addClass("dimmed")
      const interactions = Array.from(document
        .querySelectorAll('input[name="showrels"]'))
        .filter(cb => cb.checked).map(cb => cb.value);

      const edges = evt.target.connectedEdges()
        .filter(e => interactions.includes(e.data('interaction')));
      console.log(interactions)
      console.log(edges)
      edges.addClass("dimmed");
    });

  // left click highlights the node and its connected edges and nodes
  cy.on('tap', 'node', evt => {
    evt.target.removeClass("dimmed")

    // currently visible relationship types
    const interactions = Array.from(document
      .querySelectorAll('input[name="showrels"]'))
      .filter(cb => cb.checked).map(cb => cb.value);

    const edges = evt.target.connectedEdges()
      .filter(e => interactions.includes(e.data('interaction')));
    console.log(interactions)
    console.log(edges)
    edges.removeClass("dimmed");
    edges.connectedNodes().removeClass("dimmed");

  });

  // left click highlights the edge and its connected nodes
  cy.on('tap', 'edge', evt => {

    evt.target.removeClass("dimmed");
    evt.target.connectedNodes().removeClass("dimmed");

  });

}

const relayout = function (layout) {
  // console.log(layout);
  cy.layout({
    name: layout, animate: true,
    nodeDimensionsIncludeLabels: true,
    klay: {
      direction: 'DOWN',
      edgeRouting: 'ORTHOGONAL',
      routeSelfLoopInside: true,
      thoroughness: 4,
      spacing: 32
    }
  }).run();
};

const highlight = function (text) {
  if (text) {
    const classes = text.split(/[,\s]+/);
    // console.log(classes);
    cy.elements().addClass("dimmed");
    cy.elements('.hidden').removeClass('hidden').addClass("hidden");

    const cy_classes = cy.nodes()
      .filter(function (node) {
        return classes.includes(node.data('name'));
      });
    const cy_edges = cy_classes.edgesWith(cy_classes);
    cy_classes.removeClass("dimmed");
    cy_edges.removeClass("dimmed");
    cy.nodes('[properties.kind = "package"]').removeClass("dimmed");
  } else {
    cy.elements().removeClass("dimmed");
  }
};

let json;
let filePrefix;
let eles;
document.addEventListener('DOMContentLoaded', function () { // on dom ready

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

const showPrimitives = function (ele) {
  cy.nodes().filter((n) => n.data("labels").includes("Primitive") || n.data("id") === "java.lang.String")
    .style({ display: ele.checked ? "element" : "none" });
};

const showPackages = function (ele) {
  cy.nodes().filter((n) => n.data("labels").includes("Container") && n.data("labels").length == 1)
    .toggleClass("pkghidden", !ele.checked);
};

const setVisible = function (ele) {
  cy.edges(`[interaction = "${ele.value}"]`)
    .toggleClass("hidden", !ele.checked);
};

const setLineBends = function (ele) {
  // console.log(ele.name);
  if (ele.checked) {
    cy.edges(`[interaction = "${ele.name}"]`)
      .style("curve-style", ele.value);
  }
};

const fileUpload = function () {
  const fileSelector = document.getElementById("file-selector")
  fileSelector.click();
  fileSelector.addEventListener('change', (event) => {
    const file = event.target.files[0];
    filePrefix = file.name;
    document.getElementById("filename").textContent = `Software Visualization: ${filePrefix}`;
    const reader = new FileReader();
    reader.readAsText(file, 'UTF-8');
    reader.onload = function (e) {
      json = JSON.parse(e.target.result);
      eles = prepareEles(json.elements);
      const style = fetch('style.cycss')
        .then(res => res.text());

      Promise.all([eles, style])
        .then(initCy);
    }
  });
}

flip = true;
const toggleVisibility = function () {
  cy.style().selector('.dimmed')
    .style({
      'display': flip ? 'none' : 'element'
    })
    .update();
  flip = !flip;
};

const fillRelationshipToggles = function (_cy) {

  document.getElementById("reltab").innerHTML = `
        <thead>
          <th>Connection</th>
          <th>Ortho</th>
          <th>Bezier</th>
        </thead>
        `;
  _cy.edges().map(e => e.data('interaction'))
    .filter((v, i, s) => s.indexOf(v) === i)
    .forEach(l => {
      document.getElementById("reltab").innerHTML += `
        <tr>
          <td><label for="${l}">
              <input type="checkbox" id="${l}" name="showrels" onchange="setVisible(this)" value="${l}"
                checked="true">${l}</input>
            </label></td>
          <td><input type="radio" onchange="setLineBends(this)" id="${l}-ort" name="${l}" value="taxi"></td>
          <td><input type="radio" onchange="setLineBends(this)" id="${l}-bez" name="${l}" value="bezier"
              checked="true">
          </td>
        </tr>
        `;
    });

  document.querySelectorAll('input[name="showrels"]')
    .forEach((checkbox) => {
      setVisible(checkbox);
    });

}

const fillFeatureDropdown = function (_cy) {
  let tracesSet = new Set();
  _cy.nodes().forEach((e) => {
    if (e.data("properties.traces")) {
      e.data("properties.traces").forEach((trace) => {
        tracesSet.add(trace);
      });
    }
  });

  let tracesList = Array.from(tracesSet);

  // Get the dropdown element.
  const dropdown = document.getElementById('selectfeature');
  dropdown.innerHTML = "";
  var allTraces = document.createElement("option");
  allTraces.value = "All";
  allTraces.text = "All (default)";
  dropdown.appendChild(allTraces);
  for (var i = 0; i < tracesList.length; i++) {
    var option = document.createElement("option");
    option.value = tracesList[i];
    option.text = tracesList[i];
    dropdown.appendChild(option);
  }
}

const showTrace = function (trace_name) {

  const feature_nodes = cy.nodes().filter(function (node) {
    return node.data("properties.traces") && node.data("properties.traces").includes(trace_name);
  });

  const feature_edges = cy.edges().filter(function (edge) {
    return edge.data("properties.traces") && edge.data("properties.traces").includes(trace_name);
  });

  cy.elements().removeClass("dimmed");
  cy.elements().removeClass("feature_shown");
  cy.elements().addClass("feature_reset");

  if (trace_name !== "All") {
    cy.elements().addClass("dimmed");
    cy.nodes('[properties.kind = "package"]').removeClass("dimmed");
    feature_nodes.removeClass("dimmed");
    feature_edges.removeClass("dimmed");
    feature_nodes.removeClass("feature_reset");
    feature_edges.removeClass("feature_reset");
    feature_nodes.addClass("feature_shown");
    feature_edges.addClass("feature_shown");
  }
};
