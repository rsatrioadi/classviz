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

let parentRel = "contains";

const colors = [
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
  fillBugsDropdown(cy);
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
  cy.nodes().filter('node').forEach(n=>(bindPopper(n)))
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
  cy.nodes().filter((n) => n.data("labels").includes("Container") && n.data("labels").length === 1)
    .toggleClass("pkghidden", !ele.checked);
};

const setVisible = function (ele) {
  cy.edges(`[interaction = "${ele.value}"]`)
    .toggleClass("hidden", !ele.checked);
};

const setLineBends = function (ele) {
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

  for (let i = 0; i < tracesList.length; i++) {

    const div = document.createElement("div");
    const label = document.createElement("label");
    label.setAttribute("for", `feature-${tracesList[i]}`);
    label.setAttribute("class", "featurelabel")
    const checkbox = document.createElement("input");
    checkbox.setAttribute("type", "checkbox");
    checkbox.setAttribute("id", `feature-${tracesList[i]}`);
    checkbox.setAttribute("name", "showfeatures");
    checkbox.setAttribute("onchange", "showTrace(this)");
    checkbox.setAttribute("value", tracesList[i]);
    const labelText = document.createTextNode(tracesList[i]);
    label.appendChild(checkbox);
    label.appendChild(labelText);

    div.appendChild(label);
    dropdown.appendChild(div);
  }
};


const fillBugsDropdown = function (_cy) {
  let bugsSet = new Set();
  _cy.nodes().forEach((e) => {
    if (e.data()["properties"]["vulnerabilities"]) {
     e.data()["properties"]["vulnerabilities"].forEach((bug) => {

       bugsSet.add(bug["analysis_name"])
      });
    }
  });


  let bugList = Array.from(bugsSet)
  console.log(bugList)

  // Get the dropdown element.
  const dropdown = document.getElementById('tab-bugs');
  dropdown.innerHTML = "";

  for (var i = 0; i < bugList.length; i++) {

    const div = document.createElement("div");
    const label = document.createElement("label");
    label.setAttribute("for", `bug-${bugList[i]}`);
    label.setAttribute("class", "buglabel")
    const checkbox = document.createElement("input");
    checkbox.setAttribute("type", "checkbox");
    checkbox.setAttribute("id", `bug-${bugList[i]}`);
    checkbox.setAttribute("name", "showbugs");
    checkbox.setAttribute("onchange", "showBug(this)");
    checkbox.setAttribute("value", bugList[i]);
    const labelText = document.createTextNode(bugList[i]);
    label.appendChild(checkbox);
    label.appendChild(labelText);

    div.appendChild(label);
    dropdown.appendChild(div);
  }
};



function arrayIntersection(arr1, arr2) {
  const result = [];
  for (const item of arr1) {
    if (arr2.includes(item)) {
      result.push(item);
    }
  }
  return result;
}

