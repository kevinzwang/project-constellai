# %%
import daft
from daft import col
import json
import time
from openai import OpenAI
from dotenv import load_dotenv
from typing import List

# Load environment variables
load_dotenv()

# Initialize OpenAI client
client = OpenAI()

# %%
df = daft.read_json("wikipedia_articles.jsonl")

# %%
# add a new column to the dataframe that is randomly true or false

@daft.udf(batch_size=100, return_dtype=daft.DataType.bool())
def is_entity(title: daft.Series) -> List[bool]:
    """
    Determine if each title represents a person or organization entity.
    Uses OpenAI API with batched requests and retries for missing responses.
    
    Args:
        title: Series of article titles (guaranteed to be 100 or fewer)
        
    Returns:
        List of boolean values indicating if each title is an entity
    """
    # Load environment variables
    load_dotenv()
    
    # Initialize OpenAI client
    client = OpenAI()
    
    # Convert series to Python lists
    titles_list = title.to_pylist()
    
    # Track results
    results_dict = {}  # Map of title to is_entity result
    
    # Function to classify a batch of titles
    def classify_batch(batch_titles):
        try:
            # Create the input text with all titles
            titles_text = ", ".join(batch_titles)
            
            # Create response stream
            response_stream = client.responses.create(
                model="gpt-4o-mini",
                input=[
                    {
                        "role": "system",
                        "content": [
                            {
                                "type": "input_text",
                                "text": "You are given a list of topic titles. For each topic, determine whether it refers to a person or an organization. If it does, set \"is_entity\" to true; otherwise, set \"is_entity\" to false. Return your answer as a valid JSON array, where each element has the format:\n\n{\n\"title\": \"<TOPIC_TITLE>\",\n\"is_entity\": <true_or_false>\n}\n\nDo not return any additional keys, text, or commentary. Include ALL the titles I provide in your response."
                            }
                        ]
                    },
                    {
                        "role": "user",
                        "content": [
                            {
                                "type": "input_text",
                                "text": titles_text
                            }
                        ]
                    }
                ],
                text={
                    "format": {
                        "type": "text"
                    }
                },
                reasoning={},
                tools=[],
                temperature=0,
                max_output_tokens=10000,
                top_p=0,
                stream=True,
                store=True
            )
            
            # Collect the response
            response_text = ""
            for chunk in response_stream:
                if hasattr(chunk, 'text') and chunk.text:
                    response_text += chunk.text
            
            # Extract JSON from the response (remove markdown code blocks if present)
            if "```json" in response_text:
                json_text = response_text.split("```json")[1].split("```")[0].strip()
            elif "```" in response_text:
                json_text = response_text.split("```")[1].split("```")[0].strip()
            else:
                json_text = response_text.strip()
            
            # Parse JSON
            batch_results = json.loads(json_text)
            
            # Convert to dictionary for easier lookup
            return {item["title"]: item["is_entity"] for item in batch_results}
            
        except Exception as e:
            print(f"Error in batch classification: {e}")
            # Return empty dict on error to trigger retry
            return {}
    
    # Since we know it's 100 or fewer titles, we can process all at once
    remaining_titles = titles_list.copy()
    
    # Maximum retry attempts
    max_retries = 3
    
    # Keep querying until we have results for all titles or exceed max retries
    retry_count = 0
    while remaining_titles and retry_count < max_retries:
        # Classify all remaining titles
        batch_results = classify_batch(remaining_titles)
        
        # Update results dictionary with successful classifications
        results_dict.update(batch_results)
        
        # Determine which titles still need classification
        processed_titles = set(batch_results.keys())
        remaining_titles = [t for t in remaining_titles if t not in processed_titles]
        
        # If we still have unprocessed titles, increment retry counter
        if remaining_titles:
            retry_count += 1
            # Wait briefly before retrying to avoid rate limits
            time.sleep(1)
    
    # For any remaining unclassified titles after max retries, default to False
    for title_text in remaining_titles:
        results_dict[title_text] = False
    
    # Return results in the original order
    return [results_dict.get(t, False) for t in titles_list]

is_entity_4_concurrency = is_entity.with_concurrency(4)
df = df.with_column("is_entity", is_entity_4_concurrency(df["title"]))

# %%
df.show(100)

# %%
# print title and is_entity to json

df_title_is_entity = df.select("title", "is_entity").collect()

with open("entity_classifier.json", "w") as f:
    json.dump(df_title_is_entity.to_pylist(), f)

# %%
# # filter the dataframe to only include rows where is_entity is true

# TODO
df = df.where(df["is_entity"])
df = df.collect()

# %%
# drop categories and is_entity column
df = df.exclude("categories", "is_entity")
df = df.collect()

# %%
df_with_text = df.select("title", "summary", "text", "url")
df = df.exclude("summary", "text", "url")

df = df.explode("links")
df = df.collect()

# %%
print(df.count_rows())
df = df.join(df, how="semi", left_on="links", right_on="title").collect()
print(df.count_rows())
df = df.groupby("title").agg(col("links").agg_list().alias("links"))
df = df.join(df_with_text, how="left", left_on="title", right_on="title")
df = df.collect()

