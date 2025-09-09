import { CraftingAnalysis } from '../models/index.js';

/**
 * Motor principal de resolução de crafting
 * Orquestra os outros serviços para encontrar as melhores opções de crafting
 */
export class CraftingSolverEngine {
  constructor(craftingDataService, tradeAPIClient) {
    this.dataService = craftingDataService;
    this.tradeClient = tradeAPIClient;
    
    // Configurações padrão
    this.config = {
      maxCandidates: 50,
      maxResultsToReturn: 10,
      timeoutMs: 30000,
      currencyPrices: {
        // Preços padrão em chaos orbs - usar valor 1:1 corrigido
        'exalted': 1, // Correção: 1:1 ratio conforme feedback
        'divine': 10,
        'regal': 2,
        'essence_tier1': 5,
        'essence_tier2': 15,
        'essence_tier3': 50,
        'annulment': 25,
        'ancient': 300
      }
    };

    // Cache para taxas de câmbio
    this.currencyRatesCache = null;
    this.cacheExpiry = null;
    this.CACHE_DURATION = 5 * 60 * 1000; // 5 minutos
  }

  // Currency IDs from PoE2 API
  static CURRENCY_IDS = {
    'chaos': 'chaos',
    'exalted': 'exalted',
    'divine': 'divine',
    'mirror': 'mirror',
    'wisdom': 'wisdom',
    'transmute': 'transmute',
    'aug': 'aug',
    'chance': 'chance',
    'alch': 'alch',
    'regal': 'regal',
    'vaal': 'vaal',
    'annul': 'annul',
    'artificers': 'artificers'
  };

  // Default conversion rates (usando Exalted como base: 1 exalted = X moedas)
  static DEFAULT_CURRENCY_RATES = {
    'exalted': 1,        // Base: 1 exalted = 1 exalted
    'chaos': 180,        // 1 exalted = 180 chaos
    'divine': 0.1,       // 1 exalted = 0.1 divine (divine vale mais)
    'mirror': 0.001,     // 1 exalted = 0.001 mirror (mirror vale muito mais)
    'wisdom': 3600,      // 1 exalted = 3600 wisdom scrolls
    'transmute': 1800,   // 1 exalted = 1800 transmutes
    'aug': 900,          // 1 exalted = 900 augmentations
    'chance': 360,       // 1 exalted = 360 chance orbs
    'alch': 225,         // 1 exalted = 225 alchemy orbs
    'regal': 90,         // 1 exalted = 90 regal orbs
    'vaal': 90,          // 1 exalted = 90 vaal orbs
    'annul': 12,         // 1 exalted = 12 annulment orbs
    'artificers': 60     // 1 exalted = 60 artificer orbs
  };

  /**
   * Função principal: resolve um alvo de crafting
   */
  async solveCraft(craftingTarget) {
    try {
      console.log('Iniciando análise de crafting para:', craftingTarget.baseItemName);
      
      // Validação do alvo
      const validation = craftingTarget.validate();
      if (!validation.isValid) {
        throw new Error(`Alvo de crafting inválido: ${validation.errors.join(', ')}`);
      }

      // Atualiza taxas de câmbio antes de começar
      await this.updateCurrencyRates(craftingTarget.league);

      // Etapa 1: Formulação da consulta
      const queries = this.buildSearchQueries(craftingTarget);
      console.log(`Geradas ${queries.length} consultas de busca`);

      // Etapa 2: Aquisição de candidatos
      const candidates = await this.acquireCandidates(queries, craftingTarget.league);
      console.log(`Encontrados ${candidates.length} itens candidatos`);

      if (candidates.length === 0) {
        return {
          success: false,
          message: 'Nenhum item candidato encontrado no mercado',
          results: []
        };
      }

      // Etapa 3: Simulação e análise de cada candidato
      const analyses = await this.analyzeCandidates(candidates, craftingTarget);
      console.log(`Analisados ${analyses.length} candidatos`);

      // Etapa 4: Classificação por eficiência
      const rankedResults = this.rankResults(analyses);

      // Etapa 5: Preparação dos resultados
      const finalResults = rankedResults.slice(0, this.config.maxResultsToReturn);

      return {
        success: true,
        target: craftingTarget,
        results: finalResults,
        totalCandidatesFound: candidates.length,
        totalAnalyzed: analyses.length,
        timestamp: new Date().toISOString()
      };

    } catch (error) {
      console.error('Erro no CraftingSolverEngine:', error);
      return {
        success: false,
        error: error.message,
        results: []
      };
    }
  }

