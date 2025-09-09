import axios from 'axios';
import { MarketItem } from '../models/index.js';

/**
 * Cliente para interação com a API de trocas não oficial do Path of Exile 2
 * Implementa o padrão de busca em duas etapas da GGG
 */
export class TradeAPIClient {
  constructor(options = {}) {
    this.baseURL = options.baseURL || 'https://www.pathofexile.com';
    this.userAgent = options.userAgent || 'PoE2CraftingAssistant/1.0 (contato: crafting@assistant.com) - Projeto não comercial';
    this.rateLimit = options.rateLimit || {
      requestsPerSecond: 5,
      requestsPerMinute: 100
    };
    
    // Autenticação
    this.poesessid = options.poesessid || null;
    this.isAuthenticated = false;
    
    // Rate limiting
    this.requestTimes = [];
    this.lastRequestTime = 0;
    
    // Cache para dados estáticos
    this.cache = {
      leagues: null,
      stats: null,
      items: null
    };
    
    // Configuração do axios
    this.client = axios.create({
      baseURL: this.baseURL,
      headers: {
        'User-Agent': this.userAgent,
        'Content-Type': 'application/json'
      },
      timeout: 30000
    });
    
    // Se temos POESESSID, configurar cookie
    if (this.poesessid) {
      this.setAuthentication(this.poesessid);
    }
    
    // Interceptors para rate limiting e error handling
    this.setupInterceptors();
  }

  /**
   * Configura autenticação com POESESSID
   */
  setAuthentication(poesessid) {
    this.poesessid = poesessid;
    this.isAuthenticated = true;
    
    // Adiciona cookie de sessão aos headers
    this.client.defaults.headers.Cookie = `POESESSID=${poesessid}`;
  }

  /**
   * Remove autenticação
   */
  clearAuthentication() {
    this.poesessid = null;
    this.isAuthenticated = false;
    delete this.client.defaults.headers.Cookie;
  }

  /**
   * Verifica se o cliente está autenticado
   */
  getAuthenticationStatus() {
    return {
      authenticated: this.isAuthenticated,
      hasSessionId: !!this.poesessid
    };
  }

  /**
   * Configura interceptors do axios para rate limiting e tratamento de erros
   */
  setupInterceptors() {
    // Request interceptor para rate limiting
    this.client.interceptors.request.use(async (config) => {
      await this.enforceRateLimit();
      return config;
    });

    // Response interceptor para tratamento de erros
    this.client.interceptors.response.use(
      (response) => response,
      async (error) => {
        if (error.response?.status === 429) {
          // Too Many Requests - implementa backoff exponencial
          const retryAfter = error.response.headers['retry-after'] || 5;
          console.warn(`Rate limit atingido. Aguardando ${retryAfter}s...`);
          await this.sleep(retryAfter * 1000);
          
          // Retry a requisição
          return this.client.request(error.config);
        }
        
        throw error;
      }
    );
  }

  /**
   * Implementa rate limiting baseado em timestamps
   */
  async enforceRateLimit() {
    const now = Date.now();
    
    // Remove timestamps antigos (mais de 1 minuto)
    this.requestTimes = this.requestTimes.filter(time => now - time < 60000);
    
    // Verifica limite por minuto
    if (this.requestTimes.length >= this.rateLimit.requestsPerMinute) {
      const oldestRequest = Math.min(...this.requestTimes);
      const waitTime = 60000 - (now - oldestRequest);
      if (waitTime > 0) {
        console.log(`Rate limit por minuto atingido. Aguardando ${waitTime}ms...`);
        await this.sleep(waitTime);
      }
    }
    
    // Verifica limite por segundo
    const timeSinceLastRequest = now - this.lastRequestTime;
    const minInterval = 1000 / this.rateLimit.requestsPerSecond;
    
    if (timeSinceLastRequest < minInterval) {
      const waitTime = minInterval - timeSinceLastRequest;
      await this.sleep(waitTime);
    }
    
    this.requestTimes.push(Date.now());
    this.lastRequestTime = Date.now();
  }

  /**
   * Utilitário para pausar execução
   */
  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Busca itens no mercado (Etapa 1: POST /api/trade2/search/{league})
   * Retorna um ID de consulta e os primeiros hashes de itens
   */
  async searchForItems(query, league = 'Standard') {
    try {
      const url = `/api/trade2/search/${league}`;
      const response = await this.client.post(url, query);
      
      return {
        queryId: response.data.id,
        total: response.data.total,
        result: response.data.result || [],
        inexact: response.data.inexact || false
      };
    } catch (error) {
      console.error('Erro na busca de itens:', error.message);
      throw new Error(`Falha na busca: ${error.message}`);
    }
  }

  /**
   * Busca detalhes de itens por hashes (Etapa 2: GET /api/trade2/fetch/{hashes})
   */
  async fetchItemDetails(hashes, queryId = null) {
    try {
      if (!hashes || hashes.length === 0) {
        return { result: [] };
      }
      
      // Converte array em string separada por vírgulas
      const hashString = Array.isArray(hashes) ? hashes.join(',') : hashes;
      
      let url = `/api/trade2/fetch/${hashString}`;
      if (queryId) {
        url += `?query=${queryId}`;
      }
      
      const response = await this.client.get(url);
      
      // Converte os dados brutos em objetos MarketItem
      const marketItems = response.data.result?.map(item => new MarketItem(item)) || [];
      
      return {
        result: marketItems,
        total: response.data.total || marketItems.length
      };
    } catch (error) {
      console.error('Erro ao buscar detalhes dos itens:', error.message);
      throw new Error(`Falha ao buscar detalhes: ${error.message}`);
    }
  }

