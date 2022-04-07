document.addEventListener('DOMContentLoaded', function(){ // on dom ready
    
    var nodes = new Promise((resolve, reject) => {
        Papa.parse('/data/full_members.csv', {
            download: true, header: true, complete: (res)=>resolve(transformData(res,prepNodes))});
    });
    
    var edges = new Promise((resolve, reject) => {
        Papa.parse('/data/full_connections.csv', {
            download: true, header: true, complete: (res)=>resolve(transformData(res,null))});
    });

    function transformData(es,fn) {
        f = es.data.map((e) => { return { data: e } });
        if (fn) {
            f = fn(f);
        }
        return f;
    }

    function prepNodes(nodes) {
        nodes.forEach((node) => {
            var annot = node.data.abstraction ? `«${node.data.abstraction}» ` : '';
            var names = node.data.id.split(".");
            node.data.label = `${annot}${names[names.length - 1]}`;
        });
        return nodes;
    }
    
    // function prepEdges(edges) {
    //     return edges;
    // }
    
    var toText = function(obj){ return obj.text(); };
    var style = fetch('style.cycss').then(toText);

    Promise.all([ nodes, edges, style ]).then(initCy);

    function initCy(then) {

        window.cy = cytoscape({
            container: document.getElementById('cy'),
            
            style: then[2],
            
            elements: {
                nodes: then[0],
                edges: then[1]
            },
            
            layout: {
                name: 'klay',
                // directed: true
            }
        });

        bindRouters();
    }
    
    const layoutConfig = {
        name: "cola",
        handleDisconnected: true,
        animate: true,
        avoidOverlap: false,
        infinite: false,
        unconstrIter: 1,
        userConstIter: 0,
        allConstIter: 1,
        ready: e => {
            e.cy.fit()
            e.cy.center()
        }
    }
    
    
    let nodeid = 1;
    
    function bindRouters() {

        cy.on('tap', 'node', evt => {
        
            cy.nodes().forEach(node => {
                node.lock();
            });
        
            const currentNodeId = nodeid++;
            const targetId = evt.target.data('id'); //cy.nodes()[Math.floor(Math.random() * cy.nodes().length)].data('id')
        
            cy.add([
                {
                    group: 'nodes',
                    data: {
                        id: currentNodeId
                    }
                },
                {
                    group: 'edges',
                    data: {
                        id: currentNodeId + '-edge',
                        source: currentNodeId,
                        target: targetId
                    }
                }
            ]);
        
            const layout = cy.makeLayout(layoutConfig);
            layout.run();
        
            layout.on("layoutstop", () => {
                cy.nodes().forEach(node => {
                    node.unlock();
                })
            })
        
        
        });
    }    
    
}); // on dom ready