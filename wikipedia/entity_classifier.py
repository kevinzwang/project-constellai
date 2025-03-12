#!/usr/bin/env python3

import os
import random
import logging
import daft
from typing import List, Dict, Any
import json
from tqdm import tqdm

# Set up logging
logging.basicConfig(level=logging.INFO, 
                    format='%(asctime)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

# Constants
INPUT_FILE = "wikipedia_articles.jsonl"
OUTPUT_FILE = "entities.jsonl"
BATCH_SIZE = 100  # Process data in batches

# Simple UDF that randomly decides if a topic is an entity or not
@daft.udf(return_dtype=daft.DataType.bool())
def is_entity_random(title: daft.Series) -> List[bool]:
    """
    This UDF determines if a topic is an entity randomly.
    
    For now, it just randomly returns True or False for each title.
    """
    # Get the titles as a Python list
    titles = title.to_pylist()
    
    # Randomly classify each title as an entity or not
    results = [random.choice([True, False]) for _ in titles]
    
    return results

# This would call OpenAI in a real implementation
def call_openai_api(batch: List[Dict[str, Any]]) -> List[bool]:
    """
    Mock function that would call OpenAI API to determine if topics are entities.
    
    Args:
        batch: List of dictionaries containing article data
        
    Returns:
        List of boolean values indicating if each item is an entity
    """
    # In a real implementation, this would:
    # 1. Prepare prompts for each item in the batch
    # 2. Make API call to OpenAI
    # 3. Parse the responses
    
    # For demonstration, this returns random True/False values
    return [random.choice([True, False]) for _ in batch]

# UDF that would integrate with OpenAI
@daft.udf(return_dtype=daft.DataType.bool())
def is_entity_openai(title: daft.Series, summary: daft.Series) -> List[bool]:
    """
    UDF that would call OpenAI API to classify if a topic is an entity.
    
    This takes both title and summary to make a more informed decision.
    """
    titles = title.to_pylist()
    summaries = summary.to_pylist()
    
    # Create a batch of documents to process
    batch = [
        {"title": title, "summary": summary}
        for title, summary in zip(titles, summaries)
    ]
    
    # Call the OpenAI API (mocked)
    # In a real implementation, this would authenticate and call the API
    results = call_openai_api(batch)
    
    return results

def process_articles_in_batches():
    """
    Process articles in batches to avoid memory issues with large datasets.
    Classify each as an entity or not, and filter accordingly.
    """
    if not os.path.exists(INPUT_FILE):
        logger.error(f"Input file {INPUT_FILE} does not exist!")
        return
    
    logger.info(f"Reading articles from {INPUT_FILE}")
    
    # Read the JSONL file into a Daft DataFrame
    df = daft.read_json(INPUT_FILE)
    
    # Display the schema of the DataFrame
    logger.info("DataFrame schema:")
    logger.info(df.schema)
    
    # Sample data to verify we have the expected columns
    logger.info("Sample data (first 2 rows):")
    df.show(2)
    
    # Add a new column 'is_entity' by applying the UDF
    # In a real application, use is_entity_openai which considers both title and summary
    if "summary" in df.schema.names:
        logger.info("Using title and summary for entity classification")
        df = df.with_column("is_entity", is_entity_openai(df["title"], df["summary"]))
    else:
        logger.info("Using only title for entity classification")
        df = df.with_column("is_entity", is_entity_random(df["title"]))
    
    # Count total number of articles
    total_count = df.count_rows()
    logger.info(f"Total number of articles: {total_count}")
    
    # Filter the DataFrame to only include entities
    entities_df = df.filter(df["is_entity"] == True)
    
    # Count entities
    entity_count = entities_df.count_rows()
    logger.info(f"Number of entities found: {entity_count} ({entity_count/total_count:.2%})")
    
    # Show a few example entities
    logger.info("Sample entities (first 5):")
    entities_df.show(5)
    
    # Write the entities to a new JSONL file
    logger.info(f"Writing entities to {OUTPUT_FILE}")
    entities_df.write_json(OUTPUT_FILE)
    
    # Additional analysis of entity types/categories
    if "categories" in df.schema.names:
        logger.info("Analyzing categories of entities...")
        # This would analyze the categories to identify types of entities
        # (Implementation would depend on specific needs)
    
    logger.info("Entity classification complete")

if __name__ == "__main__":
    logger.info("Starting entity classification with Daft")
    process_articles_in_batches() 