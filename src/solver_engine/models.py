from dataclasses import dataclass, field
from typing import List, Dict, Any

@dataclass
class TargetAffix:
    """Represents a single desired affix for the crafting target."""
    # This could be the text of the stat, e.g., "+# to maximum Life"
    # The engine will be responsible for translating this to IDs.
    stat_text: str
    min_value: int
    # We can add tier, etc. later if needed

@dataclass
class CraftingTarget:
    """Defines the user's desired item to be crafted."""
    base_item_name: str
    min_ilvl: int = 1
    target_affixes: List[TargetAffix] = field(default_factory=list)
    required_open_prefixes: int = 0
    required_open_suffixes: int = 0

@dataclass
class CraftingResult:
    """Represents a single evaluated crafting option."""
    candidate_item: Dict[str, Any] # The raw item data from the API
    purchase_price_chaos: float
    estimated_crafting_cost_chaos: float
    total_cost_chaos: float
    suggested_steps: List[str] = field(default_factory=list)

    def __lt__(self, other):
        # This allows sorting results by total cost
        return self.total_cost_chaos < other.total_cost_chaos
