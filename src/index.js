import express from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';

import { CraftingDataService } from './services/CraftingDataService.js';
import { TradeAPIClient } from './services/TradeAPIClient.js';
import { CraftingSolverEngine } from './engines/CraftingSolverEngine.js';
import { CraftingTarget, TargetAffix } from './models/index.js';
import { DataUpdater } from './utils/dataUpdater.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Servidor principal da aplicação
 */
class PoE2CraftingServer {
  constructor() {
    this.app = express();
    this.port = process.env.PORT || 3000;
    
    // Inicializar serviços
    this.dataService = new CraftingDataService(
      path.join(__dirname, '../repoe-fork/data')
    );
    this.tradeClient = new TradeAPIClient();
    this.craftingEngine = new CraftingSolverEngine(this.dataService, this.tradeClient);
    this.dataUpdater = new DataUpdater({
      localDataPath: path.join(__dirname, '../repoe-fork')
    });
    
    this.setupMiddleware();
    this.setupRoutes();
    this.isReady = false;
  }

  /**
   * Configura middleware do Express
   */
  setupMiddleware() {
    this.app.use(cors());
    this.app.use(express.json({ limit: '10mb' }));
    this.app.use(express.static(path.join(__dirname, 'ui')));
    
    // Middleware de logging
    this.app.use((req, res, next) => {
      console.log(`${new Date().toISOString()} - ${req.method} ${req.path}`);
      next();
    });
  }

