import httpx
import time
import logging
from typing import List, Dict, Any, Optional

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Constants
BASE_URL = "https://www.pathofexile.com/api/trade"
# Use a common browser User-Agent
USER_AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36"

class TradeAPIClient:
    """
    A client for interacting with the Path of Exile trade API.
    Can operate in mock mode for development without a live API connection.
    """
    def __init__(self, league: str, poesessid: Optional[str] = None, mock: bool = False):
        self.league = league
        self.mock = mock
        self.headers = {
            "User-Agent": USER_AGENT,
            "Referer": "https://www.pathofexile.com/trade",
            "Accept": "application/json, text/plain, */*",
            "Accept-Language": "en-US,en;q=0.9",
            "Accept-Encoding": "gzip, deflate, br"
        }
        if poesessid:
            self.headers["Cookie"] = f"POESESSID={poesessid}"

        if not self.mock:
            self.client = httpx.Client(headers=self.headers, base_url=BASE_URL)

    def get_leagues(self) -> Optional[List[Dict[str, Any]]]:
        """Fetches a list of all available leagues."""
        if self.mock:
            logger.info("MOCK MODE: Returning mock leagues.")
            return [
                {"id": "Standard", "realm": "PC", "text": "Standard"},
                {"id": "Hardcore", "realm": "PC", "text": "Hardcore"},
                {"id": "MockLeague", "realm": "PC", "text": "MockLeague (Test)"}
            ]

        try:
            response = self.client.get("/data/leagues", timeout=10)
            response.raise_for_status()
            return response.json().get('result', [])
        except httpx.RequestError as e:
            logger.error(f"An error occurred while fetching leagues: {e}")
            return None

    def search_for_items(self, query: Dict[str, Any]) -> Optional[Dict[str, Any]]:
        """
        Performs the first step of a search query.
        POSTs a query to the /search endpoint and returns the initial result,
        which includes the query ID and a list of item hashes.
        """
        if self.mock:
            logger.info(f"MOCK MODE: Simulating search for query: {query}")
            return {
                "id": "mock_query_12345",
                "result": ["mock_hash_1", "mock_hash_2", "mock_hash_3"],
                "total": 3
            }

        search_url = f"/search/{self.league}"
        max_retries = 5
        backoff_factor = 2

        for attempt in range(max_retries):
            try:
                response = self.client.post(search_url, json=query, timeout=30)

                if response.status_code == 429: # Too Many Requests
                    retry_after = int(response.headers.get("Retry-After", backoff_factor ** attempt))
                    logger.warning(f"Rate limited. Retrying after {retry_after} seconds...")
                    time.sleep(retry_after)
                    continue

                response.raise_for_status() # Raise an exception for bad status codes (4xx or 5xx)
                return response.json()

            except httpx.RequestError as e:
                logger.error(f"An error occurred while requesting {e.request.url!r}: {e}")
                break # Stop retrying on client-side errors

        return None

    def fetch_item_details(self, item_hashes: List[str]) -> Optional[Dict[str, Any]]:
        """
        Performs the second step of a search query.
        Fetches the full details for a list of item hashes.
        """
        if self.mock:
            logger.info(f"MOCK MODE: Fetching details for hashes: {item_hashes}")
            return {
                "result": [
                    {
                        "id": "mock_hash_1",
                        "listingDetails": {"price": {"type": "~price", "amount": 1, "currency": "chaos"}},
                        "item": {"baseType": "Golden Wreath", "name": "", "ilvl": 86, "id": "item_1", "identified": True, "w": 2, "h": 2, "explicitMods": [], "implicitMods": ["+20 to Dexterity"]}
                    },
                    {
                        "id": "mock_hash_2",
                        "listingDetails": {"price": {"type": "~price", "amount": 5, "currency": "chaos"}},
                        "item": {"baseType": "Golden Wreath", "name": "Eagle Crest", "ilvl": 86, "id": "item_2", "identified": True, "w": 2, "h": 2, "explicitMods": ["+95 to maximum Life"], "implicitMods": ["+22 to Dexterity"]}
                    }
                ]
            }

        if not item_hashes:
            return {"result": []}

        hashes_str = ",".join(item_hashes)
        fetch_url = f"/fetch/{hashes_str}"

        try:
            response = self.client.get(fetch_url, timeout=30)
            response.raise_for_status()
            return response.json()
        except httpx.RequestError as e:
            logger.error(f"An error occurred while requesting {e.request.url!r}: {e}")
            return None

def get_example_query() -> Dict[str, Any]:
    """
    Returns an example query payload as described in the readme.
    This query searches for a high-level Vaal Regalia with specific mods.
    """
    return {
        "query": {
            "status": {"option": "online"},
            "filters": {
                "type_filters": {
                    "filters": {
                        "category": {"option": "armour.chest"}
                    }
                },
                "misc_filters": {
                    "filters": {
                        "ilvl": {"min": 86}
                    }
                }
            },
            "stats": [
                {
                    "type": "and",
                    "filters": [
                        # Example: Search for flat energy shield (dummy ID)
                        # In a real scenario, this ID would come from the CraftingDataService
                        {"id": "explicit.stat_123456789", "value": {"min": 100}},
                        # Example: Exclude mana (dummy ID)
                        {"id": "explicit.stat_987654321", "disabled": True}
                    ]
                }
            ]
        },
        "sort": {"price": "asc"}
    }

# Example usage (for testing purposes)
if __name__ == '__main__':
    # Running in MOCK mode
    logger.info("--- Running TradeAPIClient in Mock Mode ---")

    try:
        # Instantiate the client in mock mode
        client = TradeAPIClient(league="MockLeague", mock=True)

        # Test get_leagues
        leagues_data = client.get_leagues()
        if leagues_data:
            logger.info(f"Mock leagues found: {[l['id'] for l in leagues_data]}")
        else:
            logger.error("Failed to get mock leagues.")

        # Test search and fetch
        example_query = get_example_query()

        logger.info("Performing mock search...")
        search_result = client.search_for_items(example_query)

        if search_result and search_result.get('result'):
            logger.info(f"Mock search successful. Query ID: {search_result.get('id')}")
            item_hashes_to_fetch = search_result['result']
            logger.info(f"Fetching mock details for {len(item_hashes_to_fetch)} items...")

            item_details = client.fetch_item_details(item_hashes_to_fetch)
            if item_details:
                logger.info("Successfully fetched mock item details.")
                for item_data in item_details.get('result', []):
                    item = item_data.get('item', {})
                    # Note: In Python 3, 'typeLine' might be a more reliable key than 'name' + 'baseType'
                    name = item.get('name')
                    base_type = item.get('baseType')
                    type_line = item.get('typeLine', f"{name} {base_type}".strip())
                    print(f"- {type_line}")
            else:
                logger.error("Failed to fetch mock item details.")
        else:
            logger.info("Mock search returned no results or failed.")

    except Exception as e:
        logger.error(f"An error occurred during the mock client test: {e}")
