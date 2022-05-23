document.addEventListener('DOMContentLoaded', function(){ // on dom ready
    
    var nodes = new Promise((resolve, reject) => {
        Papa.parse('/data/jhotdraw-stereotypes.csv', {
            download: true, header: true, skipEmptyLines: true, complete: (res)=>resolve(transformData(res,prepNodes))});
    });
    
    var edges = new Promise((resolve, reject) => {
        Papa.parse('/data/jhotdraw-connections.csv', {
            download: true, header: true, skipEmptyLines: true, complete: (res)=>resolve(transformData(res,prepEdges))});
    });

    function transformData(es,fn) {
        const f = es.data.map((e) => { return { data: e } });
        if (fn) {
            return fn(f);
        }
        return f;
    }

    function prepNodes(nodes) {
        nodes.forEach((node) => {
            const annot = node.data.abstraction ? node.data.abstraction !== "concrete" ? `«${node.data.abstraction}»\n` : '' : '';
            // const names = node.data.id.split(".");
            const name = node.data.id;
            // node.data.label = `${annot}${names[names.length - 1]}`;
            node.data.label = `${annot}${name}`;
        });
        return nodes;
    }
    
    function prepEdges(edges) {
        return edges;
    }
    
    const toText = function(obj){ return obj.text(); };
    const style = fetch('style.cycss').then(toText);

    Promise.all([ nodes, edges, style ]).then(initCy);

    function initCy(payload) {

        // console.log(payload[0]); // nodes
        // console.log(payload[1]); // edges

        var cy = window.cy = cytoscape({
            container: document.getElementById('cy'),
            
            style: payload[2],
            
            elements: {
                nodes: payload[0],
                edges: payload[1]
            },
            
            layout: {
                name: 'cola',
                directed: true,
                nodeSpacing: function (node) { return 32; },
                flow: { axis: 'y', minSeparation: -32 },
                edgeSymDiffLength: 8,

                /* for 'klay'
                direction: 'DOWN',
                // fixedAlignment: 'LEFTUP',
                inLayerSpacingFactor: 0.5, */
            }
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
                c = { "axis": "y", "left": cy.$id(e.data.target), "right": cy.$id(e.data.source), "gap": 128 };
                constraints.push(c);
            });
        
        // place subclasses below their superclasses
        payload[1]
            .filter((e) => ["inherits", "realizes"].includes(e.data.conn_type))
            .forEach((e) => {
                c = { "axis": "y", "left": cy.$id(e.data.target), "right": cy.$id(e.data.source), "gap": 128 };
                constraints.push(c);
            });
        
        // place dependants to the left of the dependency
        payload[1]
            .filter((e) => !["inherits", "realizes", "subpackage"].includes(e.data.conn_type))
            .forEach((e) => {
                c = { "axis": "x", "left": cy.$id(e.data.source), "right": cy.$id(e.data.target), "gap": 128 };
                constraints.push(c);
            });
        
        // console.log(constraints);

        cy.layout({
            name: 'cola', animate: true, 
            directed: true,
            nodeSpacing: function (node) { return 32; },
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

        cy.on('cxttap', 'node,edge', evt => evt.target.style("opacity", .1));

        cy.on('tap', 'node', evt => {

            const conn_types = Array.from(document.querySelectorAll('input[name="showrels"]')).filter(cb => cb.checked).map(cb => cb.value);
            const ed = evt.target.connectedEdges().filter(function (e) {
                return conn_types.includes(e.data('conn_type'));
            });
            console.log(ed);
            ed.style("opacity", 1);
            console.log(ed.connectedNodes());
            ed.connectedNodes().style("opacity", 1);

        
            // cy.nodes().forEach(node => {
            //     node.lock();
            // });
        
            // const currentNodeId = nodeid++;
            // const targetId = evt.target.data('id'); //cy.nodes()[Math.floor(Math.random() * cy.nodes().length)].data('id')
        
            // cy.add([
            //     {
            //         group: 'nodes',
            //         data: {
            //             id: currentNodeId
            //         }
            //     },
            //     {
            //         group: 'edges',
            //         data: {
            //             id: currentNodeId + '-edge',
            //             source: currentNodeId,
            //             target: targetId
            //         }
            //     }
            // ]);
        
            // const layout = cy.makeLayout(layoutConfig);
            // layout.run();
        
            // layout.on("layoutstop", () => {
            //     cy.nodes().forEach(node => {
            //         node.unlock();
            //     })
            // })
        
        
        });
    }    
    
}); // on dom ready


const saveAsSvg = function (filename) {
    const svgContent = cy.svg({scale: 1, full: true, bg: 'beige'});
    const blob = new Blob([svgContent], {type:"image/svg+xml;charset=utf-8"});
    saveAs(blob, "class-diagram.svg");
};

const getSvgUrl = function () {
    const svgContent = cy.svg({scale: 1, full: true, bg: 'beige'});
    const blob = new Blob([svgContent], {type:"image/svg+xml;charset=utf-8"});
    const url = URL.createObjectURL(blob);
    return url;
};

const setVisible = function (ele) {
    cy.edges('[conn_type = "' + ele.value + '"]').style("display", ele.checked ? "element" : "none");
};

const setLineBends = function (ele) {
    console.log(ele.name);
    if (ele.checked) {
        cy.edges('[conn_type = "' + ele.name + '"]').style("curve-style", ele.value);
    }
};

const relayout = function (layout) {
    console.log(layout);
    cy.layout({ 
        name: layout, animate: true, 
        directed: true,
        nodeSpacing: function (node) { return 32; },
        flow: { axis: 'y', minSeparation: -32 },
        edgeSymDiffLength: 8,
        gapInequalities: constraints
    }).run();
};

var highlight = function (text) {
    if (text) {
        var classes = text.split(/[,\s]+/);
        // console.log(classes);
        cy.elements().style("opacity", .1);

        var cy_classes = cy.nodes().filter(function (e) {
            return classes.includes(e.data('id'));
        });
        // console.log(cy_classes);
        var cy_edges = cy_classes.edgesWith(cy_classes);
        cy_classes.style("opacity", 1);
        cy_edges.style("opacity", 1);
        cy.nodes('[abstraction = "package"]').style("opacity", 1);
    } else {
        cy.elements().style("opacity", 1);
    }
}
