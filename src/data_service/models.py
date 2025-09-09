from dataclasses import dataclass, field
from typing import Optional, Dict, Any, List

@dataclass
class BaseItem:
    """Represents a base item in Path of Exile."""
    id: str
    name: str
    item_class: str
    domain: str
    implicits: List[str]
    inventory_height: int
    inventory_width: int
    drop_level: int
    properties: Dict[str, Any] = field(default_factory=dict)
    release_state: str = "released"
    inherits_from: Optional[str] = None
    tags: List[str] = field(default_factory=list)
    visual_identity: Dict[str, Any] = field(default_factory=dict)
    requirements: Dict[str, Any] = field(default_factory=dict)
    grants_buff: Dict[str, Any] = field(default_factory=dict)
    skills_granted: List[str] = field(default_factory=list)

@dataclass
class Mod:
    """Represents an item modifier (affix)."""
    id: str
    name: str
    domain: str
    generation_type: str  # prefix, suffix
    groups: List[str]
    required_level: int
    stats: List[Dict[str, Any]] = field(default_factory=list)
    spawn_weights: List[Dict[str, Any]] = field(default_factory=list)
    is_essence_only: bool = False
    adds_tags: List[str] = field(default_factory=list)
    generation_weights: List[Dict[str, Any]] = field(default_factory=list)
    grants_effects: List[str] = field(default_factory=list)
    implicit_tags: List[str] = field(default_factory=list)
    text: Dict[str, Any] = field(default_factory=dict)
    type: Optional[str] = None
    gold_value: Optional[int] = None


@dataclass
class StatTranslation:
    """Represents a translation for a game stat."""
    ids: List[str]
    English: List[Dict[str, Any]]
    trade_stats: Optional[List[str]] = None
    hidden: Optional[bool] = None
    French: Optional[List[Dict[str, Any]]] = None
    German: Optional[List[Dict[str, Any]]] = None
    Japanese: Optional[List[Dict[str, Any]]] = None
    Korean: Optional[List[Dict[str, Any]]] = None
    Portuguese: Optional[List[Dict[str, Any]]] = None
    Russian: Optional[List[Dict[str, Any]]] = None
    Spanish: Optional[List[Dict[str, Any]]] = None
    Thai: Optional[List[Dict[str, Any]]] = None


    def get_translation(self) -> str:
        """Returns the primary English translation string."""
        if self.English:
            return self.English[0].get("string", "Untranslated Stat")
        return "Untranslated Stat"
