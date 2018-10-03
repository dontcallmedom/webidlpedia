fetch('results.json').then(r => r.json()).then(({results:data}) => {
    var used_by = {};
    data.forEach(s => {
        if (s.idl && s.idl.idlNames) {
            Object.keys(s.idl.idlNames).forEach(n => { if (!used_by[n]) used_by[n] = [];});
            Object.keys(s.idl.idlNames._dependencies).forEach( n => {
                s.idl.idlNames._dependencies[n].forEach(d => {
                    if (!used_by[d]) {
                        used_by[d] = [];
                    }
                    used_by[d].push(n);
                });
            });
        }
    });

    // add some nodes to the graph and watch it go...
    var nodes = [];
    var typeColors = {"interface": "#00F", "dictionary": "#0F0", "typedef": "#666", "enum": "#000"};
    var color = t => { return typeColors[t] || "#666";}
    data.forEach(s => {
        if (s.idl && s.idl.idlNames) {
            nodes = nodes.concat(Object.keys(s.idl.idlNames).filter(n => n!=="_dependencies").map(n => {return {data: {id:n, type: color(s.idl.idlNames[n].type), size: used_by[n] ? used_by[n].length + 1 : 1}, selectable: true};}));
        }
    });
    var names = nodes.map( n => n.data.id);
    var edges = [];
    data.forEach(s => {
        if (s.idl && s.idl.idlNames) {
            Object.keys(s.idl.idlNames._dependencies).forEach( n => {
                s.idl.idlNames._dependencies[n].forEach(d => {
                    if (names.indexOf(n) !== -1 && names.indexOf(d) !== -1) {
                        edges.push({data:{source:d, target:n}});
                    }
                });
            });
        }
    });
    var elements = nodes.concat(edges);
    var cy = cytoscape({
        container: document.getElementById('cy'),
        elements: elements,
        //                hideEdgesOnViewport: true,
        layout: {name: 'cose', animate: false},
        style: [ // the stylesheet for the graph
            {
                selector: 'node',
                style: {
                    'width': 'data(size)',
                    'height': 'data(size)',
                    'background-color': 'data(type)',
                    'label': 'data(id)'
                }
            },

            {
                selector: 'edge',
                style: {
                    'width': 2,
                    'line-color': '#ccc',
                    'target-arrow-color': '#ccc',
                    'target-arrow-shape': 'triangle'
                }
            }
        ],
    });

});


