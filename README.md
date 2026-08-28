# autonomous_money_ai

Sandbox educacional para explorar o conceito por tras do "Sigil Wen Automaton" /
Web4 (agentes de IA com carteira propria, operando sozinhos on-chain) —
**sem dinheiro real**, usando a testnet Base Sepolia.

Isso **não** é uma réplica da infraestrutura Conway (ERC-8004, x402, etc). É um
protótipo simplificado com o mesmo espírito: um agente que decide sozinho,
via um modelo de IA gratuito (NVIDIA API Catalog), quando checar saldo, pedir
fundos e mandar transações — dentro de limites de segurança fixos no código.

## O que ele faz

O agente roda em loop (`src/agent.ts`), com um "genesis prompt" que o instrui a:

1. Checar o próprio saldo (`check_balance`).
2. Se estiver zerado, pedir instruções de faucet (`request_faucet_info`) —
   e reconhecer no log que ele **não consegue se autofinanciar sozinho**
   (a maioria dos faucets exige humano/captcha — isso é proposital).
3. Se tiver saldo, executar 1-2 transações de teste (`send_test_transaction`).
4. Registrar seus raciocínios (`log_thought`).
5. Parar (`stop`) quando concluir a tarefa.

Toda ação é gravada em `ledger/actions.json`, incluindo os hashes das
transações (visíveis no [Base Sepolia explorer](https://sepolia.basescan.org)).

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

## Como rodar

Pré-requisitos: Node 20+, uma chave gratuita da NVIDIA API Catalog (sem
cartão de crédito) — gere em https://build.nvidia.com/settings/api-keys.

```bash
npm install
npm run setup-wallet     # gera uma carteira nova de TESTNET e salva a chave em .env
```

Depois, pegue ETH de testnet grátis num faucet para o endereço impresso pelo
`setup-wallet` (não vale dinheiro real):

- https://www.alchemy.com/faucets/base-sepolia
- https://faucet.quicknode.com/base/sepolia

Preencha o resto do `.env` (copie de `.env.example` se ainda não existir):

```
NVIDIA_API_KEY=nvapi-...
NVIDIA_MODEL=meta/llama-3.1-70b-instruct
```

E rode:

```bash
npm start          # roda o agente
npm run ledger      # imprime o histórico de ações registradas
```

## Segurança

- A chave privada gerada é **só para testnet**. Nunca reutilize, nunca mande
  ETH real para esse endereço.
- `.env` está no `.gitignore` — a chave nunca deve ser commitada.
- Não há integração com exchanges, mercados de previsão ou pagamento a
  fornecedores reais — isso ficou fora de escopo de propósito, dado o risco
  de dar a um LLM controle irrestrito sobre dinheiro de verdade.

## Por que isso existe

Este projeto nasceu de uma pergunta sobre o "Sigil Wen Automaton" (um agente
de IA anunciado publicamente com carteira própria, alegando ganhar sua
própria "existência"). A ideia aqui é testar, com dinheiro fictício, o que
realmente é automatizável nesse conceito e o que continua dependendo de um
humano — sem os riscos financeiros e de segurança de dar a um agente uma
carteira com fundos reais.
