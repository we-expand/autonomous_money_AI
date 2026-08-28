# Contexto do projeto — autonomous_money_ai

> Este arquivo existe pra você (ou uma sessão futura do Claude) retomar o
> projeto sem precisar reconstruir o raciocínio do zero. Última atualização:
> 28/08/2026, no fim de uma sessão longa de setup + primeiros testes reais.

## De onde isso veio

Você perguntou sobre o **"Sigil Wen Automaton"** — um projeto real que
viralizou nas redes: Sigil Wen (Thiel Fellow) anunciou um agente de IA
("Automaton") que roda sobre uma infraestrutura chamada **Conway**, com
carteira cripto própria, capaz de pagar pelo próprio compute e "ganhar sua
própria existência" — narrativa de "Web 4.0". Vitalik Buterin criticou
publicamente a ideia.

Você quis testar, na prática, com dinheiro fictício (e depois real, em
pequena escala), **o que desse conceito é real e o que é só narrativa**.
Este repositório é o resultado.

## Estado atual: FUNCIONANDO end-to-end

Repositório: https://github.com/we-expand/autonomous_money_AI
Pasta local: `~/Projects/we-expand/autonomous_money`

O pipeline completo já rodou com sucesso, em modo contínuo, combinando os
três pedaços:

1. **Blockchain real de teste** (Base Sepolia) — carteira própria, saldo de
   ETH testnet, transações on-chain reais executadas sozinho.
2. **Economia fictícia local** (USD simulado) — ganha/perde dinheiro
   completando tarefas simuladas (content job, marketplace gig, aposta em
   mercado de previsão).
3. **Trading real contra mercado de verdade, em testnet** (Binance) — saldo
   simulado, mas preços e execução de ordem 100% reais (BTCUSDT, ETHUSDT).

### Resultado do último teste em modo contínuo (referência)

Saldo USD fictício ao longo dos ciclos (pra você comparar com rodadas
futuras):

| Momento | Saldo USD fictício |
|---|---|
| Fim do 1º teste isolado | $0,99 |
| Fim do 2º teste isolado (início do modo contínuo) | $4,08 |
| Fim do Ciclo 1 (contínuo) | $6,78 |
| Fim do Ciclo 2 (contínuo) | $14,66 |
| Meio do Ciclo 3 (pico) | $19,07 |
| Fim do Ciclo 3 (após perder $5 numa aposta) | $14,07 |

Cresceu ~3,6x de $4,08 pra $14,66 antes de uma aposta ruim devolver parte
do ganho. **Importante**: isso mede decisão de risco/retorno num ambiente
com chances favoráveis hardcoded (75-80% de sucesso em jobs/gigs, ~48% em
apostas) — não prova capacidade de ganhar dinheiro real. O trading real
(Binance) é o pedaço que de fato mede isso, mas ainda em modo testnet
(dinheiro simulado, preços reais).

O modo contínuo estava rodando (`CONTINUOUS_MODE=true`, até 30 ciclos) e
travou uma vez por rate limit do Groq — **já corrigido** (ver seção de
problemas resolvidos). Última ação: você rodou `git pull && npm start` de
novo depois da correção; aguardando ver o resultado dessa rodada.

## Como rodar (resumo rápido)

```bash
cd ~/Projects/we-expand/autonomous_money
git pull
npm start           # 1 ciclo, ou varios se CONTINUOUS_MODE=true no .env
npm run economy     # resumo do saldo ficticio
npm run ledger      # log bruto de tudo (on-chain + ficticio + trading)
```

## `.env` atual (o que já está configurado)

- `GROQ_API_KEY` / `GROQ_MODEL=openai/gpt-oss-120b` — funcionando.
- `AGENT_PRIVATE_KEY` — carteira testnet já gerada e com saldo (endereço
  `0x5F503402B8F275e54075a93799a1DBB6766B380f`).
- `CONTINUOUS_MODE=true`, `CYCLE_DELAY_SECONDS=30`, `MAX_CYCLES=30`.
- `ENABLE_TRADING=true`, `BINANCE_API_KEY` / `BINANCE_SECRET_KEY` de
  **testnet** (testnet.binance.vision), `BINANCE_TESTNET=true`,
  `MAX_ORDER_USD=5`, `MAX_LIVE_BUDGET_USD=5`.

Ainda **não migramos pra Binance live** — isso é uma decisão pendente sua,
não técnica (o código já suporta, só falta trocar as chaves e
`BINANCE_TESTNET=false` quando você decidir arriscar os $5 reais).

