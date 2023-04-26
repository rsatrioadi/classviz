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

var parentRel = "contains";


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

  setParents(parentRel, false);

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

  // cy.layout({
  //   name: 'klay', animate: true,
  //   nodeDimensionsIncludeLabels: true,
  //   klay: {
  //     direction: 'DOWN',
  //     edgeRouting: 'ORTHOGONAL',
  //     routeSelfLoopInside: true,
  //     thoroughness: 4,
  //     spacing: 32
  //   }
  // }).run();

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
  const table = document.getElementById("reltab"); // Get the table element
  table.innerHTML = "";

  // Create the thead element
  const thead = document.createElement("thead");

  // Create the tr element for the table header row
  const headerRow = document.createElement("tr");

  // Create the th elements for the table header cells
  const th1 = document.createElement("th");
  th1.textContent = "Connection";
  const th2 = document.createElement("th");
  th2.textContent = "Ortho";
  const th3 = document.createElement("th");
  th3.textContent = "Bezier";

  // Append the th elements to the header row
  headerRow.appendChild(th1);
  headerRow.appendChild(th2);
  headerRow.appendChild(th3);

  // Append the header row to the thead element
  thead.appendChild(headerRow);

  // Append the thead element to the table element
  table.appendChild(thead);

  _cy.edges().map(e => e.data('interaction'))
    .filter((v, i, s) => s.indexOf(v) === i)
    .forEach(l => {
      // Create a new row (tr)
      const row = document.createElement("tr");

      // Create the first cell (td) with a label and checkbox
      const cell1 = document.createElement("td");
      const label = document.createElement("label");
      label.setAttribute("for", l);
      const checkbox = document.createElement("input");
      checkbox.setAttribute("type", "checkbox");
      checkbox.setAttribute("id", l);
      checkbox.setAttribute("name", "showrels");
      checkbox.setAttribute("onchange", "setVisible(this)");
      checkbox.setAttribute("value", l);
      checkbox.checked = !["contains", "holds", "accepts", "returns", "accesses", "exhibits"].includes(l);
      const labelText = document.createTextNode(l);
      label.appendChild(checkbox);
      label.appendChild(labelText);
      cell1.appendChild(label);
      row.appendChild(cell1);

      // Create the second cell (td) with a radio button for taxi option
      const cell2 = document.createElement("td");
      const taxiRadio = document.createElement("input");
      taxiRadio.setAttribute("type", "radio");
      taxiRadio.setAttribute("onchange", "setLineBends(this)");
      taxiRadio.setAttribute("id", `${l}-ort`);
      taxiRadio.setAttribute("name", l);
      taxiRadio.setAttribute("value", "taxi");
      cell2.appendChild(taxiRadio);
      row.appendChild(cell2);

      // Create the third cell (td) with a radio button for bezier option
      const cell3 = document.createElement("td");
      const bezierRadio = document.createElement("input");
      bezierRadio.setAttribute("type", "radio");
      bezierRadio.setAttribute("onchange", "setLineBends(this)");
      bezierRadio.setAttribute("id", `${l}-bez`);
      bezierRadio.setAttribute("name", l);
      bezierRadio.setAttribute("value", "bezier");
      bezierRadio.checked = true;
      cell3.appendChild(bezierRadio);
      row.appendChild(cell3);

      // Append the row to the table
      table.appendChild(row);
    });

  document.querySelectorAll('input[name="showrels"]')
    .forEach((checkbox) => {
      setVisible(checkbox);
    });

}

const traceToColor = function (traceName) {
  let hash = 0;
  for (let i = 0; i < traceName.length; i++) {
    hash = traceName.charCodeAt(i) + ((hash << 5) - hash);
  }
  const color = Math.abs(hash).toString(16).substring(0, 6);
  return '#' + '0'.repeat(6 - color.length) + color;
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

  var form = document.getElementById("selectfeatures");

  // Need to reset everything when we choose a new JSON file to visualize.
  const inputs = form.querySelectorAll("input");
  const labels = form.querySelectorAll("label");
  inputs.forEach(input => input.remove());
  labels.forEach(label => label.remove());
 
  for (var i = 0; i < tracesList.length; i++) {
    const traceName = tracesList[i]; 

    var input = document.createElement("input");
    input.type = "checkbox";
    input.value = traceName;
    input.id = traceName + i;
    form.appendChild(input);
  
    var label = document.createElement("label");
    label.setAttribute("for", input.id);
    label.innerHTML = `${input.value}<br>`;
    label.style.color = traceToColor(traceName);
    form.appendChild(label);
  }
};

const checkSelectedFeatures = function () {
  var selectedValues = [];
  var form = document.getElementById('selectfeatures');
  const inputs = form.querySelectorAll("input");

  inputs.forEach(input => {
    if(input.checked) {
      selectedValues.push(input.value);
    }
  })

  return selectedValues;
};

const resetFeatures = function() {
  var form = document.getElementById('selectfeatures');
  form.reset();
  showTrace(["All"]);
}

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
  cy.edges(`[interaction = "${parentRel}"]`).style("display", "none");
};

const showTrace = function (traceNames) {
  const featureNodes = cy.nodes().filter(function (node) {
    return traceNames.some(function (trace) {
      return node.data("properties.traces") && node.data("properties.traces").includes(trace);
    });
  });

  const featureEdges = cy.edges().filter(function (edge) {
    return traceNames.some(function (trace) {
      return edge.data("properties.traces") && edge.data("properties.traces").includes(trace);
    });
  });

  if (!traceNames.includes("All")) {
    cy.elements().addClass("dimmed");
    cy.elements('.hidden').removeClass('hidden').addClass("hidden");
    featureNodes.removeClass("dimmed");
    featureEdges.removeClass("dimmed");

    cy.nodes('[properties.kind = "package"]').removeClass("dimmed");

    cy.elements().removeStyle(); // Remove styling that was overriden via eles.style().

    featureNodes.forEach(function(node) {
      traces = node.data("properties.traces");
      colors = traces.map(trace => traceToColor(trace));
      colors_string = colors.join(" ");

      node.style({
        "color": "white",
        "font-weight": "bold", 
        "background-fill": "linear-gradient",
        "background-gradient-direction": "to-right",
        "background-gradient-stop-colors": `${colors_string}`,
        // "background-gradient-stop-positions": "0 50 50 75 75 100"
      })
    });

  } else {
    cy.elements().removeClass("dimmed");
    cy.elements().removeStyle();
  }
  console.log(`[interaction = "${parentRel}"]`);
  cy.edges(`[interaction = "${parentRel}"]`).style("display", "none");
};

function openSidebarTab(evt, cityName) {
  var i, x, tablinks;
  x = document.getElementsByClassName("sidebar-tab");
  for (i = 0; i < x.length; i++) {
    x[i].style.display = "none";
  }
  tablinks = document.getElementsByClassName("tablink");
  for (i = 0; i < x.length; i++) {
    tablinks[i].className = tablinks[i].className.replace(" active", "");
  }
  document.getElementById(cityName).style.display = "block";
  evt.currentTarget.className += " active";
};