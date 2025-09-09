import argparse
from pathlib import Path

from src.data_service.service import CraftingDataService
from src.api_client.client import TradeAPIClient
from src.solver_engine.engine import CraftingSolverEngine
from src.solver_engine.models import CraftingTarget, TargetAffix

def main():
    """
    Main entrypoint for the Path of Exile Crafting Assistant CLI.
    """
    parser = argparse.ArgumentParser(description="Path of Exile Crafting Assistant")
    parser.add_argument("--item-name", required=True, help="The name of the base item to craft (e.g., 'Golden Wreath')")
    parser.add_argument("--ilvl", type=int, default=86, help="The minimum item level for the base.")
    parser.add_argument(
        "--mod",
        action="append",
        dest="mods",
        help="A desired mod in the format 'stat text:min_value' (e.g., 'to maximum life:90'). Can be specified multiple times."
    )
    parser.add_argument("--mock", action="store_true", help="Run in mock mode without hitting the live API.")

    args = parser.parse_args()

    # --- Setup Dependencies ---
    print("Initializing services...")
    data_service = CraftingDataService(Path('repoe-fork/data'))
    # Always use mock mode for now, as live mode is blocked
    api_client = TradeAPIClient(league="Standard", mock=True)
    engine = CraftingSolverEngine(data_service, api_client)

    # --- Construct Crafting Target ---
    target_affixes = []
    if args.mods:
        for mod_str in args.mods:
            try:
                text, value = mod_str.rsplit(':', 1)
                target_affixes.append(TargetAffix(stat_text=text, min_value=int(value)))
            except ValueError:
                print(f"Error: Invalid mod format '{mod_str}'. Please use 'stat text:min_value'.")
                return

    my_target = CraftingTarget(
        base_item_name=args.item_name,
        min_ilvl=args.ilvl,
        target_affixes=target_affixes
    )

    # --- Run Solver ---
    best_options = engine.solve(my_target)

    # --- Print Results ---
    if best_options:
        print("\n--- Top Crafting Options ---")
        for i, option in enumerate(best_options[:5]):
            item = option.candidate_item.get('item', {})
            name = item.get('name', '')
            base_type = item.get('baseType', 'Unknown')
            type_line = f"{name} {base_type}".strip()

            print(f"\n#{i+1}: {type_line} (ilvl {item.get('ilvl')})")
            print(f"  Buyout: {option.purchase_price_chaos:.2f}c")
            print(f"  Est. Craft Cost: {option.estimated_crafting_cost_chaos:.2f}c")
            print(f"  Total Cost: {option.total_cost_chaos:.2f}c")
            print(f"  Mods: {item.get('explicitMods', [])}")
            print(f"  Suggested Steps: {option.suggested_steps}")
    else:
        print("\nCould not find any crafting options.")


if __name__ == "__main__":
    main()