## Como monitorar tudo

- **Blockchain**: `https://sepolia.basescan.org/address/0x5F503402B8F275e54075a93799a1DBB6766B380f`
- **Economia fictícia**: `npm run economy` (resumo) ou `ledger/economy.json` (bruto)
- **Log completo de raciocínio**: `npm run ledger` ou `ledger/actions.json`
- **Trading real**: `testnet.binance.vision` (modo testnet atual) ou
  `binance.com` (quando for pra modo live)

## Decisões de segurança tomadas (não mudar sem repensar)

- Chain sempre testnet (Base Sepolia), hardcoded, sem opção de mainnet.
- Teto por transação de ETH testnet: `MAX_TX_VALUE_ETH`, teto absoluto de
  0.01 ETH travado em código.
- Trading é **opt-in** e começa sempre em modo **TESTNET**
  (`BINANCE_TESTNET=true` por padrão).
- Orçamento LIVE travado em **US$5 no máximo**, hardcoded em
  `src/config.ts` — não dá pra aumentar só editando `.env`.
- Teto por ordem de trading: `MAX_ORDER_USD=5` (é também o mínimo real da
  Binance por ordem — na prática, com orçamento de $5, uma ordem só já usa
  o orçamento inteiro em modo live).
- Chave de API da Binance em modo live deve ser criada **sem permissão de
  saque** — só trading. Assim, mesmo vazada, não dá pra roubar os fundos.
- `.env` nunca é commitado (está no `.gitignore`).
- Uma falha numa ferramenta ou numa chamada à API do modelo não derruba
  mais o processo inteiro — é logada e o agente/loop continua.

## Problemas que já resolvemos (pra não repetir)

- **Faucets de testnet são hostis a bots** (captcha, login, planos pagos,
  exigência de saldo em mainnet) — usamos o faucet da **Coinbase
  Developer Platform** (`portal.cdp.coinbase.com/products/faucet`), que
  funcionou sem fricção.
- **Ethereum Sepolia ≠ Base Sepolia** — são redes diferentes, saldo não é
  compartilhado. Sempre confirmar chain ID 84532 (Base Sepolia).
- **Modelos de IA saem de linha nos catálogos gratuitos** (NVIDIA API
  Catalog deu 403 misterioso mesmo com conta normal) — migramos pra
  **Groq**. Modelo atual: `openai/gpt-oss-120b`.
- **gpt-oss vaza tokens de formatação Harmony** no nome de tool calls
  (ex: `check_balance<|channel|>commentary`) — corrigido sanitizando o
  nome da ferramenta em `src/agent.ts` antes de despachar.
- **Alpaca não aceita Brasil** como país de residência fiscal em conta
  individual — trocamos pra Binance, que aceita.
- **Conta testnet da Binance vem com ~400 ativos fictícios** —
  `check_brokerage_account` filtra pra só USDT/BTC/ETH/BNB, senão a
  resposta estourava o limite de tokens do modelo.
- **Binance recusa ordens abaixo de ~$5 (Filter failure: NOTIONAL)** —
  `MAX_ORDER_USD` subiu de $1 pra $5 pra bater com o mínimo real.
- **Groq free tier tem TPM baixo (8000 tokens/min)** — em modo contínuo, o
  histórico de conversa cresce a cada ciclo e estourava esse limite,
  derrubando o processo. Corrigido com retry automático (espera o tempo
  do header `retry-after` e tenta de novo até 5x) e com o modo contínuo
  agora capturando erro por ciclo em vez de morrer inteiro.

## Próximos passos sugeridos

1. Conferir o resultado da rodada em modo contínuo que ficou pendente
   (`npm start` depois do `git pull` com a correção de rate limit).
2. Deixar rodar mais ciclos e observar se o saldo fictício e o saldo da
   Binance testnet convergem pra uma tendência, ou se é só ruído.
3. Quando estiver confortável com o comportamento: migrar pra Binance
   **live** — gerar chave real **sem permissão de saque**, depositar os
   $5, trocar `BINANCE_TESTNET=false` no `.env`.
4. Acompanhar por `npm run ledger`, `npm run economy` e o dashboard da
   Binance — e estar pronto pra aceitar que o resultado mais provável, dado
   quão aleatório é o mercado numa escala tão pequena, é ele não conseguir
   lucro consistente. Isso também é uma resposta válida ao experimento.
