# autonomous_money_ai

Sandbox educacional para explorar o conceito por tras do "Sigil Wen Automaton" /
Web4 (agentes de IA com carteira propria, operando sozinhos on-chain) —
**sem dinheiro real**, usando a testnet Base Sepolia.

Isso **não** é uma réplica da infraestrutura Conway (ERC-8004, x402, etc). É um
protótipo simplificado com o mesmo espírito: um agente que decide sozinho,
via um modelo de IA gratuito (Groq), quando checar saldo, pedir
fundos e mandar transações — dentro de limites de segurança fixos no código.

## O que ele faz

O agente roda em ciclos (`src/agent.ts`), com um "genesis prompt" que o instrui a, em cada ciclo:

1. Checar o saldo de ETH de testnet (`check_balance`) e o saldo de **USD
   fictício** (`check_fictional_balance`) — duas "moedas" totalmente
   separadas, explicado abaixo.
2. Se o ETH de testnet estiver zerado, pedir instruções de faucet
   (`request_faucet_info`) — e reconhecer no log que ele **não consegue se
   autofinanciar sozinho** (a maioria dos faucets exige humano/captcha —
   isso é proposital).
3. Tentar gerar renda fictícia com `simulate_content_job`,
   `simulate_marketplace_gig` ou `simulate_prediction_market_bet` —
   cada uma com chance de sucesso/fracasso, simulando decisões de
   risco x retorno.
4. Se tiver ETH de testnet, executar uma transação de teste
   (`send_test_transaction`) pra demonstrar capacidade on-chain.
5. Registrar seus raciocínios (`log_thought`), inclusive o porquê de cada
   decisão econômica.
6. Parar o ciclo (`stop`) quando concluir a tarefa.

Toda ação é gravada em `ledger/actions.json` (incluindo hashes de transação,
visíveis no [Base Sepolia explorer](https://sepolia.basescan.org)), e toda
movimentação da economia fictícia em `ledger/economy.json`.

### Duas "moedas", propositalmente separadas

- **ETH de testnet**: real, on-chain, mas sem valor nenhum — só serve pra
  provar que o agente consegue assinar e executar transações sozinho. Não
  tem como crescer (não há staking/renda), só diminui com cada transação.
- **USD fictício**: um saldo 100% simulado, local (não é blockchain, não é
  dinheiro real), que o agente ganha ou perde completando tarefas
  simuladas. Serve pra observar COMO um agente autônomo tomaria decisões
  de geração de renda — não prova que ele conseguiria ganhar dinheiro de
  verdade, já que não existe mercado real do outro lado.

### Rodando em ciclos contínuos

Por padrão (`CONTINUOUS_MODE=false`), `npm start` roda **um ciclo** e para.
Pra deixar ele rodando repetidamente (útil pra ver a economia fictícia
evoluir ao longo do tempo), ative no `.env`:

```
CONTINUOUS_MODE=true
CYCLE_DELAY_SECONDS=30   # pausa entre ciclos
MAX_CYCLES=100           # teto duro de seguranca (max 1000)
```

O modo contínuo para sozinho se: atingir `MAX_CYCLES`, ou ficar 3 ciclos
seguidos sem saldo em nenhuma das duas moedas (ETH de testnet zerado E
USD fictício zerado — sinal de que não há mais nada útil a fazer).
`Ctrl+C` interrompe a qualquer momento.

## Trading real/testnet (opcional, via Binance)

Além da economia fictícia, dá pra ligar operações reais contra o mercado de
verdade (criptomoedas), via [Binance](https://binance.com) (escolhida por
aceitar contas do Brasil — a Alpaca, alternativa inicial, não aceita
residência fiscal brasileira em conta individual):

```
ENABLE_TRADING=true
BINANCE_API_KEY=...
BINANCE_SECRET_KEY=...
BINANCE_TESTNET=true   # true = dinheiro simulado (padrao). false = dinheiro REAL.
MAX_ORDER_USD=1
MAX_LIVE_BUDGET_USD=5  # teto rigido, nao pode passar de 5 em modo LIVE
```

1. Teste primeiro em **testnet** — gere chaves grátis em
   https://testnet.binance.vision (login com GitHub, é uma conta separada
   da sua conta real da Binance). Preços e mecânica de execução são reais,
   saldo é simulado, sem nenhum risco financeiro.
2. Só depois que validar que está tudo funcionando, se quiser ir pra
   dinheiro real: na sua conta real da Binance, vá em **API Management**,
   crie uma chave nova com permissão de **"Enable Spot & Margin Trading"**
   e **SEM** permissão de saque (withdraw) — assim, mesmo que a chave
   vaze, ninguém consegue sacar seus fundos, só operar. Deposite os $5
   que você aceita arriscar, troque `BINANCE_TESTNET=false`.
3. `MAX_LIVE_BUDGET_USD` tem um teto rígido de $5 embutido no código
   (`src/config.ts`) — nenhuma variável de ambiente consegue passar disso,
   e `MAX_ORDER_USD` limita quanto ele pode arriscar numa ordem só.

Ferramentas novas disponíveis quando `ENABLE_TRADING=true`:
`check_brokerage_account`, `get_market_quote`, `place_market_order`
(pares tipo `BTCUSDT`, `ETHUSDT`).

⚠️ Em modo LIVE isso gasta dinheiro real. O agente pode tomar decisões
ruins, o mercado pode virar contra ele, e não há garantia nenhuma de
lucro — é exatamente o ponto de testar "ele consegue ganhar dinheiro de
verdade sozinho?". Só ligue `BINANCE_TESTNET=false` com o valor que você
aceita perder por completo, e nunca dê permissão de saque à chave de API.

## Guardrails (de propósito, não é feature — é o ponto do experimento)

- **Só existe testnet no código.** Não há como configurar mainnet — a chain
  está hardcoded em `src/config.ts` (`baseSepolia`).
- **Teto de valor por transação**: `MAX_TX_VALUE_ETH` no `.env`, com um teto
  absoluto de 0.01 ETH de testnet embutido no código (`src/config.ts`),
  que nenhuma variável de ambiente consegue ultrapassar.
- **Teto de iterações**: `MAX_ITERATIONS` limita quantos passos o agente roda
  antes de parar sozinho, mesmo que não chame `stop`.
- **O agente não consegue se autofinanciar.** Não implementamos chamada
  automática a faucet de propósito — isso é exatamente o ponto fraco que a
  narrativa de "IA soberana" costuma esconder: alguém humano sempre precisa
  colocar o primeiro saldo.
- **Trading é opt-in e com teto duro.** `ENABLE_TRADING` começa desligado.
  Mesmo ligado, começa em modo PAPER por padrão, e o teto de orçamento em
  modo LIVE (`MAX_LIVE_BUDGET_USD`) está travado em código, não só no `.env`.

## Como rodar

Pré-requisitos: Node 20+, uma chave gratuita do Groq (sem cartão de
crédito) — gere em https://console.groq.com/keys.

```bash
npm install
npm run setup-wallet     # gera uma carteira nova de TESTNET e salva a chave em .env
```

Depois, pegue ETH de testnet grátis pra rede **Base Sepolia** (não vale
dinheiro real) num destes faucets — teste mais de um se algum estiver fora
do ar ou pedir pré-requisitos extras (LINK em mainnet, plano pago, etc):

- https://portal.cdp.coinbase.com/products/faucet (Coinbase Developer
  Platform — recomendado, até 0.1 ETH/dia, sem pré-requisitos)
