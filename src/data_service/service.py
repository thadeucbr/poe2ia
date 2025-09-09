import json
import re
from pathlib import Path
from typing import Dict, List, Optional

from .models import BaseItem, Mod, StatTranslation

class CraftingDataService:
    """
    Provides access to the static game data loaded from the RePoE JSON files.
    """
    def __init__(self, repo_path: Path):
        self.repo_path = repo_path
        self._base_items: Dict[str, BaseItem] = {}
        self._base_items_by_name: Dict[str, BaseItem] = {}
        self._mods: Dict[str, Mod] = {}
        self._stat_translations_by_id: Dict[str, str] = {} # Map from stat_id to translation string
        self._stat_ids_by_translation: Dict[str, List[str]] = {} # Map from cleaned text to list of stat_ids

        self._load_data()

    def _load_data(self):
        """Loads all the necessary data files from the repository."""
        print("Loading RePoE data...")
        self._load_base_items()
        self._load_mods()
        self._load_stat_translations()
        print("Data loading complete.")

    def _load_base_items(self):
        """Loads base_items.json into memory."""
        file_path = self.repo_path / "base_items.json"
        with open(file_path) as f:
            data = json.load(f)
        for item_id, item_data in data.items():
            try:
                item = BaseItem(id=item_id, **item_data)
                self._base_items[item_id] = item
                if item.name:
                    # print(f"Loading item by name: {item.name}") # Debug print
                    self._base_items_by_name[item.name] = item
            except TypeError as e:
                # This can happen if a new field is added to the JSON
                # print(f"Warning: Skipping item '{item_id}' due to TypeError: {e}")
                pass

    def _load_mods(self):
        """Loads mods.json into memory."""
        file_path = self.repo_path / "mods.json"
        with open(file_path) as f:
            data = json.load(f)
        for mod_id, mod_data in data.items():
            self._mods[mod_id] = Mod(id=mod_id, **mod_data)

    @staticmethod
    def _clean_stat_text(text: str) -> str:
        """
        Normalizes a stat translation string for reliable matching.
        Removes all placeholders, formatting, and non-alphanumeric characters.
        """
        # Convert to lowercase
        text = text.lower()
        # Remove placeholders like {0}, {1}, etc.
        text = re.sub(r'{\d+}', '', text)
        # Remove other common symbols and formatting
        text = text.replace("#", "").replace("+", "").replace("%", "")
        # Handle the [stat|description] format by extracting the description
        text = re.sub(r'\[[^|\]]+\|([^\]]+)\]', r'\1', text)

        # Remove parenthesized text e.g. (Local)
        text = re.sub(r'\s*\([^)]*\)', '', text)
        # Remove any remaining brackets now that the pipe format is handled
        text = text.replace("[", "").replace("]", "")
        # Collapse whitespace and strip
        return " ".join(text.split()).strip()

    def _load_stat_translations(self):
        """Loads stat_descriptions.json and builds the translation maps."""
        file_path = self.repo_path / "stat_translations" / "stat_descriptions.json"
        with open(file_path) as f:
            data = json.load(f)

        valid_fields = {f.name for f in StatTranslation.__dataclass_fields__.values()}

        for translation_data in data:
            filtered_data = {k: v for k, v in translation_data.items() if k in valid_fields}
            st = StatTranslation(**filtered_data)
            translation_string = st.get_translation()

            # Populate the forward map (id -> text)
            for stat_id in st.ids:
                self._stat_translations_by_id[stat_id] = translation_string

            # Populate the reverse map (cleaned_text -> ids)
            cleaned_text = self._clean_stat_text(translation_string)
            if cleaned_text:
                self._stat_ids_by_translation[cleaned_text] = st.ids

    def get_mod_by_id(self, mod_id: str) -> Optional[Mod]:
        """Retrieves a mod by its ID."""
        return self._mods.get(mod_id)

    def get_base_item_by_id(self, item_id: str) -> Optional[BaseItem]:
        """Retrieves a base item by its ID."""
        return self._base_items.get(item_id)

    def get_base_item_by_name(self, name: str) -> Optional[BaseItem]:
        """Retrieves a base item by its name."""
        return self._base_items_by_name.get(name)

    def get_translation_for_stat(self, stat_id: str) -> str:
        """Gets the English translation for a given stat ID."""
        return self._stat_translations_by_id.get(stat_id, f"Untranslated ({stat_id})")

    def get_stat_ids_for_text(self, text: str) -> Optional[List[str]]:
        """
        Gets the list of stat IDs that correspond to a given human-readable text.
        The text should be the core stat, e.g., "+ to maximum life".
        """
        cleaned_text = self._clean_stat_text(text)
        return self._stat_ids_by_translation.get(cleaned_text)

    def get_mods_for_item_class(self, item_class: str) -> List[Mod]:
        """
        Retrieves all mods that can spawn on a given item class.
        This is a simplified approach; a full implementation would check all tags.
        """
        # This is a placeholder. A real implementation would need to resolve
        # the full tag list for an item and check against mod spawn weights.
        # For now, we'll just return a subset of mods for demonstration.
        # This is a very complex part of PoE and requires careful data mapping.

        # Let's find a tag associated with the item class
        # This is not robust at all.
        tag_to_find = item_class.split('.')[-1].lower()
        if "armour" in item_class:
            tag_to_find = "armour"
        if "ring" in item_class:
            tag_to_find = "ring"

        possible_mods = []
        for mod in self._mods.values():
            for weight in mod.spawn_weights:
                if weight['tag'] == tag_to_find and weight['weight'] > 0:
                    possible_mods.append(mod)
                    break # Don't add the same mod twice
        return possible_mods

# Example usage (for testing purposes)
if __name__ == '__main__':
    # The path to the 'data' directory of the forked repo
    data_path = Path('repoe-fork/data')
    service = CraftingDataService(data_path)

    # Test getting a base item
    item = service.get_base_item_by_id("Metadata/Items/Armours/Helmets/HubrisCirclet")
    if item:
        print(f"Found item: {item.name}")
        print(f"Item Class: {item.item_class}")

    # Test getting a mod
    mod = service.get_mod_by_id("Strength1")
    if mod:
        print(f"\nFound mod: {mod.name}")
        print(f"Mod Type: {mod.generation_type}")
        for stat in mod.stats:
            stat_id = stat['id']
            translation = service.get_translation_for_stat(stat_id)
            print(f"  Grants stat: {translation} (id: {stat_id})")

    # Test getting stat IDs from text
    life_text = "+# to maximum life"
    life_ids = service.get_stat_ids_for_text(life_text)
    print(f"\nFound IDs for '{life_text}': {life_ids}")

    # Test with a different text
    fire_res_text = "+#% to fire resistance"
    fire_res_ids = service.get_stat_ids_for_text(fire_res_text)
    print(f"Found IDs for '{fire_res_text}': {fire_res_ids}")

    # Test getting an item by name
    # hubris = service.get_base_item_by_name("Hubris Circlet")
    # print(f"\nFound 'Hubris Circlet' by name: {'Yes' if hubris else 'No'}")
    # if hubris:
    #     print(f"  Item Class from lookup: {hubris.item_class}")
