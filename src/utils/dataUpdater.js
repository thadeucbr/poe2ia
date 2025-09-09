import { exec } from 'child_process';
import fs from 'fs';
import path from 'path';
import { promisify } from 'util';

const execAsync = promisify(exec);

/**
 * Utilitário para atualizar os dados do RePoE
 * Gerencia o download e sincronização dos dados do jogo
 */
export class DataUpdater {
  constructor(options = {}) {
    this.repoUrl = options.repoUrl || 'https://github.com/RePoE/RePoE.git';
    this.localDataPath = options.localDataPath || './repoe-fork';
    this.branch = options.branch || 'main';
    this.timeout = options.timeout || 300000; // 5 minutos
  }

  /**
   * Atualiza os dados clonando ou fazendo pull do repositório
   */
  async updateData() {
    try {
      console.log('Verificando dados existentes...');
      
      // Primeiro verifica se os dados já existem localmente
      const validation = await this.validateData();
      if (validation.isValid) {
        console.log('Dados locais válidos encontrados, usando dados existentes...');
        return {
          success: true,
          timestamp: new Date().toISOString(),
          validation,
          source: 'local'
        };
      }
      
      console.log('Dados locais não encontrados ou inválidos. Tentando atualizar...');
      
      if (await this.repositoryExists()) {
        console.log('Repositório existe, fazendo pull...');
        await this.pullRepository();
      } else {
        console.log('Repositório não existe, clonando...');
        await this.cloneRepository();
      }
      
      console.log('Dados atualizados com sucesso!');
      
      // Valida os dados após atualização
      const updatedValidation = await this.validateData();
      if (!updatedValidation.isValid) {
        throw new Error(`Dados inválidos após atualização: ${updatedValidation.errors.join(', ')}`);
      }
      
      return {
        success: true,
        timestamp: new Date().toISOString(),
        validation: updatedValidation,
        source: 'remote'
      };
      
    } catch (error) {
      console.error('Erro ao atualizar dados:', error);
      return {
        success: false,
        error: error.message,
        timestamp: new Date().toISOString()
      };
    }
  }

  /**
   * Verifica se o repositório local já existe
   */
  async repositoryExists() {
    try {
      const gitPath = path.join(this.localDataPath, '.git');
      return fs.existsSync(gitPath);
    } catch (error) {
      return false;
    }
  }

  /**
   * Clona o repositório
   */
  async cloneRepository() {
    try {
      // Remove diretório se existir
      if (fs.existsSync(this.localDataPath)) {
        fs.rmSync(this.localDataPath, { recursive: true, force: true });
      }
      
      const command = `git clone --depth 1 --branch ${this.branch} ${this.repoUrl} ${this.localDataPath}`;
      console.log(`Executando: ${command}`);
      
      const { stdout, stderr } = await execAsync(command, { 
        timeout: this.timeout,
        maxBuffer: 1024 * 1024 * 10 // 10MB buffer
      });
      
      if (stderr && !stderr.includes('Cloning into')) {
        console.warn('Git stderr:', stderr);
      }
      
      console.log('Clone concluído');
      
    } catch (error) {
      throw new Error(`Falha ao clonar repositório: ${error.message}`);
    }
  }

  /**
   * Atualiza repositório existente
   */
  async pullRepository() {
    try {
      const commands = [
        `cd ${this.localDataPath} && git fetch origin ${this.branch}`,
        `cd ${this.localDataPath} && git reset --hard origin/${this.branch}`,
        `cd ${this.localDataPath} && git clean -fd`
      ];
      
      for (const command of commands) {
        console.log(`Executando: ${command}`);
        const { stdout, stderr } = await execAsync(command, { timeout: this.timeout });
        
        if (stderr && !stderr.includes('Already up to date')) {
          console.warn('Git stderr:', stderr);
        }
      }
      
      console.log('Pull concluído');
      
    } catch (error) {
      throw new Error(`Falha ao atualizar repositório: ${error.message}`);
    }
  }

  /**
   * Valida se os dados essenciais estão presentes
   */
  async validateData() {
    const errors = [];
    const requiredFiles = [
      'data/base_items.json',
      'data/mods.json',
      'data/stat_translations/stat_descriptions.json',
      'data/item_classes.json',
      'data/tags.json'
    ];

    try {
      for (const file of requiredFiles) {
        const filePath = path.join(this.localDataPath, file);
        
        if (!fs.existsSync(filePath)) {
          errors.push(`Arquivo obrigatório não encontrado: ${file}`);
          continue;
        }
        
        // Verifica se o arquivo não está vazio
        const stats = fs.statSync(filePath);
        if (stats.size === 0) {
          errors.push(`Arquivo vazio: ${file}`);
          continue;
        }
        
        // Verifica se é JSON válido
        try {
          const content = fs.readFileSync(filePath, 'utf8');
          JSON.parse(content);
        } catch (jsonError) {
          errors.push(`JSON inválido em ${file}: ${jsonError.message}`);
        }
      }
      
      // Validações adicionais
      const validation = await this.validateDataContent();
      errors.push(...validation.errors);
      
      return {
        isValid: errors.length === 0,
        errors,
        filesChecked: requiredFiles.length,
        timestamp: new Date().toISOString()
      };
      
    } catch (error) {
      return {
        isValid: false,
        errors: [`Erro na validação: ${error.message}`],
        filesChecked: 0,
        timestamp: new Date().toISOString()
      };
    }
  }

