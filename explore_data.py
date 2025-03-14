import daft
import random
from collections import defaultdict

# Load Wikipedia data
print("Loading Wikipedia data from parquet files...")
try:
    wiki_nodes_df = daft.read_parquet("wikipedia/wikipedia_nodes.parquet").collect()
    raw_wiki_edges_df = daft.read_parquet("wikipedia/wikipedia_edges.parquet").collect()
    
    # Apply similarity filtering (same as in main.py)
    print("Filtering edges with similarity > 0.42...")
    wiki_edges_df = raw_wiki_edges_df.filter(daft.col("similarity") > 0.42)
    
    # Convert to Python dictionaries for easier processing
    wiki_nodes = wiki_nodes_df.to_pydict()
    wiki_edges = wiki_edges_df.to_pydict()
    
    print(f"Loaded Wikipedia data: {len(wiki_nodes['id'])} nodes, {len(wiki_edges['source'])} edges after filtering")
except Exception as e:
    print(f"Error loading Wikipedia data: {e}")
    exit(1)

# Create graph structure
graph = defaultdict(set)
for i in range(len(wiki_edges["source"])):
    source = wiki_edges["source"][i]
    target = wiki_edges["target"][i]
    # Add both directions as the graph is undirected
    graph[source].add(target)
    graph[target].add(source)

# Get a list of popular nodes (those with many connections)
node_popularity = [(node, len(connections)) for node, connections in graph.items()]
node_popularity.sort(key=lambda x: x[1], reverse=True)

# Print top 50 most connected nodes for reference
print("\nTop 50 most connected nodes:")
for i, (node, conn_count) in enumerate(node_popularity[:50]):
    print(f"{i+1}. {node} - {conn_count} connections")

# Verify if two nodes are exactly 2 degrees apart
def are_two_degrees_apart(node1, node2):
    if node1 not in graph or node2 not in graph:
        return False, []
    
    # Ensure they are not directly connected
    if node2 in graph[node1] or node1 in graph[node2]:
        return False, []
    
    # Find common neighbors
    common_neighbors = graph[node1].intersection(graph[node2])
    
    # Ensure they have at least one common neighbor
    if not common_neighbors:
        return False, []
    
    return True, list(common_neighbors)

# Function to find nodes that are exactly 2 degrees apart (have common neighbors)
def find_all_two_distance_nodes(node1):
    if not graph.get(node1):
        return []
    
    neighbors1 = graph[node1]
    two_distance_nodes = []
    
    # Find all nodes that have common neighbors with node1
    for candidate in graph.keys():
        # Skip self and direct neighbors
        if candidate == node1 or candidate in neighbors1:
            continue
            
        # Find common neighbors
        common_neighbors = neighbors1.intersection(graph[candidate])
        if common_neighbors:
            two_distance_nodes.append({
                "node2": candidate,
                "commonNeighbors": list(common_neighbors)
            })
    
    # Sort by connection count (most connected first)
    two_distance_nodes.sort(key=lambda x: len(graph.get(x["node2"], set())), reverse=True)
    return two_distance_nodes

# Test popular node pairs to find exactly 2-degree connections
def test_popular_pairs():
    # Start with well-known nodes from our popularity list
    popular_nodes = [
        "Barack Obama", "Donald Trump", "Apple Inc.", "Microsoft", 
        "The Beatles", "Michael Jackson", "Star Wars", "Marvel Comics",
        "NASA", "BBC", "YouTube", "Twitter", "Taylor Swift", "Beyoncé",
        "George W. Bush", "Soviet Union", "New York City", "Time (magazine)"
    ]
    
    print("\nTesting specific popular node pairs:")
    for i, node1 in enumerate(popular_nodes):
        if node1 not in graph:
            print(f"Node not found: {node1}")
            continue
            
        for node2 in popular_nodes[i+1:]:
            if node2 not in graph:
                continue
                
            is_two_apart, common_neighbors = are_two_degrees_apart(node1, node2)
            if is_two_apart:
                print(f"✓ {node1} and {node2} are exactly 2 degrees apart")
                common_neighbors_display = ", ".join(common_neighbors[:5])
                if len(common_neighbors) > 5:
                    common_neighbors_display += f" ... and {len(common_neighbors) - 5} more"
                print(f"    Common neighbors ({len(common_neighbors)}): {common_neighbors_display}")
            else:
                if common_neighbors:  # This should never be true given our function
                    print(f"× {node1} and {node2} are not exactly 2 degrees apart but have common neighbors")
                else:
                    direct_edge = node2 in graph[node1]
                    if direct_edge:
                        print(f"× {node1} and {node2} are directly connected (1 degree apart)")
                    else:
                        print(f"× {node1} and {node2} have no connection or common neighbors")

