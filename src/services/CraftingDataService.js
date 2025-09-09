import fs from 'fs';
import path from 'path';
import { BaseItem, Mod, Stat } from '../models/index.js';

/**
 * Serviço responsável por gerenciar todos os dados estáticos do jogo
 * Este é a única fonte da verdade para dados de itens, modificadores e stats
 */
export class CraftingDataService {
  constructor(dataPath = './repoe-fork/data') {
    this.dataPath = dataPath;
    this.baseItems = new Map();
    this.mods = new Map();
    this.stats = new Map();
    this.statTranslations = new Map();
    this.itemClasses = new Map();
    this.tags = new Map();
    this.isInitialized = false;
  }

  /**
   * Inicializa o serviço carregando todos os dados necessários
   */
  async initialize() {
    try {
      console.log('Inicializando CraftingDataService...');
      
      await this.loadBaseItems();
      await this.loadMods();
      await this.loadStatTranslations();
      await this.loadItemClasses();
      await this.loadTags();
      
      this.isInitialized = true;
      console.log('CraftingDataService inicializado com sucesso!');
      console.log(`Carregados: ${this.baseItems.size} itens base, ${this.mods.size} modificadores`);
      
    } catch (error) {
      console.error('Erro ao inicializar CraftingDataService:', error);
      throw error;
    }
  }

  /**
   * Carrega todos os itens base do arquivo base_items.json
   */
  async loadBaseItems() {
    const filePath = path.join(this.dataPath, 'base_items.json');
    
    // Verifica se o arquivo existe
    if (!fs.existsSync(filePath)) {
      console.warn(`Arquivo não encontrado: ${filePath}`);
      console.log('Criando dados de exemplo para desenvolvimento...');
      
      // Cria alguns itens base de exemplo para desenvolvimento
      const exampleItems = {
        'example_weapon': {
          name: 'Example Weapon',
          item_class: 'One Hand Swords',
          domain: 'item',
          requirements: {},
          implicits: []
        },
        'example_armor': {
          name: 'Example Armor',
          item_class: 'Body Armours',
          domain: 'item',
          requirements: {},
          implicits: []
        }
      };
      
      for (const [key, itemData] of Object.entries(exampleItems)) {
        const baseItem = new BaseItem({
          id: key,
          ...itemData
        });
        this.baseItems.set(key, baseItem);
        
        if (baseItem.name) {
          this.baseItems.set(baseItem.name, baseItem);
        }
      }
      
      console.log(`Carregados ${Object.keys(exampleItems).length} itens de exemplo`);
      return;
    }
    
    const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    
    for (const [key, itemData] of Object.entries(data)) {
      const baseItem = new BaseItem({
        id: key,
        ...itemData
      });
      this.baseItems.set(key, baseItem);
      
      // Também indexa por nome para facilitar buscas
      if (baseItem.name) {
        this.baseItems.set(baseItem.name, baseItem);
      }
    }
    
    console.log(`Carregados ${this.baseItems.size / 2} itens base`);
  }

  /**
   * Carrega todos os modificadores do arquivo mods.json
   */
  async loadMods() {
    const filePath = path.join(this.dataPath, 'mods.json');
    
    if (!fs.existsSync(filePath)) {
      console.warn(`Arquivo não encontrado: ${filePath}`);
      console.log('Criando dados de modificadores de exemplo...');
      
      const exampleMods = {
        'example_mod_1': {
          name: 'Increased Physical Damage',
          domain: 'item',
          generation_type: 'prefix',
          level: 1,
          stats: ['local_physical_damage_+%']
        }
      };
      
      for (const [key, modData] of Object.entries(exampleMods)) {
        const mod = new Mod({
          id: key,
          ...modData
        });
        this.mods.set(key, mod);
      }
      
      console.log(`Carregados ${Object.keys(exampleMods).length} modificadores de exemplo`);
      return;
    }
    
    const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    
    for (const [key, modData] of Object.entries(data)) {
      const mod = new Mod({
        id: key,
        ...modData
      });
      this.mods.set(key, mod);
    }
    
    console.log(`Carregados ${this.mods.size} modificadores`);
  }

