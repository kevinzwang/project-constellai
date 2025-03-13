from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from typing import List, Dict, Set, Any
from pydantic import BaseModel
from openai import OpenAI
from dotenv import load_dotenv
import json
import daft
import logging
import os
import time

# Set up logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
    handlers=[
        logging.StreamHandler(),
        logging.FileHandler("api.log")
    ]
)
logger = logging.getLogger("constellai-backend")

# Load environment variables
load_dotenv("../.env")

client = OpenAI()

app = FastAPI()

# Add CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],  # Frontend URL
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Load Twitter data
logger.info("Loading Twitter data")
users_list = daft.read_parquet("../twitter_users.parquet").to_pydict()
user_interactions_df = daft.read_parquet("../twitter_user_interactions.parquet").collect()
logger.info(f"Loaded Twitter data: {len(users_list['user'])} users, {user_interactions_df.count_rows()} interactions")

# Load Wikipedia data
logger.info("Loading Wikipedia data")
# Check if Wikipedia files exist
wiki_nodes_path = "../wikipedia/wikipedia_nodes.parquet"
wiki_edges_path = "../wikipedia/wikipedia_edges.parquet"

wiki_nodes_exists = os.path.exists(wiki_nodes_path)
wiki_edges_exists = os.path.exists(wiki_edges_path)

# Helper functions for deduplication and preprocessing
def preprocess_wiki_data(nodes_df, edges_df):
    """
    Comprehensive preprocessing for Wikipedia data:
    1. Remove duplicate nodes
    2. Remove self-loops (source == target)
    3. Ensure undirected edges appear only once
    4. Remove island nodes (nodes with no edges)
    
    Args:
        nodes_df: Daft DataFrame containing node data
        edges_df: Daft DataFrame containing edge data
        
    Returns:
        Tuple of (processed_nodes_df, processed_edges_df)
    """
    logger.info("Starting comprehensive Wikipedia data preprocessing")
    start_time = time.time()
    
    try:
        # Convert to Python dictionaries for easier processing
        nodes_dict = nodes_df.to_pydict()
        edges_dict = edges_df.to_pydict()
        
        # Step 1: Remove duplicate nodes
        unique_nodes = {}
        for i, node_id in enumerate(nodes_dict["id"]):
            if node_id not in unique_nodes:
                unique_nodes[node_id] = {
                    "summary": nodes_dict["summary"][i],
                    "text": nodes_dict["text"][i]
                }
        
        logger.info(f"Deduplicated nodes: {len(nodes_dict['id'])} original nodes reduced to {len(unique_nodes)} unique nodes")
        
        # Step 2 & 3: Process edges - remove self-loops and deduplicate
        processed_edges = {
            "source": [],
            "target": [],
            "similarity": []
        }
        
        seen_edges = set()
        edge_count = 0
        self_loop_count = 0
        
        for i in range(len(edges_dict["source"])):
            source = edges_dict["source"][i]
            target = edges_dict["target"][i]
            similarity = edges_dict["similarity"][i]
            
            # Skip self-loops
            if source == target:
                self_loop_count += 1
                continue
                
            # Create a canonical representation of the edge (sort node IDs)
            edge_key = tuple(sorted([source, target]))
            
            # Skip if we've already seen this edge
            if edge_key in seen_edges:
                continue
                
            seen_edges.add(edge_key)
            processed_edges["source"].append(source)
            processed_edges["target"].append(target)
            processed_edges["similarity"].append(similarity)
            edge_count += 1
        
        logger.info(f"Processed edges: removed {self_loop_count} self-loops, deduplicated to {edge_count} unique edges")
        
        # Step 4: Identify connected nodes (non-islands)
        connected_nodes = set()
        for i in range(len(processed_edges["source"])):
            connected_nodes.add(processed_edges["source"][i])
            connected_nodes.add(processed_edges["target"][i])
        
        # Only keep nodes that have connections
        final_nodes = {
            "id": [],
            "summary": [],
            "text": []
        }
        
        island_count = 0
        for node_id, attributes in unique_nodes.items():
            if node_id in connected_nodes:
                final_nodes["id"].append(node_id)
                final_nodes["summary"].append(attributes["summary"])
                final_nodes["text"].append(attributes["text"])
            else:
                island_count += 1
        
        logger.info(f"Removed {island_count} island nodes with no connections")
        
        # Create final dataframes
        final_nodes_df = daft.from_pydict(final_nodes)
        final_edges_df = daft.from_pydict(processed_edges)
        
        preprocessing_time = time.time() - start_time
        logger.info(f"Comprehensive preprocessing complete in {preprocessing_time:.2f} seconds")
        logger.info(f"Final processed data: {final_nodes_df.count_rows()} nodes, {final_edges_df.count_rows()} edges")
        
        return (final_nodes_df, final_edges_df)
    
    except Exception as e:
        logger.error(f"Error in comprehensive preprocessing: {e}")
        return (nodes_df, edges_df)  # Return original on error