  /**
   * Constrói múltiplas consultas estratégicas baseadas no alvo
   */
  buildSearchQueries(target) {
    const baseItem = this.dataService.getBaseItemByName(target.baseItemName);
    if (!baseItem) {
      throw new Error(`Item base não encontrado: ${target.baseItemName}`);
    }

    const queries = [];

    // Consulta 1: Bases limpas (apenas para itens raros/mágicos com poucos mods)
    queries.push({
      type: 'clean_base',
      payload: this.tradeClient.buildBasicQuery({
        itemType: this.getItemCategory(baseItem),
        minItemLevel: target.minItemLevel,
        onlineOnly: target.onlineOnly,
        maxPrice: target.maxPrice,
        priceCurrency: target.priceCurrency
      })
    });

    // Consulta 2: Itens com 1 dos modificadores desejados
    for (const targetAffix of target.targetAffixes) {
      const statInfo = this.findStatForAffix(targetAffix);
      if (statInfo) {
        queries.push({
          type: 'partial_match_single',
          targetAffix,
          payload: this.tradeClient.buildBasicQuery({
            itemType: this.getItemCategory(baseItem),
            minItemLevel: target.minItemLevel,
            onlineOnly: target.onlineOnly,
            maxPrice: target.maxPrice,
            priceCurrency: target.priceCurrency,
            stats: [{
              id: statInfo.id,
              min: targetAffix.minValue,
              max: targetAffix.maxValue
            }]
          })
        });
      }
    }

    // Consulta 3: Itens com múltiplos modificadores (se aplicável)
    if (target.targetAffixes.length >= 2) {
      const primaryAffixes = target.targetAffixes
        .filter(affix => affix.priority === 1)
        .slice(0, 2); // Máximo 2 para evitar zero resultados

      if (primaryAffixes.length >= 2) {
        const stats = [];
        for (const affix of primaryAffixes) {
          const statInfo = this.findStatForAffix(affix);
          if (statInfo) {
            stats.push({
              id: statInfo.id,
              min: affix.minValue,
              max: affix.maxValue
            });
          }
        }

        if (stats.length >= 2) {
          queries.push({
            type: 'partial_match_multiple',
            targetAffixes: primaryAffixes,
            payload: this.tradeClient.buildBasicQuery({
              itemType: this.getItemCategory(baseItem),
              minItemLevel: target.minItemLevel,
              onlineOnly: target.onlineOnly,
              maxPrice: target.maxPrice,
              priceCurrency: target.priceCurrency,
              stats
            })
          });
        }
      }
    }

    return queries;
  }

  /**
   * Executa todas as consultas e coleta candidatos únicos
   */
  async acquireCandidates(queries, league) {
    const allCandidates = [];
    const seenIds = new Set();

    for (const query of queries) {
      try {
        console.log(`Executando consulta: ${query.type}`);
        const result = await this.tradeClient.searchAndFetchItems(
          query.payload, 
          league, 
          Math.floor(this.config.maxCandidates / queries.length)
        );

        for (const item of result.items) {
          if (!seenIds.has(item.id)) {
            seenIds.add(item.id);
            allCandidates.push({
              ...item,
              queryType: query.type,
              targetAffix: query.targetAffix,
              targetAffixes: query.targetAffixes
            });
          }
        }
      } catch (error) {
        console.warn(`Erro na consulta ${query.type}:`, error.message);
        // Continua com outras consultas
      }
    }

    return allCandidates.slice(0, this.config.maxCandidates);
  }

  /**
   * Analisa cada candidato e calcula custos de crafting
   */
  async analyzeCandidates(candidates, target) {
    const analyses = [];

    for (const candidate of candidates) {
      try {
        const analysis = await this.analyzeCandidate(candidate, target);
        if (analysis) {
          analyses.push(analysis);
        }
      } catch (error) {
        console.warn(`Erro ao analisar candidato ${candidate.id}:`, error.message);
      }
    }

    return analyses;
  }

