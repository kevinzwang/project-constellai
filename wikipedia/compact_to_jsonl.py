import os
import json
import logging
from tqdm import tqdm

# Set up logging
logging.basicConfig(level=logging.INFO, 
                    format='%(asctime)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

# Constants
INPUT_DIR = "../popular_wiki_articles"
OUTPUT_FILE = "wikipedia_articles.jsonl"

def compact_jsons_to_jsonl():
    """
    Read all JSON files from the input directory and write them as lines
    in a single JSONL file.
    """
    if not os.path.exists(INPUT_DIR):
        logger.error(f"Input directory {INPUT_DIR} does not exist!")
        return
    
    # Get list of all JSON files
    json_files = [f for f in os.listdir(INPUT_DIR) if f.endswith('.json')]
    logger.info(f"Found {len(json_files)} JSON files to process")
    
    article_count = 0
    
    with open(OUTPUT_FILE, 'w', encoding='utf-8') as out_file:
        for json_file in tqdm(json_files, desc="Converting files"):
            try:
                file_path = os.path.join(INPUT_DIR, json_file)
                
                # Read the JSON file
                with open(file_path, 'r', encoding='utf-8') as f:
                    article_data = json.load(f)
                
                # Write as a single line to the output file
                json.dump(article_data, out_file, ensure_ascii=False)
                out_file.write('\n')  # Add newline after each JSON object
                
                article_count += 1
                
            except Exception as e:
                logger.error(f"Error processing {json_file}: {e}")
    
    logger.info(f"Successfully converted {article_count} articles to {OUTPUT_FILE}")
    logger.info(f"Output file size: {os.path.getsize(OUTPUT_FILE) / (1024*1024):.2f} MB")

if __name__ == "__main__":
    logger.info("Starting JSON to JSONL conversion")
    compact_jsons_to_jsonl()
    logger.info("Conversion complete") 