  /**
   * Configura as rotas da API
   */
  setupRoutes() {
    // Rota de saúde
    this.app.get('/api/health', (req, res) => {
      res.json({
        status: 'ok',
        timestamp: new Date().toISOString(),
        ready: this.isReady,
        services: {
          dataService: this.dataService.isInitialized,
          tradeClient: this.tradeClient.getStats(),
          craftingEngine: this.craftingEngine.getEngineStats()
        }
      });
    });

    // Rota para obter taxas de câmbio atualizadas
    this.app.get('/api/currency-rates/:league?', async (req, res) => {
      try {
        const league = req.params.league || 'Standard';
        
        // Atualiza as taxas de câmbio no engine
        const rates = await this.craftingEngine.updateCurrencyRates(league);
        
        res.json({
          success: true,
          league: league,
          rates: rates,
          timestamp: Date.now(),
          message: 'Taxas de câmbio atualizadas com sucesso'
        });
      } catch (error) {
        console.error('Erro ao obter taxas de câmbio:', error);
        res.status(500).json({
          success: false,
          error: 'Erro interno do servidor ao obter taxas de câmbio',
          details: error.message
        });
      }
    });

    // Rota para conversão de moedas
    this.app.post('/api/convert-currency', async (req, res) => {
      try {
        const { amount, fromCurrency, toCurrency, league } = req.body;
        
        if (!amount || !fromCurrency || !toCurrency) {
          return res.status(400).json({
            success: false,
            error: 'Parâmetros obrigatórios: amount, fromCurrency, toCurrency'
          });
        }
        
        // Garante que temos taxas atualizadas
        await this.craftingEngine.updateCurrencyRates(league || 'Standard');
        
        const convertedAmount = this.craftingEngine.convertCurrency(amount, fromCurrency, toCurrency);
        
        res.json({
          success: true,
          originalAmount: amount,
          fromCurrency,
          toCurrency,
          convertedAmount,
          league: league || 'Standard'
        });
      } catch (error) {
        console.error('Erro ao converter moeda:', error);
        res.status(500).json({
          success: false,
          error: 'Erro interno do servidor ao converter moeda',
          details: error.message
        });
      }
    });

    // Rota principal de crafting
    this.app.post('/api/solve-craft', async (req, res) => {
      try {
        if (!this.isReady) {
          return res.status(503).json({
            error: 'Serviço ainda inicializando. Tente novamente em alguns segundos.'
          });
        }

        const { baseItem, targetAffixes, options = {} } = req.body;
        
        if (!baseItem || !targetAffixes || targetAffixes.length === 0) {
          return res.status(400).json({
            error: 'baseItem e targetAffixes são obrigatórios'
          });
        }

        // Criar alvo de crafting
        const craftingTarget = new CraftingTarget({
          base_item_name: baseItem,
          target_affixes: targetAffixes.map(affix => new TargetAffix(affix)),
          min_ilvl: options.minItemLevel || 1,
          league: options.league || 'Standard',
          online_only: options.onlineOnly !== false,
          max_price: options.maxPrice,
          price_currency: options.priceCurrency || 'chaos',
          required_open_affixes: options.requiredOpenAffixes || { prefix: 0, suffix: 0 }
        });

        // Executar análise
        const result = await this.craftingEngine.solveCraft(craftingTarget);
        
        res.json(result);
        
      } catch (error) {
        console.error('Erro na análise:', error);
        res.status(500).json({
          error: 'Erro interno do servidor',
          message: error.message
        });
      }
    });

    // Rotas de dados
    this.app.get('/api/base-items', (req, res) => {
      try {
        const { search, category, limit = 50 } = req.query;
        
        const criteria = {};
        if (search) criteria.name = search;
        if (category) criteria.itemClass = category;
        
        const items = this.dataService.searchBaseItems(criteria)
          .slice(0, parseInt(limit))
          .map(item => ({
            name: item.name,
            itemClass: item.itemClass,
            dropLevel: item.dropLevel,
            tags: item.tags
          }));
        
        res.json({ items, total: items.length });
        
      } catch (error) {
        console.error('Erro ao buscar itens base:', error);
        res.status(500).json({ error: error.message });
      }
    });

    this.app.get('/api/mods', (req, res) => {
      try {
        const { type, item, search, limit = 50 } = req.query;
        
        let mods = [];
        
        if (item) {
          const baseItem = this.dataService.getBaseItemByName(item);
          if (baseItem) {
            mods = this.dataService.getModsForItem(baseItem);
          }
        } else if (type) {
          mods = this.dataService.getModsByType(type);
        }
        
        if (search) {
          mods = mods.filter(mod => 
            mod.name.toLowerCase().includes(search.toLowerCase())
          );
        }
        
        const limitedMods = mods.slice(0, parseInt(limit)).map(mod => ({
          id: mod.id,
          name: mod.name,
          type: mod.generationType,
          requiredLevel: mod.requiredLevel
        }));
        
        res.json({ mods: limitedMods, total: limitedMods.length });
        
      } catch (error) {
        console.error('Erro ao buscar modificadores:', error);
        res.status(500).json({ error: error.message });
      }
    });

    this.app.get('/api/leagues', async (req, res) => {
      try {
        const leagues = await this.tradeClient.getLeagues();
        res.json(leagues);
      } catch (error) {
        console.error('Erro ao buscar ligas:', error);
        res.status(500).json({ error: error.message });
      }
    });

    // Rota para obter moedas disponíveis
    this.app.get('/api/currencies', async (req, res) => {
      try {
        // Obtém taxas atualizadas de câmbio
        const rates = await this.craftingEngine.getCurrencyRates('Standard');
        
        // Converte taxas para formato amigável (mostra quantas de cada moeda valem 1 exalted)
        const currencyList = Object.keys(rates).map(currencyId => ({
          id: currencyId,
          name: this.getCurrencyDisplayName(currencyId),
          symbol: currencyId,
          rate: rates[currencyId],
          displayText: currencyId === 'exalted' 
            ? 'Exalted Orb (base)'
            : `${this.getCurrencyDisplayName(currencyId)} (1 ex = ${rates[currencyId]})`
        }));
        
        res.json({ currencies: currencyList });
      } catch (error) {
        console.error('Erro ao buscar moedas:', error);
        res.status(500).json({ error: error.message });
      }
    });

    // Rota de estatísticas dos dados
    this.app.get('/api/stats', (req, res) => {
      try {
        const stats = this.dataService.getStats();
        const tradeStats = this.tradeClient.getStats();
        const engineStats = this.craftingEngine.getEngineStats();
        
        res.json({
          dataService: stats,
          tradeClient: tradeStats,
          craftingEngine: engineStats,
          server: {
            ready: this.isReady,
            uptime: process.uptime(),
            memoryUsage: process.memoryUsage()
          }
        });
      } catch (error) {
        console.error('Erro ao obter estatísticas:', error);
        res.status(500).json({ error: error.message });
      }
    });

    // Rotas de autenticação
    this.app.post('/api/auth/set-session', (req, res) => {
      try {
        const { poesessid } = req.body;
        
        if (!poesessid || typeof poesessid !== 'string') {
          return res.status(400).json({
            error: 'POESESSID é obrigatório e deve ser uma string'
          });
        }
        
        // Valida formato básico do POESESSID (32 caracteres hexadecimais)
        if (!/^[a-f0-9]{32}$/i.test(poesessid)) {
          return res.status(400).json({
            error: 'POESESSID deve ter 32 caracteres hexadecimais'
          });
        }
        
        this.tradeClient.setAuthentication(poesessid);
        
        res.json({
          success: true,
          message: 'Autenticação configurada com sucesso',
          status: this.tradeClient.getAuthenticationStatus()
        });
        
      } catch (error) {
        console.error('Erro ao configurar autenticação:', error);
        res.status(500).json({ error: error.message });
      }
    });

    this.app.delete('/api/auth/clear-session', (req, res) => {
      try {
        this.tradeClient.clearAuthentication();
        
        res.json({
          success: true,
          message: 'Autenticação removida com sucesso',
          status: this.tradeClient.getAuthenticationStatus()
        });
        
      } catch (error) {
        console.error('Erro ao remover autenticação:', error);
        res.status(500).json({ error: error.message });
      }
    });

    this.app.get('/api/auth/status', (req, res) => {
      try {
        const status = this.tradeClient.getAuthenticationStatus();
        res.json(status);
      } catch (error) {
        console.error('Erro ao obter status de autenticação:', error);
        res.status(500).json({ error: error.message });
      }
    });

    // Rotas administrativas
    this.app.get('/api/admin/data-info', async (req, res) => {
      try {
        const info = await this.dataUpdater.getDataInfo();
        const stats = this.dataService.getStats();
        
        res.json({
          dataInfo: info,
          serviceStats: stats
        });
        
      } catch (error) {
        console.error('Erro ao obter informações dos dados:', error);
        res.status(500).json({ error: error.message });
      }
    });

    this.app.post('/api/admin/update-data', async (req, res) => {
      try {
        const { force = false } = req.body;
        
        const result = force 
          ? await this.dataUpdater.forceUpdate()
          : await this.dataUpdater.updateData();
        
        if (result.success) {
          // Reinicializa o serviço de dados
          await this.dataService.initialize();
        }
        
        res.json(result);
        
      } catch (error) {
        console.error('Erro ao atualizar dados:', error);
        res.status(500).json({ error: error.message });
      }
    });

    // Rota catch-all para SPA
    this.app.get('*', (req, res) => {
      res.sendFile(path.join(__dirname, 'ui', 'index.html'));
    });
  }