  /**
   * Analisa um candidato individual
   */
  async analyzeCandidate(candidate, target) {
    const baseItem = this.dataService.getBaseItemByName(target.baseItemName);
    const purchasePrice = this.calculatePurchasePrice(candidate);
    
    // Analisa o estado atual do item
    const currentState = this.analyzeItemState(candidate.item);
    
    // Calcula a distância até o objetivo
    const craftingPlan = this.planCraftingSteps(currentState, target, baseItem);
    
    // Estima custos de cada passo
    const estimatedCost = this.estimateCraftingCost(craftingPlan, baseItem);
    
    // Calcula probabilidade de sucesso
    const successProbability = this.calculateSuccessProbability(craftingPlan, baseItem);

    return new CraftingAnalysis({
      market_item: candidate,
      purchase_price: purchasePrice,
      estimated_crafting_cost: estimatedCost.total,
      total_estimated_cost: purchasePrice + estimatedCost.total,
      crafting_steps: craftingPlan.steps,
      success_probability: successProbability,
      confidence: estimatedCost.confidence,
      warnings: craftingPlan.warnings || []
    });
  }

  /**
   * Calcula o preço de compra em chaos orbs
   */
  calculatePurchasePrice(candidate) {
    if (!candidate.price) return 0;
    
    const { amount, currency } = candidate.price;
    
    // Conversão básica para chaos orbs
    const conversionRates = {
      'chaos': 1,
      'divine': this.config.currencyPrices.divine,
      'exalted': this.config.currencyPrices.exalted,
      'ancient': this.config.currencyPrices.ancient
    };
    
    const rate = conversionRates[currency] || 1;
    return amount * rate;
  }

  /**
   * Analisa o estado atual de um item
   */
  analyzeItemState(item) {
    const state = {
      rarity: item.rarity || 'normal',
      prefixes: [],
      suffixes: [],
      openPrefixes: 3,
      openSuffixes: 3,
      itemLevel: item.ilvl || 1,
      modifiers: []
    };

    // Analisa modificadores explícitos
    if (item.explicitMods) {
      for (const modText of item.explicitMods) {
        const mod = this.identifyModifier(modText);
        if (mod) {
          state.modifiers.push(mod);
          if (mod.type === 'prefix') {
            state.prefixes.push(mod);
            state.openPrefixes--;
          } else if (mod.type === 'suffix') {
            state.suffixes.push(mod);
            state.openSuffixes--;
          }
        }
      }
    }

    // Garante valores mínimos
    state.openPrefixes = Math.max(0, state.openPrefixes);
    state.openSuffixes = Math.max(0, state.openSuffixes);

    return state;
  }

  /**
   * Planeja os passos de crafting necessários
   */
  planCraftingSteps(currentState, target, baseItem) {
    const steps = [];
    const warnings = [];
    let workingState = { ...currentState };

    // Analisa quais modificadores ainda são necessários
    const missingAffixes = this.findMissingAffixes(workingState, target);
    
    // Planeja adição de modificadores necessários
    for (const missingAffix of missingAffixes) {
      const affixType = this.determineAffixType(missingAffix, baseItem);
      
      if (affixType === 'prefix' && workingState.openPrefixes > 0) {
        steps.push({
          type: 'exalt_slam',
          target: missingAffix,
          cost_base: this.config.currencyPrices.exalted,
          success_chance: this.estimateExaltSuccessChance(missingAffix, baseItem)
        });
        workingState.openPrefixes--;
      } else if (affixType === 'suffix' && workingState.openSuffixes > 0) {
        steps.push({
          type: 'exalt_slam',
          target: missingAffix,
          cost_base: this.config.currencyPrices.exalted,
          success_chance: this.estimateExaltSuccessChance(missingAffix, baseItem)
        });
        workingState.openSuffixes--;
      } else {
        warnings.push(`Não há espaço para o modificador: ${missingAffix.text}`);
      }
    }

    // Se precisar remover modificadores indesejados
    const unwantedMods = this.findUnwantedModifiers(workingState, target);
    if (unwantedMods.length > 0) {
      warnings.push(`${unwantedMods.length} modificadores indesejados precisam ser removidos (alto risco)`);
      
      for (const unwantedMod of unwantedMods) {
        steps.push({
          type: 'annul',
          target: unwantedMod,
          cost_base: this.config.currencyPrices.annulment,
          success_chance: 1 / workingState.modifiers.length,
          risk: 'high'
        });
      }
    }

    return {
      steps,
      warnings,
      finalState: workingState
    };
  }

