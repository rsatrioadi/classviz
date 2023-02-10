#!/usr/bin/env python3

import json
import sys

def to_node(item):
  return {
      "data": {
          "id": item['identity']['low'],
          "labels": item['labels'],
          "properties": item['properties']
      }
  }

def to_edge(item):
    return {
        "data": {
            "id": item['identity']['low'],
            "source": item['start']['low'],
            "target": item['end']['low'],
            "label": item['type'],
            "properties": item['properties']
        }
    }

data = json.loads(sys.stdin.read())

nodes = list()
edges = list()
for item in sum(list(map(lambda x: x['_fields'], data)), []):
  item_nodes = [item['start'], item['end']] + \
      sum([[i['start'], i['end']] for i in item['segments']], [])
  for item_node in item_nodes:
    node = to_node(item_node)
    if not any(n['data']['id'] == node['data']['id'] for n in nodes):
      nodes.append(node)
  item_edges = [i['relationship'] for i in item['segments']]
  for item_edge in item_edges:
    edge = to_edge(item_edge)
    if not any(e['data']['id'] == edge['data']['id'] for e in edges):
      edges.append(edge)
all = {
    "elements": {
        "nodes": nodes,
        "edges": edges
    }
}

print(json.dumps(all))