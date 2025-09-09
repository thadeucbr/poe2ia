from typing import List, Optional

from src.data_service.service import CraftingDataService
from src.api_client.client import TradeAPIClient
from .models import CraftingTarget, CraftingResult, TargetAffix

# --- Constants for Crafting Costs ---
# TODO: These should be fetched from a market API like poe.ninja in a real app
CURRENCY_PRICES_IN_CHAOS = {
    "Exalted Orb": 400.0, # Example price
    "Divine Orb": 200.0,
    "Annulment Orb": 20.0,
    "Regal Orb": 1.0,
}

class CraftingSolverEngine:
    """
    The core logic engine that finds the most cost-effective way to craft an item.
    """
    def __init__(self, data_service: CraftingDataService, api_client: TradeAPIClient):
        self._data_service = data_service
        self._api_client = api_client

    def _estimate_crafting_cost(self, item_data: dict, target: CraftingTarget) -> Optional[CraftingResult]:
        """
        Estimates the cost to craft the target item from a given candidate base.
        This is a simplified placeholder implementation.
        """
        item = item_data.get('item', {})

        # The API gives us 'typeLine' which can be unique. We need the base item type.
        # We'll need a way to map from typeLine to a base_items.json entry.
        # This is a hard problem. For now, let's assume baseType is reliable.
        base_item_info = self._data_service.get_base_item_by_name(item.get('baseType'))
        if not base_item_info:
            # Try another common key if the first fails
            base_item_info = self._data_service.get_base_item_by_name(item.get('typeLine'))
            if not base_item_info:
                 print(f"Warning: Could not find base item info for '{item.get('baseType')}' or '{item.get('typeLine')}'")
                 return None # Cannot evaluate if we don't know the base

        # 1. Check which target mods are already on the item
        current_mods_text = item.get('explicitMods', [])
        missing_affixes = []

        for target_affix in target.target_affixes:
            is_present = False
            # This is a very simple text check, a real one needs to parse values
            for mod_text in current_mods_text:
                if target_affix.stat_text.lower() in mod_text.lower():
                    is_present = True
                    break
            if not is_present:
                missing_affixes.append(target_affix)

        # 2. For each missing mod, calculate a cost to add it.
        estimated_crafting_cost = 0.0
        steps = []

        if missing_affixes:
            mod_pool = self._data_service.get_mods_for_item_class(base_item_info.item_class)
            total_possible_mods = len(mod_pool) if mod_pool else 100

            num_missing = len(missing_affixes)
            if total_possible_mods > 0:
                # Simplified probability
                probability_of_success = num_missing / total_possible_mods
                if probability_of_success > 0:
                    cost_per_slam = CURRENCY_PRICES_IN_CHAOS["Exalted Orb"]
                    # Simplified expected cost
                    estimated_crafting_cost = (cost_per_slam / probability_of_success)
                    steps.append(f"Slam with Exalted Orbs (estimated cost: {estimated_crafting_cost:.2f}c)")

        # 3. Final calculation
        price = item_data.get("listingDetails", {}).get("price", {})
        price_in_chaos = price.get("amount", 0)

        result = CraftingResult(
            candidate_item=item_data,
            purchase_price_chaos=float(price_in_chaos),
            estimated_crafting_cost_chaos=estimated_crafting_cost,
            total_cost_chaos=float(price_in_chaos) + estimated_crafting_cost,
            suggested_steps=steps
        )
        return result

    def _formulate_queries(self, target: CraftingTarget) -> List[dict]:
        """
        Translates a CraftingTarget into a list of specific API query payloads.
        """
        queries = []
        base_query = {
            "status": {"option": "online"},
            "type": target.base_item_name,
            "filters": {"misc_filters": {"filters": {"ilvl": {"min": target.min_ilvl}}}},
            "stats": [{"type": "and", "filters": []}]
        }
        queries.append({"query": base_query, "sort": {"price": "asc"}})
        return queries

    def solve(self, target: CraftingTarget) -> List[CraftingResult]:
        """
        The main method to solve a crafting problem.
        """
        print(f"--- Starting craft solve for: {target.base_item_name} ---")
        queries = self._formulate_queries(target)
        print(f"Generated {len(queries)} search queries.")

        all_item_hashes = set()
        for query in queries:
            search_results = self._api_client.search_for_items(query)
            if search_results and search_results.get('result'):
                all_item_hashes.update(search_results['result'])

        if not all_item_hashes:
            print("No candidate items found across all queries.")
            return []

        item_details_response = self._api_client.fetch_item_details(list(all_item_hashes))
        if not item_details_response:
            print("Failed to fetch item details.")
            return []

        candidate_items = item_details_response.get('result', [])
        print(f"Found {len(candidate_items)} unique candidates to evaluate.")

        all_results: List[CraftingResult] = []
        for item_data in candidate_items:
            result = self._estimate_crafting_cost(item_data, target)
            if result:
                all_results.append(result)

        all_results.sort()
        print(f"--- Craft solve finished. Returning {len(all_results)} results. ---")
        return all_results

# Example Usage
if __name__ == '__main__':
    from pathlib import Path

    data_service = CraftingDataService(Path('repoe-fork/data'))
    api_client = TradeAPIClient(league="MockLeague", mock=True)
    engine = CraftingSolverEngine(data_service, api_client)

    my_target = CraftingTarget(
        base_item_name="Golden Wreath",
        min_ilvl=86,
        target_affixes=[TargetAffix(stat_text="to maximum life", min_value=90)],
        required_open_prefixes=1
    )

    best_options = engine.solve(my_target)

    if best_options:
        print("\n--- Top Crafting Options ---")
        for i, option in enumerate(best_options[:5]):
            item = option.candidate_item.get('item', {})
            name = item.get('name', '')
            base_type = item.get('baseType', 'Unknown')
            type_line = f"{name} {base_type}".strip()

            print(f"#{i+1}: {type_line} (ilvl {item.get('ilvl')})")
            print(f"  Buyout: {option.purchase_price_chaos}c")
            print(f"  Est. Craft Cost: {option.estimated_crafting_cost_chaos:.2f}c")
            print(f"  Total Cost: {option.total_cost_chaos:.2f}c")
            print(f"  Mods: {item.get('explicitMods', [])}")
            print(f"  Steps: {option.suggested_steps}")
    else:
        print("\nCould not find any crafting options.")
