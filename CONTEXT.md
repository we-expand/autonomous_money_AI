# Contexto do projeto — autonomous_money_ai

> Este arquivo existe pra você (ou uma sessão futura do Claude) retomar o
> projeto sem precisar reconstruir o raciocínio do zero. Escrito em
> 28/08/2026.

## De onde isso veio

Você perguntou sobre o **"Sigil Wen Automaton"** — um projeto real que
viralizou nas redes: Sigil Wen (Thiel Fellow) anunciou um agente de IA
("Automaton") que roda sobre uma infraestrutura chamada **Conway**, com
carteira cripto própria, capaz de pagar pelo próprio compute e "ganhar sua
própria existência" — narrativa de "Web 4.0". Vitalik Buterin criticou
publicamente a ideia, argumentando que aumentar a distância entre humano e
IA é perigoso.

Você quis testar, na prática, com dinheiro fictício, **o que desse conceito
é real e o que é só narrativa**. Este repositório é o resultado.

## O que já foi construído (e funciona)

Repositório: https://github.com/we-expand/autonomous_money_AI
Pasta local recomendada: `~/Projects/we-expand/autonomous_money`

1. **Agente autônomo com carteira própria em blockchain de teste**
   (Base Sepolia, ETH sem valor real). Ele decide sozinho, via LLM, quando
   checar saldo, pedir instruções de faucet (mas NÃO consegue chamar o
   faucet sozinho — proposital) e executar transações reais on-chain.
   - **Já provamos**: ele consegue operar 100% sozinho *depois* que tem
     saldo. A parte de conseguir o saldo inicial (faucets com captcha,
     login, planos pagos, exigência de LINK em mainnet) levou quase uma
     hora de trabalho humano manual — contra segundos de execução autônoma
     do agente. Essa foi a prova mais concreta contra a narrativa de
     "soberania" do Automaton real.

2. **Economia fictícia simulada** (`src/economy.ts`, `ledger/economy.json`)
   — um saldo em "USD fictício", **separado do ETH de testnet**, que o
   agente ganha ou perde completando tarefas simuladas:
   - `simulate_content_job` (venda de conteúdo pra cliente fictício)
   - `simulate_marketplace_gig` (freelance fictício)
   - `simulate_prediction_market_bet` (aposta em mercado de previsão fictício)
   - Isso mostra COMO ele decide gerar renda (risco x retorno), mas não
     prova que ele ganharia dinheiro de verdade.

3. **Modo contínuo** (`CONTINUOUS_MODE=true`) — roda vários ciclos de
   decisão em sequência, com teto duro (`MAX_CYCLES`, máx 1000) e parada
   automática se ficar sem saldo em nenhuma das moedas por 3 ciclos seguidos.

4. **Trading real/paper via Alpaca** (`src/broker.ts`, `ENABLE_TRADING=true`)
   — o pedaço mais recente e o que ainda está em andamento. Objetivo
   explícito seu: **ver se ele consegue crescer $5 reais de verdade**,
   não só simular. Decisão tomada: usar Alpaca (paper trading pra validar
   sem risco, depois live com teto RÍGIDO de US$5 travado em código,
   `src/config.ts`, não editável via `.env`).
   - Ferramentas novas: `check_brokerage_account`, `get_market_quote`,
     `place_market_order` (mercado real, ações americanas).
   - **Ainda falta**: você criar a conta na Alpaca, gerar as chaves de
     paper primeiro, testar, e só depois (se quiser) migrar pra live com
     os $5.

## Como monitorar tudo

- **Blockchain**: `https://sepolia.basescan.org/address/SEU_ENDERECO`
- **Economia fictícia**: `npm run economy` (resumo) ou
  `ledger/economy.json` (bruto)
- **Log completo de raciocínio**: `npm run ledger` ou `ledger/actions.json`
- **Trading real**: dashboard da Alpaca (`app.alpaca.markets/paper/...` ou
  `/live/...`)

## Decisões de segurança tomadas (não mudar sem repensar)

- Chain sempre testnet (Base Sepolia), hardcoded, sem opção de mainnet.
- Teto por transação de ETH testnet: `MAX_TX_VALUE_ETH`, teto absoluto de
  0.01 ETH travado em código.
- Trading é **opt-in** (`ENABLE_TRADING=false` por padrão) e começa sempre
  em modo **PAPER** (`ALPACA_PAPER=true` por padrão).
- Orçamento LIVE travado em **US$5 no máximo**, hardcoded em
  `src/config.ts` — não dá pra aumentar só editando `.env`.
- Teto por ordem de trading: `MAX_ORDER_USD` (padrão $1).
- `.env` nunca é commitado (está no `.gitignore`).

## Problemas que já resolvemos (pra não repetir)

- **Faucets de testnet são hostis a bots** (captcha, login, planos pagos,
  exigência de saldo em mainnet) — usamos o faucet da **Coinbase
  Developer Platform** (`portal.cdp.coinbase.com/products/faucet`), que
  funcionou sem fricção.
- **Ethereum Sepolia ≠ Base Sepolia** — são redes diferentes, saldo não
  é compartilhado. Sempre confirmar chain ID 84532 (Base Sepolia).
- **Modelos de IA saem de linha nos catálogos gratuitos** (NVIDIA API
  Catalog deu 403 misterioso mesmo com conta normal; nomes de modelo saem
  do ar) — migramos pra **Groq**, que funcionou. Modelo atual:
  `openai/gpt-oss-120b`.
- **gpt-oss vaza tokens de formatação Harmony** no nome de tool calls
  (ex: `check_balance<|channel|>commentary`) — corrigido sanitizando o
  nome da ferramenta em `src/agent.ts` antes de despachar.

## Próximos passos sugeridos

1. Testar o trading em modo **paper** primeiro (`ENABLE_TRADING=true`,
   `ALPACA_PAPER=true`) — validar que as ferramentas funcionam sem risco.
2. Rodar alguns ciclos em modo contínuo e ver o comportamento do agente
   com a economia fictícia + trading paper juntos.
3. Só depois, se quiser mesmo saber se ele ganha dinheiro real: gerar
   chaves live na Alpaca, depositar os $5, trocar `ALPACA_PAPER=false`.
4. Acompanhar por `npm run ledger`, `npm run economy` e o dashboard da
   Alpaca — e estar pronto pra aceitar que o resultado mais provável, dado
   quão aleatório é o mercado numa escala tão pequena, é ele não conseguir
   lucro consistente. Isso também é uma resposta válida ao experimento.