  /**
   * Estima o custo total de crafting
   */
  estimateCraftingCost(craftingPlan, baseItem) {
    let totalCost = 0;
    let confidence = 'high';

    for (const step of craftingPlan.steps) {
      const stepCost = step.cost_base / (step.success_chance || 0.1);
      totalCost += stepCost;
      
      if (step.success_chance < 0.3) {
        confidence = 'low';
      } else if (step.success_chance < 0.6 && confidence === 'high') {
        confidence = 'medium';
      }
    }

    return {
      total: Math.ceil(totalCost),
      confidence,
      breakdown: craftingPlan.steps.map(step => ({
        type: step.type,
        baseCost: step.cost_base,
        estimatedCost: Math.ceil(step.cost_base / (step.success_chance || 0.1)),
        successChance: step.success_chance
      }))
    };
  }

  /**
   * Calcula a probabilidade geral de sucesso
   */
  calculateSuccessProbability(craftingPlan, baseItem) {
    let overallProbability = 1;

    for (const step of craftingPlan.steps) {
      overallProbability *= (step.success_chance || 0.1);
    }

    return Math.max(0.01, Math.min(1, overallProbability));
  }

  /**
   * Classifica os resultados por eficiência
   */
  rankResults(analyses) {
    return analyses
      .filter(analysis => analysis.totalEstimatedCost > 0)
      .sort((a, b) => {
        // Primeiro critério: custo total
        const costDiff = a.totalEstimatedCost - b.totalEstimatedCost;
        if (Math.abs(costDiff) > 10) return costDiff;
        
        // Segundo critério: probabilidade de sucesso
        const probDiff = b.successProbability - a.successProbability;
        if (Math.abs(probDiff) > 0.1) return probDiff * 1000;
        
        // Terceiro critério: confiança
        const confidenceScore = { high: 3, medium: 2, low: 1 };
        return confidenceScore[b.confidence] - confidenceScore[a.confidence];
      });
  }

  // Métodos auxiliares

  getItemCategory(baseItem) {
    // Mapeia classes de item para categorias da API de trade
    const categoryMap = {
      'Body Armour': 'armour.chest',
      'Helmet': 'armour.helmet',
      'Gloves': 'armour.gloves',
      'Boots': 'armour.boots',
      'Shield': 'armour.shield',
      'One Hand Sword': 'weapon.onesword',
      'Two Hand Sword': 'weapon.twosword',
      'Bow': 'weapon.bow',
      'Staff': 'weapon.staff',
      'Wand': 'weapon.wand',
      'Dagger': 'weapon.dagger',
      'Ring': 'accessory.ring',
      'Amulet': 'accessory.amulet',
      'Belt': 'accessory.belt'
    };

    return categoryMap[baseItem.itemClass] || 'armour.chest';
  }

  findStatForAffix(targetAffix) {
    // Busca o stat correspondente no serviço de dados
    const results = this.dataService.translateTextToStatIds(targetAffix.text);
    return results.length > 0 ? results[0] : null;
  }

  identifyModifier(modText) {
    // Identifica um modificador baseado no texto
    // Implementação simplificada
    return {
      text: modText,
      type: modText.includes('increased') ? 'suffix' : 'prefix', // Heurística básica
      value: this.extractNumericValue(modText)
    };
  }

  extractNumericValue(text) {
    const match = text.match(/(\d+)/);
    return match ? parseInt(match[1]) : 0;
  }

  findMissingAffixes(currentState, target) {
    return target.targetAffixes.filter(targetAffix => {
      return !currentState.modifiers.some(mod => 
        mod.text.toLowerCase().includes(targetAffix.text.toLowerCase())
      );
    });
  }

  findUnwantedModifiers(currentState, target) {
    // Por enquanto, retorna uma lista vazia
    // Em uma implementação mais sofisticada, identificaria mods que conflitam
    return [];
  }

  determineAffixType(affix, baseItem) {
    // Determina se um afixo é prefixo ou sufixo
    // Implementação simplificada baseada em heurísticas
    const prefixKeywords = ['added', 'flat', 'base', 'local'];
    const suffixKeywords = ['increased', 'more', 'resistance', 'to all'];
    
    const text = affix.text.toLowerCase();
    
    if (prefixKeywords.some(keyword => text.includes(keyword))) {
      return 'prefix';
    }
    
    if (suffixKeywords.some(keyword => text.includes(keyword))) {
      return 'suffix';
    }
    
    return 'prefix'; // Default
  }

