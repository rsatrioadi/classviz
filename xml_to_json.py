import xml.etree.ElementTree as ET
import json
import hashlib
import re

def check_name(node):
    regex = "[$]\d+"
    class_name = node.attrib["class"]
    if bool(re.search(regex, class_name)):
        node.set("class", re.sub(regex, "", class_name))

def traverse_call_tree(parent_node, children, firstCall=False):
    if not firstCall:
        check_name(parent_node)
        parent_name = parent_node.attrib["class"]

        if "sweethome3d" in parent_name:
            nodes.add(parent_name)

    for child in children:
        if not firstCall:
            check_name(child)
            child_name = child.attrib["class"]
            child_method = child.attrib["methodName"]

            if "sweethome3d" in child_name:
                nodes.add(child_name)

                if "init" in child_method or "cinit" in child_method:
                    edge = (parent_name, child_name, "creates")
                else:
                    edge = (parent_name, child_name, "calls")
                
                if "sweethome3d" in parent_name:
                    edges.add(edge)

        traverse_call_tree(child, child.findall("node"))

def node_sub_json(node, current_trace):
    output = {
        "data": {
            "id": node,
            "properties": {
                "simpleName": node.split(".")[-1],
                "kind": "class",
                "traces": [current_trace]
            },
            "labels": [
                "Structure"
            ]
        }
    }

    return output

def edge_sub_json(edge, current_trace):
    edge_id = f"{edge[0]}-{edge[2]}-{edge[1]}" # Edge ID is MD5 hash of: source-type-target.
    edge_id = hashlib.md5(edge_id.encode())

    output = {
        "data": {
            "id": edge_id.hexdigest(),
            "source": edge[0],
            "properties": {
                "weight": 1,
                "traces": [current_trace]
            },
            "target": edge[1],
            "labels": [edge[2]]
        }
    }

    return output

def construct_json(nodes, edges, current_trace):
    output = {
        "elements": {
            "nodes": [],
            "edges": []
        }
    }

    for node in nodes:
        output["elements"]["nodes"].append(node_sub_json(node, current_trace))
    
    for edge in edges:
        output["elements"]["edges"].append(edge_sub_json(edge, current_trace))

    return output


if __name__ == "__main__":
    PROJECT_NAME = "sweethome3d_part1"

    base_path = f"./feature_extraction/execution_info/{PROJECT_NAME}/"
    folder_names = ["ActionBar", "FurnitureCatalog", "GeneralScenario", "HomeFurnitureList", "HomePlan", "HomeView",
                    "Initialization", "MenuBar"]
    
    for folder in folder_names:
        file_path = folder + f"/{folder}_CallTree.xml"

        call_tree = ET.parse(base_path + file_path)

        nodes = set() # Set of nodes to be constructed.
        edges = set() # Set of edges to be constructed (source, target, calls/creates).

        traverse_call_tree(call_tree, call_tree.findall("node"), firstCall=True)
        final_output = construct_json(nodes, edges, current_trace=folder)

        with open(f"/Users/mboopi/Documents/GitHub/JavaClassClassification/extra_visualization/{PROJECT_NAME}_{folder}.json", "w") as outfile:
            json.dump(final_output, outfile, indent=2)
        outfile.close()