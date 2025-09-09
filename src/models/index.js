/**
 * Representa um item base do jogo
 */
export class BaseItem {
  constructor(data) {
    this.id = data.id || '';
    this.name = data.name || '';
    this.itemClass = data.item_class || '';
    this.domain = data.domain || '';
    this.dropLevel = data.drop_level || 0;
    this.inventoryHeight = data.inventory_height || 1;
    this.inventoryWidth = data.inventory_width || 1;
    this.inheritsFrom = data.inherits_from || '';
    this.implicits = data.implicits || [];
    this.properties = data.properties || {};
    this.tags = data.tags || [];
    this.requirements = data.requirements || null;
    this.visualIdentity = data.visual_identity || {};
    this.releaseState = data.release_state || '';
  }

  /**
   * Verifica se o item é do tipo especificado
   */
  isOfType(itemType) {
    return this.itemClass === itemType || this.tags.includes(itemType);
  }

  /**
   * Verifica se o item pode ter o modificador especificado
   */
  canHaveMod(mod) {
    if (!mod.spawnWeights) return false;
    
    return mod.spawnWeights.some(weight => 
      this.tags.some(tag => tag === weight.tag && weight.weight > 0)
    );
  }
}

/**
 * Representa um modificador (afixo) do jogo
 */
export class Mod {
  constructor(data) {
    this.id = data.id || '';
    this.name = data.name || '';
    this.domain = data.domain || '';
    this.generationType = data.generation_type || ''; // prefix, suffix
    this.generationWeights = data.generation_weights || [];
    this.spawnWeights = data.spawn_weights || [];
    this.groups = data.groups || [];
    this.requiredLevel = data.required_level || 1;
    this.implicitTags = data.implicit_tags || [];
    this.addsTags = data.adds_tags || [];
    this.grantsEffects = data.grants_effects || [];
    this.isEssenceOnly = data.is_essence_only || false;
    this.stats = data.stats || [];
  }

  /**
   * Verifica se o mod é um prefixo
   */
  isPrefix() {
    return this.generationType === 'prefix';
  }

  /**
   * Verifica se o mod é um sufixo
   */
  isSuffix() {
    return this.generationType === 'suffix';
  }

  /**
   * Obtém o peso de spawn para uma tag específica
   */
  getSpawnWeightForTag(tag) {
    const weight = this.spawnWeights.find(w => w.tag === tag);
    return weight ? weight.weight : 0;
  }
}

/**
 * Representa um stat do jogo
 */
export class Stat {
  constructor(data) {
    this.id = data.id || '';
    this.text = data.text || '';
    this.isLocal = data.is_local || false;
    this.isWeaponLocal = data.is_weapon_local || false;
    this.semantics = data.semantics || '';
  }
}

/**
 * Representa um alvo de crafting definido pelo usuário
 */
export class CraftingTarget {
  constructor(data) {
    this.baseItemName = data.base_item_name || '';
    this.minItemLevel = data.min_ilvl || 1;
    this.maxPrice = data.max_price || null;
    this.priceCurrency = data.price_currency || 'chaos';
    this.targetAffixes = data.target_affixes || [];
    this.requiredOpenAffixes = data.required_open_affixes || {
      prefix: 0,
      suffix: 0
    };
    this.league = data.league || 'Standard';
    this.onlineOnly = data.online_only !== false; // default true
  }

  /**
   * Valida se o alvo de crafting está bem formado
   */
  validate() {
    const errors = [];
    
    if (!this.baseItemName) {
      errors.push('Nome do item base é obrigatório');
    }
    
    if (this.minItemLevel < 1 || this.minItemLevel > 100) {
      errors.push('Nível do item deve estar entre 1 e 100');
    }
    
    if (this.targetAffixes.length === 0) {
      errors.push('Pelo menos um afixo alvo deve ser especificado');
    }
    
    return {
      isValid: errors.length === 0,
      errors
    };
  }
}

/**
 * Representa um afixo alvo com suas condições
 */
export class TargetAffix {
  constructor(data) {
    this.statId = data.stat_id || '';
    this.text = data.text || '';
    this.minValue = data.min_value || null;
    this.maxValue = data.max_value || null;
    this.tier = data.tier || null;
    this.priority = data.priority || 1; // 1 = alta, 2 = média, 3 = baixa
    this.required = data.required !== false; // default true
  }
}

/**
 * Representa um item encontrado no mercado
 */
export class MarketItem {
  constructor(data) {
    this.id = data.id || '';
    this.listing = data.listing || {};
    this.item = data.item || {};
    this.price = this.parsePrice(data.listing?.price);
    this.seller = data.listing?.account?.name || '';
    this.whisper = data.listing?.whisper || '';
    this.indexed = new Date(data.listing?.indexed || Date.now());
  }

  parsePrice(priceData) {
    if (!priceData) return null;
    
    return {
      amount: priceData.amount || 0,
      currency: priceData.currency || '',
      type: priceData.type || 'fixed'
    };
  }

  /**
   * Obtém o preço em formato legível
   */
  getPriceString() {
    if (!this.price) return 'Preço não definido';
    
    return `${this.price.amount} ${this.price.currency}`;
  }
}

/**
 * Representa o resultado de análise de um item candidato
 */
export class CraftingAnalysis {
  constructor(data) {
    this.marketItem = data.market_item;
    this.purchasePrice = data.purchase_price || 0;
    this.estimatedCraftingCost = data.estimated_crafting_cost || 0;
    this.totalEstimatedCost = data.total_estimated_cost || 0;
    this.craftingSteps = data.crafting_steps || [];
    this.successProbability = data.success_probability || 0;
    this.confidence = data.confidence || 'low'; // low, medium, high
    this.warnings = data.warnings || [];
  }

  /**
   * Calcula a pontuação de eficiência do craft
   */
  getEfficiencyScore() {
    // Pontuação baseada em custo total, probabilidade de sucesso e confiança
    const costFactor = 1000 / (this.totalEstimatedCost + 1);
    const probabilityFactor = this.successProbability;
    const confidenceFactor = this.confidence === 'high' ? 1 : 
                           this.confidence === 'medium' ? 0.8 : 0.6;
    
    return costFactor * probabilityFactor * confidenceFactor;
  }
}