  /**
   * Carrega as traduções de stats
   */
  async loadStatTranslations() {
    const filePath = path.join(this.dataPath, 'stat_translations', 'stat_descriptions.json');
    
    if (!fs.existsSync(filePath)) {
      console.warn(`Arquivo não encontrado: ${filePath}`);
      console.log('Criando traduções de exemplo...');
      
      const exampleTranslations = {
        'local_physical_damage_+%': {
          ids: ['local_physical_damage_+%'],
          English: ['{0}% increased Physical Damage']
        }
      };
      
      for (const [key, translation] of Object.entries(exampleTranslations)) {
        this.statTranslations.set(key, translation);
      }
      
      console.log(`Carregadas ${Object.keys(exampleTranslations).length} traduções de exemplo`);
      return;
    }
    
    const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    
    for (const [key, translation] of Object.entries(data)) {
      this.statTranslations.set(key, translation);
    }
    
    console.log(`Carregadas ${this.statTranslations.size} traduções de stats`);
  }

  /**
   * Carrega as classes de itens
   */
  async loadItemClasses() {
    const filePath = path.join(this.dataPath, 'item_classes.json');
    
    if (!fs.existsSync(filePath)) {
      console.warn(`Arquivo não encontrado: ${filePath}`);
      console.log('Criando classes de itens de exemplo...');
      
      const exampleClasses = {
        'One Hand Swords': {
          name: 'One Hand Swords',
          category: 'weapons'
        },
        'Body Armours': {
          name: 'Body Armours',
          category: 'armour'
        }
      };
      
      for (const [key, classData] of Object.entries(exampleClasses)) {
        this.itemClasses.set(key, classData);
      }
      
      console.log(`Carregadas ${Object.keys(exampleClasses).length} classes de itens de exemplo`);
      return;
    }
    
    const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    
    for (const [key, classData] of Object.entries(data)) {
      this.itemClasses.set(key, classData);
    }
    
    console.log(`Carregadas ${this.itemClasses.size} classes de itens`);
  }

  /**
   * Carrega as tags
   */
  async loadTags() {
    const filePath = path.join(this.dataPath, 'tags.json');
    
    if (!fs.existsSync(filePath)) {
      console.warn(`Arquivo não encontrado: ${filePath}`);
      console.log('Criando tags de exemplo...');
      
      const exampleTags = {
        'weapon': {
          name: 'weapon'
        },
        'armour': {
          name: 'armour'
        }
      };
      
      for (const [key, tagData] of Object.entries(exampleTags)) {
        this.tags.set(key, tagData);
      }
      
      console.log(`Carregadas ${Object.keys(exampleTags).length} tags de exemplo`);
      return;
    }
    
    const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    
    for (const [key, tagData] of Object.entries(data)) {
      this.tags.set(key, tagData);
    }
    
    console.log(`Carregadas ${this.tags.size} tags`);
  }

  /**
   * Busca um item base por nome ou ID
   */
  getBaseItemByName(name) {
    return this.baseItems.get(name);
  }

  /**
   * Busca um modificador por ID
   */
  getModById(id) {
    return this.mods.get(id);
  }

  /**
   * Busca modificadores por tag
   */
  getModsByTag(tag) {
    const result = [];
    for (const mod of this.mods.values()) {
      if (mod.spawnWeights.some(weight => weight.tag === tag && weight.weight > 0)) {
        result.push(mod);
      }
    }
    return result;
  }

  /**
   * Busca modificadores que podem aparecer em um item específico
   */
  getModsForItem(baseItem) {
    if (!baseItem) return [];
    
    const result = [];
    for (const mod of this.mods.values()) {
      if (baseItem.canHaveMod(mod)) {
        result.push(mod);
      }
    }
    return result;
  }