# %%
# CELL 1: Generate embeddings for all article titles
@daft.udf(batch_size=100, return_dtype=daft.DataType.python())
def generate_title_embeddings(title: daft.Series) -> List[List[float]]:
    """
    Generate embeddings for article titles using OpenAI's embedding model.
    
    Args:
        title: Series of article titles
        
    Returns:
        List of embedding vectors
    """
    from openai import OpenAI
    from dotenv import load_dotenv
    import time
    
    # Load environment variables
    load_dotenv()
    client = OpenAI()
    
    titles = title.to_pylist()
    embeddings = []
    
    # Process in batches of 20 to avoid rate limits
    batch_size = 20
    for i in range(0, len(titles), batch_size):
        batch = titles[i:i+batch_size]
        
        try:
            response = client.embeddings.create(
                input=batch,
                model="text-embedding-3-small"
            )
            
            # Extract embeddings from response
            for embedding_data in response.data:
                embeddings.append(embedding_data.embedding)
                
        except Exception as e:
            print(f"Error generating embeddings for batch {i}:{i+batch_size}: {e}")
            # Add empty embeddings for failed batch
            for _ in range(len(batch)):
                embeddings.append([])
        
        # Small pause to avoid rate limits
        if i + batch_size < len(titles):
            time.sleep(0.1)
    
    return embeddings

# Add title embeddings to the dataframe
print("Generating embeddings for all article titles...")
df_with_text = df_with_text.with_column("title_embedding", generate_title_embeddings(df_with_text["title"]))
print("Title embeddings generated.")
df_with_text = df_with_text.collect()

# %%
print("Creating article-link pairs...")
df_exploded = df.explode("links")
print(f"Generated {df_exploded.count_rows()} article-link pairs")
df_exploded = df_exploded.collect()

# %%
print("Adding source title embeddings...")
df_exploded = df_exploded.join(
    df_with_text.select("title", "title_embedding"),
    left_on="title",
    right_on="title",
    how="left"
)
df_exploded = df_exploded.collect()

# %%
# print("Adding target link embeddings...")
# df_exploded = df_exploded.join(
#     df_with_text.select("title", "title_embedding"),
#     left_on="links",
#     right_on="title",
#     how="left",
#     right_select=["title_embedding"]
# ).rename("title_embedding_right", "link_embedding")
# df_exploded.show(10)

df_exploded = df_exploded.join(
    df_with_text,
    left_on="links",
    right_on="title",
    how="left",
    suffix="_right"
).with_column_renamed("title_embedding_right", "link_embedding")
df_exploded = df_exploded.collect()

# %%
@daft.udf(batch_size=1000, return_dtype=daft.DataType.float64())
def calculate_cosine_similarity(source_embedding: daft.Series, target_embedding: daft.Series) -> List[float]:
    """
    Calculate cosine similarity between source and target embeddings.
    
    Args:
        source_embedding: Series of source embeddings
        target_embedding: Series of target embeddings
        
    Returns:
        List of similarity scores
    """
    from scipy.spatial.distance import cosine
    
    source_embeddings = source_embedding.to_pylist()
    target_embeddings = target_embedding.to_pylist()
    similarities = []
    
    for src_emb, tgt_emb in zip(source_embeddings, target_embeddings):
        # Handle empty embeddings
        if not src_emb or not tgt_emb:
            similarities.append(0.0)
            continue
            
        # Calculate cosine similarity
        # Convert distance to similarity (1 - distance)
        similarity = 1.0 - cosine(src_emb, tgt_emb)
        similarities.append(similarity)
    
    return similarities

print("Calculating cosine similarities...")
df_exploded = df_exploded.with_column(
    "similarity", 
    calculate_cosine_similarity(df_exploded["title_embedding"], df_exploded["link_embedding"])
)
df_exploded = df_exploded.collect()

# %%
print("Filtering valid pairs...")
df_exploded = df_exploded.where(df_exploded["similarity"] > 0)
print(f"Remaining pairs after filtering: {df_exploded.count_rows()}")
df_exploded = df_exploded.collect()

# %%
# print("Selecting top 10 neighbors for each article...")
# neighbors_df = df_exploded.groupby("title").agg(
#     df_exploded.sort("similarity", desc=True).limit(10)
# )
# print(f"Generated neighbors for {neighbors_df.count_rows()} articles")
# neighbors_df.show(5)

sorted_df = df_exploded.sort("similarity", desc=True)
# Group by 'title' and use a custom aggregation to get the top 10 neighbors
neighbors_df = sorted_df.groupby("title").agg(
    col("links").agg_list().alias("top_links")
).with_column("top_links", col("top_links").list.slice(0, 10))
# Materialize the DataFrame to count rows
neighbors_df.collect()
print(f"Generated neighbors for (neighbors_df.count_rows()) articles")
neighbors_df = neighbors_df.collect()

# %%
print("Preparing node data for parquet file...")

# Create a nodes dataframe with all the relevant attributes
nodes_df = df_with_text.select(
    col("title").alias("id"),         # Node ID
    "summary",       # Short description
    "text",          # Full content
)

print(f"Writing {nodes_df.count_rows()} nodes to parquet...")
nodes_df.write_parquet("wikipedia_nodes.parquet")
print("Node data saved to wikipedia_nodes.parquet")

# %%
print("Preparing edge data for parquet file...")

# We'll use the exploded dataframe with similarity scores as our edge list
edge_df = df_exploded.select(
    "title",                 # Source node
    "links",                 # Target node
    "similarity"             # Edge weight
)

# Rearrange columns and rename for clarity
edge_df = edge_df.select(
    col("title").alias("source"),
    col("links").alias("target"),
    "similarity"
)

print(f"Writing {edge_df.count_rows()} edges to parquet...")
edge_df.write_parquet("wikipedia_edges.parquet")
print("Edge data saved to wikipedia_edges.parquet")


