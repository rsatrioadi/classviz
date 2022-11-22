import sys
from browser import document, window
cytoscape = window.cytoscape

def methods(obj):
  return [m for m in dir(obj) if callable(getattr(obj,m)) and not m.startswith('_')]

name = document["vname"]
ctor = document["ctor"]
create_btn = document["create_btn"]

objmap = {}
varmap = {}

def create_obj(event):
  print(ctor.value)
  try:
    tmp = eval(ctor.value)
    locals()[name.value] = tmp
    print(str(tmp))
    objid = id(tmp)
    objmap[objid] = tmp
    varmap[name.value] = objid

    cy.add([
      { 'group': 'nodes', 'data': { 'id': name.value, 'label': name.value, 'type': 'variable' } },
      { 'group': 'nodes', 'data': { 'id': objid, 'label': str(tmp), 'type': 'object' } },
      { 'group': 'edges', 'data': { 'id': f"{name.value}-{objid}", 'source': name.value, 'target': objid } }
    ])
    cy.layout({
      'name': 'grid',
      'rows': 1
    }).run()
  except:
    e = sys.exc_info()[0]
    print('unable to create object', e)

create_btn.bind("click", create_obj)

cy = cytoscape({

  'container': document.getElementById('cy'), # container to render in

  'style': [ # the stylesheet for the graph
    {
      'selector': 'node[type="variable"]',
      'style': {
        'height': 'label',
        'width': 'label',
        'padding': '4px',
        'border-color': 'silver',
        'background-color': 'snow',
        'border-width': 1,
        'shape': 'rectangle',
        'text-valign': 'center',
        'text-wrap': 'wrap',
        'label': 'data(label)'
      }
    },

    {
      'selector': 'node[type="object"]',
      'style': {
        'height': 'label',
        'width': 'label',
        'padding': '8px',
        'border-color': 'royalblue',
        'background-color': 'royalblue',
        'border-width': 1,
        'shape': 'round-rectangle',
        'text-valign': 'center',
        'text-wrap': 'wrap',
        'label': 'data(label)',
        'color': 'white'
      }
    },

    {
      'selector': 'edge',
      'style': {
        'width': 1,
        'line-color': 'grey',
        'target-arrow-color': 'grey',
        'target-arrow-shape': 'triangle',
        'curve-style': 'bezier',
        'line-style': 'dashed'
      }
    }
  ],

  'layout': {
    'name': 'grid',
    'rows': 1
  }

})