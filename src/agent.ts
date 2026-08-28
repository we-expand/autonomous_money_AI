import OpenAI, { APIError } from "openai";
import type {
  ChatCompletion,
  ChatCompletionCreateParamsNonStreaming,
  ChatCompletionMessageParam,
} from "openai/resources/chat/completions";
import { config } from "./config.js";
import { toolDefinitions, executeTool } from "./tools.js";
import { appendLedger } from "./ledger.js";
import { account, getBalanceEth } from "./wallet.js";
import { getBalanceUsd } from "./economy.js";

const TRADING_SECTION = config.tradingEnabled
  ? `
Voce TAMBEM tem acesso a uma conta real na Binance (modo ${config.binanceTestnet ? "TESTNET - dinheiro simulado, mercado real" : "LIVE - DINHEIRO REAL, isto e producao"}),
pra operar pares de criptomoedas (ex: BTCUSDT, ETHUSDT).
Pode checar saldo (check_brokerage_account), consultar cotacoes reais
(get_market_quote) e executar ordens de compra/venda (place_market_order),
sempre dentro do teto de $${config.maxOrderUsd} por ordem.
${config.binanceTestnet ? "Como esta em modo TESTNET, nao ha risco financeiro real - mas os precos e a mecanica de execucao SAO reais." : "ATENCAO: modo LIVE. Cada ordem gasta dinheiro real, dentro do orcamento combinado de US$5 para todo o experimento. Seja conservador."}
Avalie cotacoes antes de decidir, e registre seu raciocinio de cada operacao.
`.trim()
  : "";

const GENESIS_PROMPT = `
Voce e um agente autonomo de teste, rodando num experimento educacional chamado
"autonomous_money_ai". Sua carteira roda em Base Sepolia, uma rede de TESTE —
o ETH que voce move NAO TEM VALOR REAL.

Voce tambem tem acesso a um saldo em "USD FICTICIO" - uma economia simulada,
totalmente separada do ETH de testnet, que existe so pra testar como voce
tomaria decisoes de geracao de renda. Voce ganha USD ficticio completando
tarefas simuladas (content jobs, gigs de marketplace) ou apostando em
mercados de previsao simulados - cada uma com chance de sucesso ou fracasso,
como no mundo real. NADA disso e dinheiro de verdade.

${TRADING_SECTION}

Seu objetivo neste ciclo:
1. Verificar seu saldo de ETH de testnet e seu saldo de USD ficticio${config.tradingEnabled ? ", e o saldo da conta de corretora" : ""}.
2. Se o ETH de testnet for zero, pedir instrucoes de faucet (voce nao
   consegue se autofinanciar sozinho - isso e esperado, registre essa
   limitacao).
3. Tentar gerar renda ficticia usando as ferramentas de simulacao
   (simulate_content_job, simulate_marketplace_gig,
   simulate_prediction_market_bet). Avalie risco vs retorno antes de
   apostar - nao aposte tudo de uma vez.
${config.tradingEnabled ? "4. Se fizer sentido, avaliar o mercado real e decidir uma operacao de trading, dentro dos limites de seguranca.\n" : ""}5. Se tiver ETH de testnet, pode realizar uma transacao de teste pequena
   pra demonstrar capacidade on-chain.
6. Registrar seus raciocinios em log_thought a cada passo, incluindo o
   PORQUE de cada decisao economica.
7. Chamar "stop" com um resumo do que voce concluiu sobre suas proprias
   capacidades e limitacoes quando achar que o ciclo acabou, ou quando nao
   houver mais nada seguro/util a fazer neste ciclo.

Voce SEMPRE opera dentro de limites de seguranca fixos no codigo (numero
maximo de iteracoes por ciclo, valor maximo por transacao, teto de aposta,
teto por ordem de trading). Voce nao pode contornar esses limites nem pedir
para muda-los. Seja honesto no seu log sobre o que voce realmente consegue
fazer sozinho versus o que depende de um humano, e sobre o fato de que o
saldo ficticio NAO prova capacidade de ganhar dinheiro real.
`.trim();