  /**
   * Traduz texto legível em IDs de stats para usar na API
   */
  translateTextToStatIds(text) {
    const normalizedText = text.toLowerCase().trim();
    const results = [];
    
    for (const [id, translation] of this.statTranslations.entries()) {
      if (translation.english && translation.english.length > 0) {
        const translatedText = translation.english[0].string;
        if (translatedText && translatedText.toLowerCase().includes(normalizedText)) {
          results.push({
            id,
            text: translatedText,
            tradeStats: translation.tradeStats
          });
        }
      }
    }
    
    return results;
  }

  /**
   * Busca modificadores por tipo (prefix/suffix)
   */
  getModsByType(type, itemTags = []) {
    const result = [];
    for (const mod of this.mods.values()) {
      if (mod.generationType === type) {
        // Se tags de item foram fornecidas, filtra por compatibilidade
        if (itemTags.length === 0 || 
            mod.spawnWeights.some(weight => 
              itemTags.includes(weight.tag) && weight.weight > 0
            )) {
          result.push(mod);
        }
      }
    }
    return result;
  }

  /**
   * Obtém todos os modificadores de vida para um tipo de item
   */
  getLifeModsForItem(baseItem) {
    const lifeMods = [];
    const allMods = this.getModsForItem(baseItem);
    
    for (const mod of allMods) {
      // Verifica se o mod tem stats relacionados à vida
      const hasLifeStat = mod.stats && mod.stats.some(stat => 
        stat.id && (
          stat.id.includes('life') || 
          stat.id.includes('maximum_life') ||
          stat.id.includes('base_maximum_life')
        )
      );
      
      if (hasLifeStat) {
        lifeMods.push(mod);
      }
    }
    
    return lifeMods;
  }

  /**
   * Calcula probabilidades de crafting (versão básica com pesos iguais)
   */
  calculateCraftingProbabilities(baseItem, targetMods) {
    if (!baseItem || !targetMods.length) return {};
    
    const availableMods = this.getModsForItem(baseItem);
    const prefixes = availableMods.filter(mod => mod.isPrefix());
    const suffixes = availableMods.filter(mod => mod.isSuffix());
    
    // Implementação básica: assume probabilidades iguais dentro do mesmo tipo
    const results = {};
    
    for (const targetMod of targetMods) {
      const mod = this.getModById(targetMod.id || targetMod);
      if (!mod) continue;
      
      const relevantPool = mod.isPrefix() ? prefixes : suffixes;
      const poolSize = relevantPool.length;
      
      // Probabilidade básica = 1 / número de mods no pool
      results[mod.id] = {
        probability: poolSize > 0 ? 1 / poolSize : 0,
        poolSize,
        confidence: 'low' // Sempre low devido à ausência de pesos reais
      };
    }
    
    return results;
  }

  /**
   * Busca itens base por critérios
   */
  searchBaseItems(criteria) {
    const results = [];
    
    for (const item of this.baseItems.values()) {
      let matches = true;
      
      if (criteria.itemClass && item.itemClass !== criteria.itemClass) {
        matches = false;
      }
      
      if (criteria.minDropLevel && item.dropLevel < criteria.minDropLevel) {
        matches = false;
      }
      
      if (criteria.tags && criteria.tags.length > 0) {
        const hasAllTags = criteria.tags.every(tag => item.tags.includes(tag));
        if (!hasAllTags) {
          matches = false;
        }
      }
      
      if (criteria.name && !item.name.toLowerCase().includes(criteria.name.toLowerCase())) {
        matches = false;
      }
      
      if (matches) {
        results.push(item);
      }
    }
    
    return results;
  }

  /**
   * Verifica se o serviço foi inicializado
   */
  ensureInitialized() {
    if (!this.isInitialized) {
      throw new Error('CraftingDataService não foi inicializado. Chame initialize() primeiro.');
    }
  }

  /**
   * Obtém estatísticas do serviço
   */
  getStats() {
    return {
      baseItems: this.baseItems.size / 2, // Dividido por 2 porque indexamos por ID e nome
      mods: this.mods.size,
      statTranslations: this.statTranslations.size,
      itemClasses: this.itemClasses.size,
      tags: this.tags.size,
      isInitialized: this.isInitialized
    };
  }
}