# Load and preprocess Wikipedia data if files exist
if wiki_nodes_exists and wiki_edges_exists:
    try:
        # Load raw data
        raw_wiki_nodes_df = daft.read_parquet(wiki_nodes_path).collect()
        raw_wiki_edges_df = daft.read_parquet(wiki_edges_path).collect()
        logger.info(f"Loaded raw Wikipedia data: {raw_wiki_nodes_df.count_rows()} nodes, {raw_wiki_edges_df.count_rows()} edges")
        
        filtered_wiki_edges_df = raw_wiki_edges_df.filter(daft.col("similarity") > 0.42)

        # Preprocess data with comprehensive function
        wiki_nodes_df, wiki_edges_df = preprocess_wiki_data(raw_wiki_nodes_df, filtered_wiki_edges_df)
        
        logger.info(f"Final Wikipedia data after comprehensive preprocessing: {wiki_nodes_df.count_rows()} nodes, {wiki_edges_df.count_rows()} edges")
    except Exception as e:
        logger.error(f"Error loading Wikipedia data: {e}")
        # Initialize with empty dataframes if loading fails
        wiki_nodes_df = None
        wiki_edges_df = None
else:
    logger.warning(f"Wikipedia files not found. Nodes exists: {wiki_nodes_exists}, Edges exists: {wiki_edges_exists}")
    wiki_nodes_df = None
    wiki_edges_df = None

class UserList(BaseModel):
    users: List[str]

@app.get("/")
def ping():
    logger.info("Ping endpoint called")
    return {"Hello": "World"}

# Twitter endpoints
@app.get("/twitter/users")
def users():
    logger.info("Twitter users endpoint called")
    return users_list

@app.get("/twitter/edges")
def edges():
    logger.info("Twitter edges endpoint called")
    return user_interactions_df.select("user1", "user2").to_pydict()

@app.post("/twitter/connections/")
def connections(selected_users: UserList):
    logger.info(f"Twitter connections endpoint called with users: {selected_users.users}")
    
    start_time = time.time()
    filter_dict = {"user1": [], "user2": []}
    for u1 in selected_users.users:
        for u2 in selected_users.users:
            filter_dict["user1"].append(u1)
            filter_dict["user2"].append(u2)

    filter_df = daft.from_pydict(filter_dict)
    filtered_interactions = user_interactions_df.join(filter_df, how="semi", on=["user1", "user2"]).to_pylist()
    logger.info(f"Found {len(filtered_interactions)} filtered interactions between users")

    tweets = { user: set() for user in selected_users.users }
    for interaction in filtered_interactions:
        user1 = interaction["user1"]
        user2 = interaction["user2"]
        user1_tweets = interaction["user1_tweets"]
        user2_tweets = interaction["user2_tweets"]

        if user1_tweets is not None:
            tweets[user1].update(user1_tweets)

        if user2_tweets is not None:
            tweets[user2].update(user2_tweets)

    tweets = { k: list(v) for k, v in tweets.items() }
    tweets_json = json.dumps(tweets, indent=2)
    logger.info(f"Extracted tweets for analysis with {sum(len(v) for v in tweets.values())} total tweets")
    
    # instructions = "The following are tweets between a set of users on Twitter, provided as a dictionary where the keys are a username and the values are a list of tweets that user sent.\nGiven these tweets, write a short, high level analysis about what you can derive on how they are connected. The analysis should be in a form similar to \"@user1 ... @user2 ... who ... @user3 ... which ... @user4\"."
    instructions = "The following are tweets between a set of users on Twitter, provided as a dictionary where the keys are a username and the values are a list of tweets that user sent.\nGiven these tweets, write a tweet-length analysis in about how they are connected. The analysis should be in a form similar to \"@user1 ... @user2 ... who ... @user3 ... which ... @user4\"."

    try:
        logger.info("Calling OpenAI API for Twitter analysis")
        response = client.responses.create(
            model="gpt-4o-mini",
            instructions=instructions,
            input=tweets_json
        )
        execution_time = time.time() - start_time
        logger.info(f"Twitter analysis completed in {execution_time:.2f} seconds")
        return response.output_text
    except Exception as e:
        logger.error(f"Error in OpenAI API call for Twitter analysis: {e}")
        return f"Error analyzing connections: {str(e)}"