# Create a fixed set of interesting game questions
def create_game_questions():
    # Start with well-known nodes from our popularity list
    popular_nodes = [
        "Barack Obama", "Donald Trump", "Apple Inc.", "Microsoft", 
        "The Beatles", "Michael Jackson", "Star Wars", "Marvel Comics",
        "NASA", "BBC", "YouTube", "Twitter", "Taylor Swift", "Beyoncé",
        "George W. Bush", "Soviet Union", "New York City", "Time (magazine)"
    ]
    
    game_questions = []
    
    # Test specific pairs first
    test_popular_pairs()
    
    print("\nFinding additional 2-distance connections:")
    for node in popular_nodes:
        if node not in graph:
            print(f"Node not found: {node}")
            continue
            
        print(f"\nFinding 2-distance pairs for: {node}")
        
        # Get all nodes that are 2 degrees away from this node
        two_distance_nodes = find_all_two_distance_nodes(node)
        
        if not two_distance_nodes:
            print(f"No 2-distance nodes found for {node}")
            continue
            
        # Filter for suitable game questions - looking for:
        # 1. Well-connected nodes (reasonably popular)
        # 2. Modest number of common neighbors (not too many)
        suitable_pairs = []
        
        for pair in two_distance_nodes:
            node2 = pair["node2"]
            common_neighbors = pair["commonNeighbors"]
            
            # Skip if too many common neighbors (too easy)
            if len(common_neighbors) > 10:
                continue
                
            # Skip if node2 is not popular enough (measure by connection count)
            if len(graph[node2]) < 50:
                continue
                
            suitable_pairs.append(pair)
            
            # Limit to checking first 5 suitable pairs per node
            if len(suitable_pairs) >= 5:
                break
        
        for i, pair in enumerate(suitable_pairs):
            node2 = pair["node2"]
            common_neighbors = pair["commonNeighbors"]
            
            print(f"  Option {i+1}: {node} and {node2}")
            common_neighbors_display = ", ".join(common_neighbors[:5])
            if len(common_neighbors) > 5:
                common_neighbors_display += f" ... and {len(common_neighbors) - 5} more"
                
            print(f"    Common neighbors ({len(common_neighbors)}): {common_neighbors_display}")
            
            # Add to our list of game questions
            game_questions.append({
                "node1": node,
                "node2": node2,
                "commonNeighbors": common_neighbors
            })
            
            # Only keep the first suitable pair for each node
            break
    
    # Output in a format suitable for hard-coding
    print("\n" + "="*80)
    print("HARDCODED GAME QUESTIONS:")
    print("="*80)
    print("const hardcodedGameQuestions = [")
    
    for q in game_questions:
        print("  {")
        print(f'    node1: "{q["node1"]}",')
        print(f'    node2: "{q["node2"]}",')
        common_neighbors_str = ", ".join([f'"{n}"' for n in q["commonNeighbors"]])
        print(f"    commonNeighbors: [{common_neighbors_str}]")
        print("  },")
    
    print("];")
    
    return game_questions

# Generate game questions
create_game_questions()

print("\nDone exploring the data.") 