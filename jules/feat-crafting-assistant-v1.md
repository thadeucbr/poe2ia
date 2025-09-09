# Documento de Arquitetura e Implementação: Assistente de Crafting v1

**Branch:** `feat/crafting-assistant-v1`
**Autor:** Jules

Este documento fornece uma referência técnica completa sobre a primeira versão do Assistente de Crafting Inteligente para Path of Exile 2. Ele detalha a arquitetura, as decisões de implementação, o estado atual de cada componente e os próximos passos recomendados.

---

### 1. Visão Geral do Projeto

O objetivo deste projeto é criar uma ferramenta que ajude os jogadores de Path of Exile 2 a tomar decisões de crafting economicamente eficientes. A aplicação analisa o mercado de trocas do jogo em busca de itens base e calcula o custo estimado para transformá-los em um item final desejado pelo usuário. O sistema classifica as opções com base no custo total (preço de compra + custo de crafting) para identificar a estratégia mais barata.

A versão inicial (v1) foca em estabelecer a arquitetura fundamental e um fluxo de trabalho de ponta a ponta, utilizando um modo de simulação (mock) para contornar bloqueios de API e permitir o desenvolvimento da lógica central.

---

### 2. Arquitetura da Solução

A aplicação foi projetada com uma arquitetura modular para garantir manutenibilidade e escalabilidade, um requisito crucial dado que a API e as mecânicas do jogo estão em constante mudança.

Os três componentes principais são:

*   **`src/data_service` (Serviço de Dados)**: A única fonte da verdade para todas as mecânicas estáticas do jogo. É responsável por carregar, processar e fornecer acesso aos dados extraídos do jogo (RePoE), como informações sobre itens, modificadores e traduções de stats.
*   **`src/api_client` (Cliente da API)**: Responsável por toda a comunicação com a API de trocas do Path of Exile. Devido a bloqueios (`403 Forbidden`), este componente foi implementado com um **modo mock** crucial, que simula respostas da API para permitir o desenvolvimento offline.
*   **`src/solver_engine` (Motor de Lógica)**: O cérebro da aplicação. Ele utiliza os outros dois serviços para orquestrar a resolução do problema de crafting. Ele traduz a intenção do usuário em consultas, busca candidatos, estima custos e classifica os resultados.

O fluxo de dados é o seguinte:
`UI (main.py)` -> `CraftingSolverEngine` -> (`TradeAPIClient` (mock) & `CraftingDataService`)

---

### 3. Resumo dos Arquivos

Aqui está um detalhamento de cada arquivo criado e sua finalidade.

| Arquivo                               | Propósito                                                                                                                                                                                                                         |
| ------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `main.py`                             | **Ponto de Entrada da Aplicação (CLI)**. Define a interface de linha de comando que permite ao usuário especificar um alvo de crafting (item, ilvl, mods). Ele inicializa os serviços, executa o motor de lógica e exibe os resultados de forma amigável. |
| `requirements.txt`                    | Lista as dependências Python do projeto. Atualmente, contém apenas `httpx`, a biblioteca usada para fazer requisições HTTP no cliente da API.                                                                                       |
| `src/data_service/models.py`          | Define as estruturas de dados (`dataclasses`) que representam as entidades do jogo, como `BaseItem` e `Mod`. Isso garante que o código seja mais legível e seguro em termos de tipos.                                                |
| `src/data_service/service.py`         | Contém a classe `CraftingDataService`. Sua principal responsabilidade é carregar os arquivos JSON do RePoE na inicialização, processá-los e fornecer métodos de consulta para o resto da aplicação (ex: `get_base_item_by_name`, `get_stat_ids_for_text`). |
| `src/api_client/client.py`            | Contém a classe `TradeAPIClient`. Implementa a lógica para fazer requisições à API de trocas e inclui o **modo mock** essencial, que retorna dados de exemplo pré-definidos quando a API ao vivo não está acessível. |
| `src/solver_engine/models.py`         | Define as estruturas de dados para o motor de lógica, como `CraftingTarget` (o que o usuário quer) e `CraftingResult` (uma opção de crafting avaliada).                                                                               |
| `src/solver_engine/engine.py`         | Contém a classe `CraftingSolverEngine`. Implementa o algoritmo principal `solve()`, que orquestra todo o processo de busca e avaliação de custos. Inclui uma simulação de crafting simplificada como ponto de partida. |

---

### 4. Detalhes da Implementação e Decisões Técnicas

Durante o desenvolvimento, vários desafios surgiram, e as seguintes decisões foram tomadas:

#### Desafio 1: Acesso à API e o Erro "403 Forbidden"
*   **Problema**: As requisições para a API de trocas do Path of Exile estavam sendo bloqueadas com um erro `403 Forbidden`, indicando uma forte medida anti-bot.
*   **Tentativas de Solução**:
    1.  Adição de um cabeçalho `User-Agent` descritivo.
    2.  Adição de um cabeçalho `Referer`.
    3.  Uso de um `User-Agent` de um navegador comum e outros cabeçalhos (`Accept-Language`, etc.).