  /**
   * Valida o conteúdo dos arquivos de dados
   */
  async validateDataContent() {
    const errors = [];
    
    try {
      // Valida base_items.json
      const baseItemsPath = path.join(this.localDataPath, 'data/base_items.json');
      const baseItems = JSON.parse(fs.readFileSync(baseItemsPath, 'utf8'));
      
      if (Object.keys(baseItems).length === 0) {
        errors.push('base_items.json está vazio');
      }
      
      // Verifica estrutura de um item
      const firstItem = Object.values(baseItems)[0];
      if (!firstItem || !firstItem.name || !firstItem.item_class) {
        errors.push('Estrutura inválida em base_items.json');
      }
      
      // Valida mods.json
      const modsPath = path.join(this.localDataPath, 'data/mods.json');
      const mods = JSON.parse(fs.readFileSync(modsPath, 'utf8'));
      
      if (Object.keys(mods).length === 0) {
        errors.push('mods.json está vazio');
      }
      
      // Verifica estrutura de um mod
      const firstMod = Object.values(mods)[0];
      if (!firstMod || !firstMod.name || !firstMod.generation_type) {
        errors.push('Estrutura inválida em mods.json');
      }
      
      console.log(`Validação de conteúdo: ${Object.keys(baseItems).length} itens base, ${Object.keys(mods).length} mods`);
      
    } catch (error) {
      errors.push(`Erro na validação de conteúdo: ${error.message}`);
    }
    
    return { errors };
  }

  /**
   * Obtém informações sobre a versão atual dos dados
   */
  async getDataInfo() {
    try {
      if (!await this.repositoryExists()) {
        return {
          exists: false,
          message: 'Repositório não encontrado'
        };
      }
      
      const commands = [
        `cd ${this.localDataPath} && git rev-parse HEAD`,
        `cd ${this.localDataPath} && git log -1 --format="%cd" --date=iso`,
        `cd ${this.localDataPath} && git log -1 --format="%s"`
      ];
      
      const [commitHash, commitDate, commitMessage] = await Promise.all(
        commands.map(cmd => execAsync(cmd).then(result => result.stdout.trim()))
      );
      
      const validation = await this.validateData();
      
      return {
        exists: true,
        commitHash: commitHash.substring(0, 8),
        commitDate,
        commitMessage,
        validation,
        lastUpdated: fs.statSync(this.localDataPath).mtime
      };
      
    } catch (error) {
      return {
        exists: false,
        error: error.message
      };
    }
  }

  /**
   * Força uma atualização completa (remove e clona novamente)
   */
  async forceUpdate() {
    try {
      console.log('Forçando atualização completa...');
      
      if (fs.existsSync(this.localDataPath)) {
        fs.rmSync(this.localDataPath, { recursive: true, force: true });
      }
      
      return await this.updateData();
      
    } catch (error) {
      console.error('Erro na atualização forçada:', error);
      return {
        success: false,
        error: error.message,
        timestamp: new Date().toISOString()
      };
    }
  }
}

// Script de linha de comando se executado diretamente
if (import.meta.url === `file://${process.argv[1]}`) {
  const updater = new DataUpdater();
  
  const command = process.argv[2] || 'update';
  
  switch (command) {
    case 'update':
      updater.updateData().then(result => {
        console.log('Resultado da atualização:', result);
        process.exit(result.success ? 0 : 1);
      });
      break;
      
    case 'info':
      updater.getDataInfo().then(info => {
        console.log('Informações dos dados:', JSON.stringify(info, null, 2));
      });
      break;
      
    case 'validate':
      updater.validateData().then(validation => {
        console.log('Validação:', JSON.stringify(validation, null, 2));
        process.exit(validation.isValid ? 0 : 1);
      });
      break;
      
    case 'force':
      updater.forceUpdate().then(result => {
        console.log('Resultado da atualização forçada:', result);
        process.exit(result.success ? 0 : 1);
      });
      break;
      
    default:
      console.log('Comandos disponíveis: update, info, validate, force');
      process.exit(1);
  }
}