- https://cloud.google.com/application/web3/faucet/base/sepolia
- https://www.alchemy.com/faucets/base-sepolia
- https://faucet.quicknode.com/base/sepolia

⚠️ Confirme sempre que o faucet está entregando na rede **Base Sepolia**
(chain ID `84532`), não em "Ethereum Sepolia" — são redes diferentes com
saldos separados.

Preencha o resto do `.env` (copie de `.env.example` se ainda não existir):

```
GROQ_API_KEY=gsk_...
GROQ_MODEL=openai/gpt-oss-120b
```

Para ver a lista de modelos disponíveis no Groq:

```bash
curl -s https://api.groq.com/openai/v1/models \
  -H "Authorization: Bearer $GROQ_API_KEY" | python3 -m json.tool | grep '"id"'
```

E rode:

```bash
npm start           # roda o agente (1 ciclo, ou varios se CONTINUOUS_MODE=true)
npm run ledger      # imprime o historico completo de acoes (on-chain + economia)
npm run economy     # imprime so o resumo da economia ficticia (saldo, taxa de sucesso por fonte)
```

## Monitorando o agente

Três formas de acompanhar, do mais externo/verificável ao mais interno:

1. **Blockchain (Base Sepolia Explorer)** — histórico público e imutável de
   toda transação real que o agente assinou:
   ```
   https://sepolia.basescan.org/address/SEU_ENDERECO_AQUI
   ```
2. **`npm run economy`** — resumo da economia fictícia: saldo atual, taxa
   de sucesso por tipo de tarefa, e o histórico completo de ganhos/perdas
   simulados, ciclo a ciclo.
3. **`npm run ledger`** — o raciocínio bruto do agente: cada `log_thought`,
   cada chamada de ferramenta e seu resultado, na ordem em que aconteceram.
4. **Dashboard da Binance** (se `ENABLE_TRADING=true`) — saldo, posições e
   histórico de ordens reais em https://testnet.binance.vision (modo
   testnet) ou https://www.binance.com (modo live).

Rodando em `CONTINUOUS_MODE=true`, o próprio terminal já mostra em tempo
real cada ciclo (`========== CICLO N ==========`) com o resumo de saldo no
final de cada um — dá pra deixar rodando numa aba e só acompanhar o output.

## Segurança

- A chave privada gerada é **só para testnet**. Nunca reutilize, nunca mande
  ETH real para esse endereço.
- `.env` está no `.gitignore` — a chave nunca deve ser commitada.
- Não há integração com exchanges, mercados de previsão ou pagamento a
  fornecedores reais — isso ficou fora de escopo de propósito, dado o risco
  de dar a um LLM controle irrestrito sobre dinheiro de verdade.
- O "USD fictício" (`ledger/economy.json`) é só um contador local em JSON.
  Não representa saldo em nenhuma conta, banco ou exchange real — é
  puramente ilustrativo de como o agente tomaria decisões econômicas.

## Por que isso existe

Este projeto nasceu de uma pergunta sobre o "Sigil Wen Automaton" (um agente
de IA anunciado publicamente com carteira própria, alegando ganhar sua
própria "existência"). A ideia aqui é testar, com dinheiro fictício, o que
realmente é automatizável nesse conceito e o que continua dependendo de um
humano — sem os riscos financeiros e de segurança de dar a um agente uma
carteira com fundos reais.