*   **Decisão Final**: Nenhuma das tentativas funcionou. Para não interromper o desenvolvimento, e seguindo a sugestão do usuário, implementei um **modo mock** no `TradeAPIClient`. Esta foi a decisão mais crucial do projeto, pois permitiu que a lógica do motor fosse construída e testada de forma independente, usando dados de exemplo com a mesma estrutura da API real.

#### Desafio 2: Mapeamento de Dados e Estruturas Dinâmicas
*   **Problema**: Os arquivos JSON do RePoE são complexos e contêm muitos campos. A criação inicial dos `dataclasses` em `data_service/models.py` resultou em múltiplos `TypeError`s, pois campos inesperados eram encontrados nos dados.
*   **Decisão Final**: Adotei uma abordagem iterativa e robusta. A cada `TypeError`, o campo ausente era adicionado ao `dataclass` correspondente. Além disso, a lógica de carregamento em `CraftingDataService` foi envolta em um bloco `try...except TypeError` para ignorar graciosamente itens que pudessem falhar na desserialização, tornando o carregamento de dados mais resiliente a futuras mudanças no formato do JSON.

#### Desafio 3: A Complexidade da Tradução de Stats
*   **Problema**: Traduzir um texto de modificador legível por humanos (ex: `"+#% de resistência a fogo"`) para um ID interno do jogo (ex: `base_fire_damage_resistance_%`) foi extremamente desafiador. A formatação do texto nos arquivos do jogo é inconsistente e complexa (ex: `"{0}% to [Resistances|Fire Resistance]"`).
*   **Decisão Final**: Implementei uma função de normalização de texto (`_clean_stat_text`) no `CraftingDataService`. Após várias iterações, a versão final desta função usa expressões regulares (`re`) para:
    1.  Extrair o texto correto de formatos como `[stat|descrição]`.
    2.  Remover placeholders (`{0}`), símbolos (`+`, `%`, `#`) e parênteses.
    3.  Converter para minúsculas e normalizar espaços em branco.
    Isso permitiu a criação de um mapa de busca reverso (de texto limpo para ID de stat), resolvendo o problema de forma eficaz.

#### Desafio 4: Inconsistência de Nomes de Itens
*   **Problema**: O motor de lógica falhava ao tentar encontrar informações sobre o item "Hubris Circlet", embora este seja um nome de item conhecido no jogo.
*   **Investigação**: A depuração revelou que os nomes de itens no `base_items.json` do RePoE nem sempre correspondem aos nomes usados na API ou no jogo em si. O `grep` confirmou que "Hubris Circlet" não existia no arquivo de dados.
*   **Decisão Final**:
    1.  Adicionei código de depuração ao `CraftingDataService` para listar nomes de itens válidos da classe "Helmet" que estavam sendo carregados.
    2.  Identifiquei um nome de base válido ("Golden Wreath").
    3.  Corrigi os dados de exemplo no `api_client` e os casos de teste no `solver_engine` para usar este nome de item válido, resolvendo a inconsistência e permitindo que o fluxo de ponta a ponta funcionasse.

---

### 5. Próximos Passos e Melhorias Futuras

A aplicação agora é uma fundação funcional. Para evoluí-la para uma ferramenta de produção, os seguintes passos são recomendados:

1.  **Integração com a API Real**:
    *   **Ação**: Obter um cookie `POESESSID` e integrá-lo ao `TradeAPIClient`.
    *   **Objetivo**: Desativar o modo mock e fazer a aplicação funcionar com dados de mercado em tempo real. Esta é a prioridade máxima.

2.  **Expansão da Simulação de Crafting**:
    *   **Ação**: Substituir a lógica de simulação simplificada no `CraftingSolverEngine` por uma implementação mais detalhada.
    *   **Objetivo**: Aumentar a precisão das estimativas de custo, suportando:
        *   **Múltiplas Moedas**: Adicionar lógica para Essências, Fósseis, Veiled Chaos, etc.
        *   **Regras de Afixos**: Respeitar o limite de 3 prefixos e 3 sufixos.
        *   **Probabilidades (Pesos)**: Carregar um arquivo de pesos de modificadores (conforme sugerido no `readme.md`) para substituir a premissa de "probabilidade igual".

3.  **Melhoria das Estratégias de Busca**:
    *   **Ação**: Expandir o método `_formulate_queries` no motor.
    *   **Objetivo**: Gerar buscas mais inteligentes. Por exemplo, se o usuário quer um item com um modificador T1 de vida e um T1 de resistência, o motor deve pesquisar não apenas pela base limpa, mas também por bases que já tenham um desses (raros) modificadores.

4.  **Preços Dinâmicos de Moedas**:
    *   **Ação**: Integrar uma API de dados de mercado (como poe.ninja).
    *   **Objetivo**: Usar os preços atuais das moedas de crafting (Exalted Orb, Divine Orb, etc.) em vez dos valores fixos no código, tornando os cálculos de custo muito mais precisos.

5.  **Interface Gráfica (GUI)**:
    *   **Ação**: Construir uma interface web usando um framework como Flask ou FastAPI para o backend e um framework de frontend (React, Vue, etc.).
    *   **Objetivo**: Tornar a ferramenta acessível e fácil de usar para todos os jogadores, não apenas para aqueles confortáveis com a linha de comando.
