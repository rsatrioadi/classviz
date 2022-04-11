document.addEventListener('DOMContentLoaded', function(){ // on dom ready
    
    var nodes = new Promise((resolve, reject) => {
        Papa.parse('/data/k9full_members.csv', {
            download: true, header: true, complete: (res)=>resolve(transformData(res,prepNodes))});
    });
    
    var edges = new Promise((resolve, reject) => {
        Papa.parse('/data/k9full_connections.csv', {
            download: true, header: true, complete: (res)=>resolve(transformData(res,prepEdges))});
    });

    function transformData(es,fn) {
        var f = es.data.map((e) => { return { data: e } });
        if (fn) {
            return fn(f);
        }
        return f;
    }

    function prepNodes(nodes) {
        nodes.forEach((node) => {
            var annot = node.data.abstraction ? node.data.abstraction !== "concrete" ? `«${node.data.abstraction}»\n` : '' : '';
            var names = node.data.id.split(".");
            node.data.label = `${annot}${names[names.length - 1]}`;
        });
        return nodes;
    }
    
    function prepEdges(edges) {
        // return edges;
        return edges.filter((edge) => edge.data.conn_type === 'calls');
    }
    
    var toText = function(obj){ return obj.text(); };
    var style = fetch('style.cycss').then(toText);

    Promise.all([ nodes, edges, style ]).then(initCy);

    function initCy(payload) {

        console.log(payload[0]); // nodes
        console.log(payload[1]); // edges

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
                nodeSpacing: function (node) { return 64; },

                /* for 'klay'
                direction: 'DOWN',
                // fixedAlignment: 'LEFTUP',
                inLayerSpacingFactor: 0.5, */
            }
        });

        constraints = [];

        // place subclasses below their superclasses
        payload[1]
            .filter((e) => e.data.conn_type === "inherits" || e.data.conn_type === "realizes")
            .forEach((e) => {
                c = { "axis": "y", "left": cy.$id(e.data.target), "right": cy.$id(e.data.source), "gap": 256 };
                constraints.push(c);
            });
        
        // place dependants to the left of the dependency
        payload[1]
            .filter((e) => e.data.conn_type !== "inherits" && e.data.conn_type !== "realizes")
            .forEach((e) => {
                c = { "axis": "x", "left": cy.$id(e.data.source), "right": cy.$id(e.data.target), "gap": 256 };
                constraints.push(c);
            });
        
        console.log(constraints);

        cy.layout({name: 'cola', animate: true, gapInequalities: constraints}).run();

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

        cy.on('tap', 'node', evt => {
        
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