  /**
   * Inicializa todos os serviços
   */
  async initialize() {
    try {
      console.log('Inicializando servidor PoE2 Crafting Assistant...');
      
      // Verifica se os dados existem
      const dataInfo = await this.dataUpdater.getDataInfo();
      if (!dataInfo.exists || !dataInfo.validation?.isValid) {
        console.log('Dados não encontrados ou inválidos. Tentando baixar...');
        try {
          await this.dataUpdater.updateData();
        } catch (updateError) {
          console.warn('Falha ao atualizar dados remotos, tentando usar dados locais...', updateError.message);
        }
      }
      
      // Inicializa o serviço de dados
      console.log('Inicializando CraftingDataService...');
      await this.dataService.initialize();
      
      this.isReady = true;
      console.log('Servidor inicializado com sucesso!');
      
    } catch (error) {
      console.error('Erro na inicialização:', error);
      throw error;
    }
  }

  /**
   * Retorna o nome amigável de uma moeda
   */
  getCurrencyDisplayName(currencyId) {
    const currencyNames = {
      'chaos': 'Chaos Orb',
      'exalted': 'Exalted Orb',
      'divine': 'Divine Orb',
      'mirror': 'Mirror of Kalandra',
      'wisdom': 'Scroll of Wisdom',
      'transmute': 'Orb of Transmutation',
      'aug': 'Orb of Augmentation',
      'chance': 'Orb of Chance',
      'alch': 'Orb of Alchemy',
      'regal': 'Regal Orb',
      'vaal': 'Vaal Orb',
      'annul': 'Orb of Annulment',
      'artificers': 'Artificer\'s Orb',
      'essence_tier1': 'Essence (Tier 1)',
      'essence_tier2': 'Essence (Tier 2)',
      'essence_tier3': 'Essence (Tier 3)',
      'annulment': 'Orb of Annulment',
      'ancient': 'Ancient Orb'
    };
    
    return currencyNames[currencyId] || currencyId.charAt(0).toUpperCase() + currencyId.slice(1);
  }

  /**
   * Inicia o servidor
   */
  async start() {
    try {
      await this.initialize();
      
      this.app.listen(this.port, () => {
        console.log(`\\n🚀 PoE2 Crafting Assistant rodando na porta ${this.port}`);
        console.log(`📊 Dashboard: http://localhost:${this.port}`);
        console.log(`🔧 API: http://localhost:${this.port}/api`);
        console.log(`❤️  Health Check: http://localhost:${this.port}/api/health\\n`);
      });
      
    } catch (error) {
      console.error('Falha ao iniciar servidor:', error);
      process.exit(1);
    }
  }

  /**
   * Para o servidor graciosamente
   */
  async stop() {
    console.log('Parando servidor...');
    // Cleanup se necessário
    process.exit(0);
  }
}

// Tratamento de sinais para shutdown gracioso
const server = new PoE2CraftingServer();

process.on('SIGINT', () => server.stop());
process.on('SIGTERM', () => server.stop());

// Inicia o servidor se executado diretamente
if (import.meta.url === `file://${process.argv[1]}`) {
  server.start();
}

export default PoE2CraftingServer;