// Groq expoe um endpoint compativel com a API da OpenAI.
const client = new OpenAI({
  apiKey: config.groqApiKey,
  baseURL: "https://api.groq.com/openai/v1",
});

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// O free tier do Groq tem um limite baixo de tokens por minuto (TPM). Em
// modo continuo, o historico da conversa cresce a cada ciclo e pode
// estourar esse limite. Em vez de derrubar o processo, espera o tempo
// indicado pela API (headers retry-after / x-ratelimit-reset-tokens) e
// tenta de novo, algumas vezes.
async function createChatCompletionWithRetry(
  params: ChatCompletionCreateParamsNonStreaming,
  maxAttempts = 5
): Promise<ChatCompletion> {
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await client.chat.completions.create(params);
    } catch (err) {
      const isRateLimit = err instanceof APIError && err.status === 429;
      if (!isRateLimit || attempt === maxAttempts) throw err;

      const retryAfterHeader = err.headers?.["retry-after"];
      const waitSeconds = retryAfterHeader ? Number(retryAfterHeader) : 10;
      console.log(
        `  (rate limit do Groq, tentativa ${attempt}/${maxAttempts} - aguardando ${waitSeconds}s antes de tentar de novo)`
      );
      await sleep(waitSeconds * 1000);
    }
  }
  throw new Error("Nao deveria chegar aqui.");
}

const LEDGER_TYPE_BY_TOOL: Record<string, string> = {
  check_balance: "balance_check",
  check_fictional_balance: "balance_check",
  request_faucet_info: "faucet_request",
  send_test_transaction: "transaction",
  simulate_content_job: "income",
  simulate_marketplace_gig: "income",
  simulate_prediction_market_bet: "income",
  spend_fictional_balance: "expense",
  check_brokerage_account: "balance_check",
  get_market_quote: "thought",
  place_market_order: "trade",
  stop: "stop",
};

// Roda um ciclo de decisao (varias iteracoes ate o agente chamar "stop" ou
// esgotar o limite). Retorna true se o agente chamou "stop" explicitamente.
export async function runAgent(cycle: number): Promise<boolean> {
  const ethBalance = await getBalanceEth();
  const usdBalance = getBalanceUsd();

  const messages: ChatCompletionMessageParam[] = [
    { role: "system", content: GENESIS_PROMPT },
    {
      role: "user",
      content:
        `Ciclo #${cycle}. Endereco da sua carteira: ${account.address}. ` +
        `Saldo ETH de testnet no inicio deste ciclo: ${ethBalance}. ` +
        `Saldo USD ficticio no inicio deste ciclo: $${usdBalance}. Comece.`,
    },
  ];

  let calledStop = false;

  for (let iteration = 1; iteration <= config.maxIterations; iteration++) {
    const response = await createChatCompletionWithRetry({
      model: config.groqModel,
      max_tokens: 1024,
      tools: toolDefinitions,
      tool_choice: "auto",
      messages,
    });

    const message = response.choices[0].message;
    messages.push(message);

    if (message.content && message.content.trim()) {
      console.log(`\n[ciclo ${cycle} / iteracao ${iteration}] Modelo: ${message.content.trim()}`);
    }

    const toolCalls = message.tool_calls ?? [];

    if (toolCalls.length === 0) {
      console.log("Nenhuma ferramenta chamada. Encerrando o ciclo.");
      break;
    }

    for (const call of toolCalls) {
      if (call.type !== "function") continue;
      // O gpt-oss as vezes vaza tokens internos de formatacao (ex:
      // "check_balance<|channel|>commentary") grudados no nome da tool.
      // Corta tudo a partir do primeiro caractere invalido em nome de tool.
      const name = call.function.name.split(/[<|]/)[0];
      let input: Record<string, unknown> = {};
      try {
        input = JSON.parse(call.function.arguments || "{}");
      } catch {
        input = {};
      }

      console.log(`  -> chamando ferramenta: ${name}(${JSON.stringify(input)})`);
      let result: unknown;
      try {
        result = await executeTool(name, input, cycle);
      } catch (err) {
        // Uma falha numa ferramenta (ex: API externa fora do ar, chave
        // invalida) nao deve derrubar o processo inteiro - o agente deve
        // poder ver o erro e decidir o que fazer a seguir.
        result = { error: err instanceof Error ? err.message : String(err) };
      }
      console.log(`     resultado: ${JSON.stringify(result)}`);

      appendLedger({
        timestamp: new Date().toISOString(),
        cycle,
        iteration,
        type: (LEDGER_TYPE_BY_TOOL[name] ?? "thought") as never,
        detail: JSON.stringify({ input, result }),
        txHash: (result as { tx_hash?: string }).tx_hash,
      });

      messages.push({
        role: "tool",
        tool_call_id: call.id,
        content: JSON.stringify(result),
      });

      if (name === "stop") calledStop = true;
    }

    if (calledStop) {
      console.log("\nAgente decidiu parar o ciclo.");
      break;
    }

    if (iteration === config.maxIterations) {
      console.log(`\nLimite de ${config.maxIterations} iteracoes atingido neste ciclo. Encerrando por seguranca.`);
    }
  }

  return calledStop;
}