  estimateExaltSuccessChance(affix, baseItem) {
    // Estima a chance de acertar um afixo específico com Exalted Orb
    const relevantMods = this.dataService.getModsForItem(baseItem);
    const affixType = this.determineAffixType(affix, baseItem);
    const poolSize = relevantMods.filter(mod => 
      (affixType === 'prefix' && mod.isPrefix()) ||
      (affixType === 'suffix' && mod.isSuffix())
    ).length;
    
    return poolSize > 0 ? 1 / poolSize : 0.01;
  }

  /**
   * Atualiza os preços de currency
   */
  /**
   * Atualiza os preços das moedas com dados da API
   */
  async updateCurrencyRates(league = 'Standard') {
    try {
      // Verifica se o cache ainda é válido
      if (this.currencyRatesCache && this.cacheExpiry && Date.now() < this.cacheExpiry) {
        console.log('Usando taxas de câmbio em cache');
        return this.currencyRatesCache;
      }

      console.log('Buscando taxas de câmbio atualizadas da API...');
      
      // Busca dados de moeda da API
      const currencyData = await this.fetchCurrencyRatesFromAPI(league);
      
      if (currencyData && Object.keys(currencyData).length > 0) {
        // Atualiza o cache
        this.currencyRatesCache = currencyData;
        this.cacheExpiry = Date.now() + this.CACHE_DURATION;
        
        // Atualiza os preços na configuração
        this.config.currencyPrices = { 
          ...this.config.currencyPrices, 
          ...currencyData 
        };
        
        console.log('Taxas de câmbio atualizadas:', currencyData);
        return currencyData;
      } else {
        console.log('Falha ao obter taxas da API, usando valores padrão');
        return CraftingSolverEngine.DEFAULT_CURRENCY_RATES;
      }
    } catch (error) {
      console.error('Erro ao atualizar taxas de câmbio:', error);
      return CraftingSolverEngine.DEFAULT_CURRENCY_RATES;
    }
  }

  /**
   * Obtém as taxas de câmbio atuais
   */
  async getCurrencyRates(league = 'Standard') {
    return await this.updateCurrencyRates(league);
  }

  /**
   * Busca taxas de câmbio da API do PoE2
   */
  async fetchCurrencyRatesFromAPI(league) {
    try {
      // Simulação de busca de dados reais - em produção seria uma consulta real
      // Taxas expressas em relação ao Exalted Orb (1 exalted = X moedas)
      const rates = {
        'exalted': 1,        // Base: 1 exalted = 1 exalted
        'chaos': 180,        // 1 exalted = 180 chaos (exemplo)
        'divine': 0.1,       // 1 exalted = 0.1 divine (divine vale mais)
        'regal': 90,         // 1 exalted = 90 regal
        'annulment': 12      // 1 exalted = 12 annulment
      };

      // TODO: Implementar busca real da API quando disponível
      // const response = await fetch(`https://www.pathofexile.com/api/trade2/exchange/${league}`);
      // const data = await response.json();
      // return this.parseCurrencyRatesFromAPIResponse(data);

      return rates;
    } catch (error) {
      console.error('Erro ao buscar taxas da API:', error);
      return null;
    }
  }

  /**
   * Converte preço entre moedas (usando Exalted como base)
   */
  convertCurrency(amount, fromCurrency, toCurrency) {
    const rates = this.currencyRatesCache || CraftingSolverEngine.DEFAULT_CURRENCY_RATES;
    
    // Converte tudo para exalted primeiro, depois para a moeda de destino
    const exaltedValue = amount / (rates[fromCurrency] || 1);
    const finalValue = exaltedValue * (rates[toCurrency] || 1);
    
    return Math.round(finalValue * 100) / 100; // Arredonda para 2 casas decimais
  }

  updateCurrencyPrices(newPrices) {
    this.config.currencyPrices = { ...this.config.currencyPrices, ...newPrices };
  }

  /**
   * Obtém estatísticas do motor
   */
  getEngineStats() {
    return {
      config: this.config,
      dataServiceInitialized: this.dataService.isInitialized,
      tradeClientStats: this.tradeClient.getStats()
    };
  }
}
