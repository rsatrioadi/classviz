import json

def get_entries(files):
    all_nodes = files[0]["elements"]["nodes"]
    all_edges = files[0]["elements"]["edges"]
    for count, file in enumerate(files):
        if not count == 0:
            all_nodes += file["elements"]["nodes"]
            all_edges += file["elements"]["edges"]

    return all_nodes, all_edges

def merge_entries(all_entries):
    # Group the objects by their id.
    grouped_data = {}
    for obj in all_entries:
        id = obj["data"]["id"]
        if id in grouped_data:
            grouped_data[id].append(obj)
        else:
            grouped_data[id] = [obj]

    # Concatenate the traces of the grouped objects.
    merged_data_list = []
    for id, objs in grouped_data.items():
        merged_obj = objs[0]
        for obj in objs[1:]:
            merged_obj["data"]["properties"]["traces"] += obj["data"]["properties"]["traces"]
        merged_data_list.append(merged_obj)
    
    return merged_data_list

def construct_final_json(merged_nodes, merged_edges):
    output = {
        "elements": {
            "nodes": merged_nodes,
            "edges": merged_edges
        }
    }

    return output


if __name__ == "__main__":
    PROJECT_NAME = "sweethome3d_part1"

    base_path = f"/Users/mboopi/Documents/GitHub/JavaClassClassification/extra_visualization"
    file_suffixes = ["ActionBar", "FurnitureCatalog", "GeneralScenario", "HomeFurnitureList", "HomePlan", "HomeView",
                     "Initialization", "MenuBar"]
    
    all_files = []

    for file_suffix in file_suffixes:
        with open(f"{base_path}/{PROJECT_NAME}_{file_suffix}.json", "r") as f:
            all_files.append(json.load(f))

    # with open("/Users/mboopi/Documents/GitHub/JavaClassClassification/extra_visualization/TEST_JSON.json", "r") as f:
    #     file1 = json.load(f)
    # with open("/Users/mboopi/Documents/GitHub/JavaClassClassification/extra_visualization/TEST_JSON2.json", "r") as f:
    #     file2 = json.load(f)

    # files = [file1, file2]

    all_nodes, all_edges = get_entries(all_files)
    merged_nodes = merge_entries(all_nodes)
    merged_edges = merge_entries(all_edges)

    merged_json = construct_final_json(merged_nodes, merged_edges)
    
    with open(f"/Users/mboopi/Documents/GitHub/JavaClassClassification/extra_visualization/{PROJECT_NAME}input.json", "w") as outfile:
        json.dump(merged_json, outfile, indent=2)
    outfile.close()