  /**
   * Busca completa: combina search + fetch
   */
  async searchAndFetchItems(query, league = 'Standard', maxResults = 20) {
    try {
      // Etapa 1: Buscar IDs
      const searchResult = await this.searchForItems(query, league);
      
      if (!searchResult.result || searchResult.result.length === 0) {
        return {
          items: [],
          total: 0,
          queryId: searchResult.queryId
        };
      }
      
      // Pega apenas os primeiros resultados conforme solicitado
      const hashesToFetch = searchResult.result.slice(0, maxResults);
      
      // Etapa 2: Buscar detalhes
      const itemDetails = await this.fetchItemDetails(hashesToFetch, searchResult.queryId);
      
      return {
        items: itemDetails.result,
        total: searchResult.total,
        queryId: searchResult.queryId,
        fetched: hashesToFetch.length
      };
    } catch (error) {
      console.error('Erro na busca completa:', error.message);
      throw error;
    }
  }

  /**
   * Obtém a lista de ligas disponíveis do Path of Exile 2
   */
  async getLeagues() {
    if (this.cache.leagues) {
      return this.cache.leagues;
    }
    
    try {
      // Usando a API do PoE2 em vez do PoE1
      const response = await this.client.get('/api/trade2/data/leagues');
      this.cache.leagues = response.data;
      return this.cache.leagues;
    } catch (error) {
      console.error('Erro ao buscar ligas:', error.message);
      throw new Error(`Falha ao buscar ligas: ${error.message}`);
    }
  }

  /**
   * Obtém a lista de stats pesquisáveis do Path of Exile 2
   */
  async getStats() {
    if (this.cache.stats) {
      return this.cache.stats;
    }
    
    try {
      // Usando a API do PoE2 em vez do PoE1
      const response = await this.client.get('/api/trade2/data/stats');
      this.cache.stats = response.data;
      return this.cache.stats;
    } catch (error) {
      console.error('Erro ao buscar stats:', error.message);
      throw new Error(`Falha ao buscar stats: ${error.message}`);
    }
  }

  /**
   * Obtém a lista de itens pesquisáveis do Path of Exile 2
   */
  async getItems() {
    if (this.cache.items) {
      return this.cache.items;
    }
    
    try {
      const response = await this.client.get('/api/trade2/data/items');
      this.cache.items = response.data;
      return this.cache.items;
    } catch (error) {
      console.error('Erro ao buscar itens:', error.message);
      throw new Error(`Falha ao buscar itens: ${error.message}`);
    }
  }

  /**
   * Constrói um payload de busca básico
   */
  buildBasicQuery(options = {}) {
    const query = {
      query: {
        status: { option: options.onlineOnly !== false ? 'online' : 'any' },
        filters: {},
        stats: []
      },
      sort: { price: 'asc' }
    };

    // Filtros de tipo de item
    if (options.itemType) {
      query.query.filters.type_filters = {
        filters: {
          category: { option: options.itemType }
        }
      };
    }

    // Filtros diversos
    if (options.minItemLevel) {
      query.query.filters.misc_filters = {
        filters: {
          ilvl: { min: options.minItemLevel }
        }
      };
    }

    // Stats (modificadores)
    if (options.stats && options.stats.length > 0) {
      query.query.stats.push({
        type: 'and',
        filters: options.stats.map(stat => ({
          id: stat.id,
          value: {
            min: stat.min || undefined,
            max: stat.max || undefined
          },
          disabled: stat.disabled || false
        }))
      });
    }

    // Filtros de preço
    if (options.maxPrice) {
      query.query.filters.trade_filters = {
        filters: {
          price: {
            max: options.maxPrice,
            option: options.priceCurrency || 'chaos'
          }
        }
      };
    }

    return query;
  }

  /**
   * Exemplo de busca complexa (para testes e referência)
   */
  buildComplexQuery() {
    return {
      query: {
        status: { option: 'online' },
        filters: {
          type_filters: {
            filters: {
              category: { option: 'armour.chest' }
            }
          },
          misc_filters: {
            filters: {
              ilvl: { min: 85 }
            }
          }
        },
        stats: [
          {
            type: 'and',
            filters: [
              {
                id: 'explicit.stat_3299347043', // +# to maximum Life
                value: { min: 90 },
                disabled: false
              },
              {
                id: 'explicit.stat_4220027924', // +# to maximum Energy Shield
                value: { min: 100 },
                disabled: false
              }
            ]
          }
        ]
      },
      sort: { price: 'asc' }
    };
  }

  /**
   * Limpa o cache
   */
  clearCache() {
    this.cache = {
      leagues: null,
      stats: null,
      items: null
    };
  }

  /**
   * Obtém estatísticas do cliente
   */
  getStats() {
    return {
      requestsMade: this.requestTimes.length,
      authentication: this.getAuthenticationStatus(),
      cacheStatus: {
        leagues: !!this.cache.leagues,
        stats: !!this.cache.stats,
        items: !!this.cache.items
      },
      rateLimit: this.rateLimit
    };
  }
}
