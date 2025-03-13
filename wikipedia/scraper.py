#!/usr/bin/env python3

import os
import sys
import logging
import requests
import re
import json
from bs4 import BeautifulSoup
from tqdm import tqdm
import wikipediaapi
import time

# Set up logging
logging.basicConfig(level=logging.INFO, 
                    format='%(asctime)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

# Constants
POPULAR_PAGES_URL = "https://en.wikipedia.org/wiki/Wikipedia:Popular_pages"
OUTPUT_DIR = "../popular_wiki_articles"
RATE_LIMIT_DELAY = 1  # seconds between API requests to avoid rate limiting

def get_popular_page_titles():
    """Extract the list of popular page titles from the Wikipedia:Popular_pages article."""
    logger.info(f"Fetching list of popular pages from {POPULAR_PAGES_URL}")
    
    try:
        response = requests.get(POPULAR_PAGES_URL)
        response.raise_for_status()
        
        # Parse the HTML content
        soup = BeautifulSoup(response.text, 'html.parser')
        
        # The popular pages are in a table with class 'wikitable'
        popular_pages = []
        tables = soup.find_all('table', class_='wikitable')
        
        for table in tables:
            # Skip header row
            rows = table.find_all('tr')[1:]
            for row in rows:
                cells = row.find_all('td')
                if len(cells) >= 2:  # Ensure there are enough cells
                    # The second cell contains the article link
                    link = cells[1].find('a')
                    if link and 'title' in link.attrs:
                        title = link['title']
                        popular_pages.append(title)
        
        logger.info(f"Found {len(popular_pages)} popular pages")
        return popular_pages
    
    except requests.RequestException as e:
        logger.error(f"Failed to fetch popular pages: {e}")
        sys.exit(1)

def download_wikipedia_articles(page_titles):
    """Download Wikipedia articles for the given page titles using the Wikipedia API."""
    if not os.path.exists(OUTPUT_DIR):
        os.makedirs(OUTPUT_DIR)
    
    logger.info(f"Downloading {len(page_titles)} popular Wikipedia articles...")
    
    # Initialize Wikipedia API
    wiki_wiki = wikipediaapi.Wikipedia(
        user_agent='PopularWikipediaDownloader/1.0 (your-email@example.com)',
        language='en'
    )
    
    # Download each article with a progress bar
    successful_downloads = 0
    skipped_downloads = 0
    failed_downloads = []
    
    for title in tqdm(page_titles, desc="Downloading articles"):
        try:
            # Create a safe filename from the title
            safe_title = re.sub(r'[^\w\s-]', '', title).replace(' ', '_')
            file_path = os.path.join(OUTPUT_DIR, f"{safe_title}.json")
            
            # Skip if file already exists
            if os.path.exists(file_path):
                logger.debug(f"Skipping '{title}' - file already exists")
                skipped_downloads += 1
                continue
            
            # Get the page
            page = wiki_wiki.page(title)
            
            if page.exists():
                # Create a dictionary with article data
                article_data = {
                    'title': page.title,
                    'summary': page.summary,
                    'text': page.text,
                    'url': page.fullurl,
                    'categories': list(page.categories.keys()),
                    'links': list(page.links.keys())
                }
                
                # Save to JSON file
                with open(file_path, 'w', encoding='utf-8') as f:
                    json.dump(article_data, f, indent=2, ensure_ascii=False)
                
                successful_downloads += 1
            else:
                logger.warning(f"Page '{title}' does not exist")
                failed_downloads.append(title)
            
            # Pause to avoid hitting rate limits
            time.sleep(RATE_LIMIT_DELAY)
            
        except Exception as e:
            logger.error(f"Failed to download article '{title}': {e}")
            failed_downloads.append(title)
    
    logger.info(f"Successfully downloaded {successful_downloads} articles")
    if skipped_downloads > 0:
        logger.info(f"Skipped {skipped_downloads} articles (already downloaded)")
    if failed_downloads:
        logger.warning(f"Failed to download {len(failed_downloads)} articles: {failed_downloads}")

def extract_and_download_linked_articles(popular_page_titles):
    """
    Extract links only from the original popular articles (1st degree),
    and download those linked articles if they don't already exist.
    
    Args:
        popular_page_titles: List of the original popular page titles
    """
    logger.info("Extracting links from popular articles (1st degree only)...")
    
    # Check if output directory exists
    if not os.path.exists(OUTPUT_DIR):
        logger.error(f"Output directory {OUTPUT_DIR} does not exist")
        return
    
    # Convert popular page titles to their corresponding filenames
    popular_page_filenames = []
    for title in popular_page_titles:
        safe_title = re.sub(r'[^\w\s-]', '', title).replace(' ', '_')
        popular_page_filenames.append(f"{safe_title}.json")
    
    logger.info(f"Processing {len(popular_page_filenames)} original popular pages")
    
    # Extract links only from the original popular articles
    all_links = set()
    for filename in tqdm(popular_page_filenames, desc="Extracting links from popular pages"):
        file_path = os.path.join(OUTPUT_DIR, filename)
        try:
            if os.path.exists(file_path):
                with open(file_path, 'r', encoding='utf-8') as f:
                    article_data = json.load(f)
                    if 'links' in article_data:
                        # Add all links to the set (automatically handles duplicates)
                        all_links.update(article_data['links'])
            else:
                logger.warning(f"Popular page file not found: {filename}")
        except Exception as e:
            logger.error(f"Error extracting links from {filename}: {e}")
    
    # Filter out special pages and non-article pages
    filtered_links = [
        link for link in all_links 
        if not link.startswith('Special:') and
        not link.startswith('Template:') and
        not link.startswith('Wikipedia:') and
        not link.startswith('File:') and
        not link.startswith('Help:') and
        not link.startswith('Category:') and
        not link.startswith('Portal:') and
        not link.startswith('Talk:') and
        not link.startswith('Module:')
    ]
    
    logger.info(f"Found {len(filtered_links)} unique 1st-degree links to download")
    
    # Download the linked articles
    download_wikipedia_articles(filtered_links)

def main():
    """Main function to orchestrate the Wikipedia popular pages download."""
    logger.info("Starting Wikipedia popular pages download")
    
    # Get list of popular page titles
    popular_pages = get_popular_page_titles()
    
    # Download the Wikipedia articles
    download_wikipedia_articles(popular_pages)
    
    # After completing the initial download, extract links and download those articles
    logger.info("Initial download complete. Now extracting links and downloading linked articles (1st degree only)...")
    extract_and_download_linked_articles(popular_pages)
    
    logger.info("Wikipedia popular pages download complete")

if __name__ == "__main__":
    main()