const highlight = function (text) {
  if (text) {
    const classes = text.split(/[,\s]+/);
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

const showTrace = function (evt) {

  const trace_names = Array.from(document.getElementsByName("showfeatures"))
      .filter((e) => e.checked)
      .map((e) => e.value);

  Array.from(document.getElementsByClassName("featurelabel")).forEach((e) => {
    e.style.backgroundColor = "";
  });

  if (trace_names.length > 0) {

    const colorMap = {};
    for (var i = 0; i < trace_names.length; i++) {
      const labelElement = document.querySelector(`label[for="feature-${trace_names[i]}"]`);
      labelElement.style.backgroundColor = colors[i];
      colorMap[trace_names[i]] = colors[i];
    }

    const feature_nodes = cy.nodes().filter(function (node) {
      return trace_names.some(function (trace) {
        return node.data("properties.traces") && node.data("properties.traces").includes(trace);
      });
    });

    const feature_edges = cy.edges().filter(function (edge) {
      return trace_names.some(function (trace) {
        return edge.data("properties.traces") && edge.data("properties.traces").includes(trace);
      });
    });

    cy.elements().addClass("dimmed");
    cy.elements('.hidden').removeClass('hidden').addClass("hidden");
    feature_nodes.removeClass("dimmed");
    feature_edges.removeClass("dimmed");
    cy.nodes('[properties.kind = "package"]').removeClass("dimmed");
    feature_nodes.removeClass("feature_reset");
    feature_edges.removeClass("feature_reset");
    feature_nodes.addClass("feature_shown");
    feature_edges.addClass("feature_shown");

    feature_nodes.forEach((node) => {
      const trc = arrayIntersection(trace_names, node.data("properties.traces"));
      node.style("background-gradient-stop-colors", trc.map((t) => colorMap[t]).join(" "));
      console.log(trc.map((t) => colorMap[t]).join(" "));
    });

  } else {
    cy.elements().removeClass("dimmed");
    cy.elements().removeClass("feature_shown");
    cy.elements().addClass("feature_reset");
  }
  cy.edges(`[interaction = "${parentRel}"]`).style("display", "none");
};

const showBug = function (evt) {

  const bug_names = Array.from(document.getElementsByName("showbugs"))
      .filter((e) => e.checked)
      .map((e) => e.value);

  Array.from(document.getElementsByClassName("buglabel")).forEach((e) => {
    e.style.backgroundColor = "";
  });

  if (bug_names.length > 0) {

    const colorMap = {};
    for (var i = 0; i < bug_names.length; i++) {
      const labelElement = document.querySelector(`label[for="bug-${bug_names[i]}"]`);
      labelElement.style.backgroundColor = colors[i];
      colorMap[bug_names[i]] = colors[i];
    }

    const bug_nodes = cy.nodes().filter(function (node) {
      return bug_names.some(function (bug) {
        try {
          return node.data()["properties"]["vulnerabilities"] && node.data()["properties"]["vulnerabilities"].some((e)=> e["analysis_name"]===bug);
        }catch (e){

        }
      });
    });



    cy.elements().addClass("dimmed");
    cy.elements('.hidden').removeClass('hidden').addClass("hidden");
    bug_nodes.removeClass("dimmed");

    cy.nodes('[properties.kind = "package"]').removeClass("dimmed");
    bug_nodes.removeClass("byg_reset");

    bug_nodes.addClass("bug_shown");




    bug_nodes.forEach((node) => {
      const trc = arrayIntersection(bug_names, node.data()["properties"]["vulnerabilities"].map((vul)=> {
        return vul["analysis_name"]
      }));
      node.style("background-gradient-stop-colors", trc.map((t) => colorMap[t]).join(" "));
      console.log(trc.map((t) => colorMap[t]).join(" "));
    });

  } else {
    cy.elements().removeClass("dimmed");
    cy.elements().removeClass("bug_shown");
    cy.elements().addClass("bug_reset");
  }
  cy.edges(`[interaction = "${parentRel}"]`).style("display", "none");
};



function openSidebarTab(evt, cityName) {
  let i, x, tablinks;
  x = document.getElementsByClassName("sidebar-tab");
  for (i = 0; i < x.length; i++) {
    x[i].style.display = "none";
  }
  tablinks = document.getElementsByClassName("tablink");
  for (i = 0; i < tablinks.length; i++) {
    tablinks[i].className = tablinks[i].className.replace(" active", "");
  }
  document.getElementById(cityName).style.display = "block";
  evt.currentTarget.className += " active";
}

function bindPopper(target) {
  let tooltipId = `popper-target-${target.id()}`;
  let existingTarget = document.getElementById(tooltipId);
  if (existingTarget && existingTarget.length !== 0) {
    existingTarget.remove();
  }

  if (target.data()["properties"].hasOwnProperty('vulnerabilities') && target.data()["properties"]["vulnerabilities"].length >0) {

    let popper = target.popper({
      content: () => {
        // create div container
        let tooltip = document.createElement('div');

        // adding id for easier JavaScript control
        tooltip.id = tooltipId;

        // adding class for easier CSS control
        tooltip.classList.add('target-popper');

        // create actual table


        // append table to div container

        let targetData = target.data()["properties"]["vulnerabilities"];

        // loop through target data
        for (let prop in targetData) {
          let targetValue = targetData[prop];
          let p= document.createElement('p');
          p.innerText = target.data()["properties"]["vulnerabilities"][prop]["analysis_name"]+": "+target.data()["properties"]["vulnerabilities"][prop]["description"];
          tooltip.appendChild(p)
        }

        document.body.appendChild(tooltip);

        return tooltip;
      },
      popper: {
        placement: "auto"
      }
    });

    target.on('position', () => {
      popper.update();
    });

    target.cy().on('pan zoom resize', () => {
      popper.update();
    });


    target.on('mouseover', () => {
      if(!target.hasClass('dimmed')){
        if (document.getElementById(tooltipId)) {
          document.getElementById(tooltipId).classList.add('active');
        }
      }

    }).on('mouseout', () => {
      if (document.getElementById(tooltipId)) {
        document.getElementById(tooltipId).classList.remove('active');
      }
    })
  }
}
