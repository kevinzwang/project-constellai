#!/usr/bin/env python3

import os
import json
import random
import logging
from openai import OpenAI
from dotenv import load_dotenv

# Load environment variables from .env file
load_dotenv()

# Set up logging
logging.basicConfig(level=logging.INFO,
                    format='%(asctime)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

# Constants
OUTPUT_DIR = "../popular_wiki_articles"
RESULTS_FILE = "topic_classification_results.json"
NUM_SAMPLES = 50

def get_random_titles():
    """
    Get a random sample of titles from the JSON files in the output directory.
    
    Returns:
        list: List of selected titles
    """
    logger.info(f"Selecting {NUM_SAMPLES} random titles from {OUTPUT_DIR}")
    
    # Check if output directory exists
    if not os.path.exists(OUTPUT_DIR):
        logger.error(f"Directory {OUTPUT_DIR} does not exist")
        return []
    
    # Get all JSON files
    json_files = [f for f in os.listdir(OUTPUT_DIR) if f.endswith('.json')]
    
    if len(json_files) == 0:
        logger.error(f"No JSON files found in {OUTPUT_DIR}")
        return []
    
    # If there are fewer files than requested samples, adjust sample size
    sample_size = min(NUM_SAMPLES, len(json_files))
    
    # Randomly select files
    selected_files = random.sample(json_files, sample_size)
    logger.info(f"Selected {len(selected_files)} random files")
    
    # Extract titles from selected files
    titles = []
    for filename in selected_files:
        file_path = os.path.join(OUTPUT_DIR, filename)
        try:
            with open(file_path, 'r', encoding='utf-8') as f:
                article_data = json.load(f)
                if 'title' in article_data:
                    titles.append(article_data['title'])
                else:
                    logger.warning(f"No title found in {filename}")
        except Exception as e:
            logger.error(f"Error reading {filename}: {e}")
    
    logger.info(f"Retrieved {len(titles)} titles")
    return titles

def classify_titles_batch(client, titles):
    """
    Use OpenAI API to classify all titles in a single batch request.
    
    Args:
        client: OpenAI client
        titles: List of titles to classify
        
    Returns:
        list: List of classification results
    """
    try:
        # Create the input text with all titles
        titles_text = ", ".join(titles)
        
        logger.info("Sending batch classification request to OpenAI API")
        
        # Create response stream
        response_stream = client.responses.create(
            model="gpt-4o-mini",
            input=[
                {
                    "role": "system",
                    "content": [
                        {
                            "type": "input_text",
                            "text": "You are given a list of topic titles. For each topic, determine whether it refers to a person or an organization. If it does, set \"is_entity\" to true; otherwise, set \"is_entity\" to false. Return your answer as a valid JSON array, where each element has the format:\n\n{\n\"title\": \"<TOPIC_TITLE>\",\n\"is_entity\": <true_or_false>\n}\n\nDo not return any additional keys, text, or commentary. Here are some examples:\n\nInput:\n\nHarvey Milk, 1999 Israeli general election, Book of Genesis, Janis Joplin, Orthotropic deck, Music & Media\n\nExpected output: ```json\n[ { \"title\": \"Harvey Milk\", \"is_entity\": true }, { \"title\": \"1999 Israeli general election\", \"is_entity\": false }, { \"title\": \"Book of Genesis\", \"is_entity\": false }, { \"title\": \"Janis Joplin\", \"is_entity\": true }, { \"title\": \"Orthotropic deck\", \"is_entity\": false }, { \"title\": \"Music & Media\", \"is_entity\": false } ]\n```"
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
        results = json.loads(json_text)
        
        logger.info(f"Successfully classified {len(results)} titles")
        return results
        
    except Exception as e:
        logger.error(f"Error in batch classification: {e}")
        return []

def main():
    """Main function to classify titles."""
    logger.info("Starting title classification")
    
    # Initialize OpenAI client
    client = OpenAI()
    
    # Get random titles
    titles = get_random_titles()
    
    if not titles:
        logger.error("No titles to classify")
        return
    
    # Classify all titles in a single batch
    results = classify_titles_batch(client, titles)
    
    if not results:
        logger.error("Classification failed")
        return
    
    # Count entities vs. non-entities
    entity_count = sum(1 for r in results if r["is_entity"])
    non_entity_count = len(results) - entity_count
    
    # Log individual results
    for result in results:
        classification = "Person/Organization" if result["is_entity"] else "Other topic"
        logger.info(f"'{result['title']}' classified as: {classification}")
    
    # Save results to file
    with open(RESULTS_FILE, 'w', encoding='utf-8') as f:
        json.dump(results, f, indent=2, ensure_ascii=False)
    
    # Summarize results
    logger.info(f"Classification complete:")
    logger.info(f"  - Total titles classified: {len(results)}")
    logger.info(f"  - Person/Organization: {entity_count} ({entity_count/len(results)*100:.1f}%)")
    logger.info(f"  - Other topics: {non_entity_count} ({non_entity_count/len(results)*100:.1f}%)")
    logger.info(f"Results saved to {RESULTS_FILE}")

if __name__ == "__main__":
    main() 