# Wikipedia endpoints
@app.get("/wikipedia/nodes")
def wiki_nodes():
    logger.info("Wikipedia nodes endpoint called")
    if wiki_nodes_df is None:
        logger.warning("Wikipedia nodes data not available")
        return {"id": [], "summary": [], "text": []}
    
    # Convert to dictionary with selected columns
    try:
        result = wiki_nodes_df.select("id", "summary", "text").to_pydict()
        logger.info(f"Returning {len(result['id'])} Wikipedia nodes")
        return result
    except Exception as e:
        logger.error(f"Error processing Wikipedia nodes: {e}")
        return {"id": [], "summary": [], "text": []}

@app.get("/wikipedia/edges")
def wiki_edges():
    logger.info("Wikipedia edges endpoint called")
    if wiki_edges_df is None:
        logger.warning("Wikipedia edges data not available")
        return {"source": [], "target": [], "similarity": []}
    
    try:
        result = wiki_edges_df.select("source", "target", "similarity").to_pydict()
        logger.info(f"Returning {len(result['source'])} Wikipedia edges")
        return result
    except Exception as e:
        logger.error(f"Error processing Wikipedia edges: {e}")
        return {"source": [], "target": [], "similarity": []}

@app.post("/wikipedia/connections/")
def wiki_connections(selected_users: UserList):
    logger.info(f"Wikipedia connections endpoint called with topics: {selected_users.users}")
    
    if wiki_nodes_df is None or wiki_edges_df is None:
        logger.warning("Wikipedia data not available for connection analysis")
        return "Wikipedia data not available"
    
    start_time = time.time()
    
    # Get the selected topics
    selected_topics = selected_users.users
    
    # Extract text and summaries for the selected topics
    try:
        topics_data = {}
        for topic in selected_topics:
            # Filter the nodes dataframe to get info for this topic
            topic_row = wiki_nodes_df.where(wiki_nodes_df["id"] == topic).collect()
            
            if topic_row.count_rows() > 0:
                # Get the first row (should be only one)
                row = topic_row.to_pylist()[0]
                summary = row.get("summary", "")
                text = row.get("text", "")
                
                # Store the topic data
                topics_data[topic] = {
                    "summary": summary,
                    "text": text[:1000] if text else ""  # Limit text length
                }
        
        # Find connections between selected topics
        connections_data = []
        for i, topic1 in enumerate(selected_topics):
            for topic2 in selected_topics[i+1:]:
                # Find edges between these topics in either direction
                edges1 = wiki_edges_df.where(
                    (wiki_edges_df["source"] == topic1) & (wiki_edges_df["target"] == topic2)
                ).collect()
                
                edges2 = wiki_edges_df.where(
                    (wiki_edges_df["source"] == topic2) & (wiki_edges_df["target"] == topic1)
                ).collect()
                
                # Check if there's a direct connection
                if edges1.count_rows() > 0:
                    edge = edges1.to_pylist()[0]
                    similarity = edge.get("similarity", 0)
                    connections_data.append({
                        "from": topic1,
                        "to": topic2,
                        "similarity": similarity
                    })
                elif edges2.count_rows() > 0:
                    edge = edges2.to_pylist()[0]
                    similarity = edge.get("similarity", 0)
                    connections_data.append({
                        "from": topic2,
                        "to": topic1,
                        "similarity": similarity
                    })
        
        logger.info(f"Found data for {len(topics_data)} topics and {len(connections_data)} connections")
        
        # Prepare the data for analysis
        analysis_data = {
            "topics": topics_data,
            "connections": connections_data
        }
        
        # Convert to JSON
        json_data = json.dumps(topics_data, indent=2)
        
        # Create instructions for the OpenAI model
        # instructions = """
        # Analyze the relationships between these Wikipedia topics. Each topic has a summary and partial content.
        # The connections show how topics are related with similarity scores.
        
        # Write a paragraph that explains how these topics are connected, mentioning each topic and the strength of their relationships.
        # Focus on explaining what each topic is about and how they relate to each other in a meaningful way.
        # """
        instructions = """The following are a map of topics and their Wikipedia articles. Given the information in these articles, write a brief summary on the information in these articles related to how these topics are connected/related to each other."""
        
        # Call OpenAI API
        try:
            logger.info("Calling OpenAI API for Wikipedia analysis")
            response = client.responses.create(
                model="gpt-4o-mini",
                instructions=instructions,
                input=json_data
            )
            execution_time = time.time() - start_time
            logger.info(f"Wikipedia analysis completed in {execution_time:.2f} seconds")
            return response.output_text
        except Exception as e:
            logger.error(f"Error in OpenAI API call for Wikipedia analysis: {e}")
            return f"Error analyzing connections: {str(e)}"
            
    except Exception as e:
        logger.error(f"Error processing Wikipedia connections: {e}")
        return f"Error analyzing connections: {str(e)}"

