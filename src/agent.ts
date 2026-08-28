import OpenAI from "openai";
import type { ChatCompletionMessageParam } from "openai/resources/chat/completions";
import { config } from "./config.js";
import { toolDefinitions, executeTool } from "./tools.js";
import { appendLedger } from "./ledger.js";
import { account, getBalanceEth } from "./wallet.js";
import { getBalanceUsd } from "./economy.js";

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

Seu objetivo neste ciclo:
1. Verificar seu saldo de ETH de testnet e seu saldo de USD ficticio.
2. Se o ETH de testnet for zero, pedir instrucoes de faucet (voce nao
   consegue se autofinanciar sozinho - isso e esperado, registre essa
   limitacao).
3. Tentar gerar renda ficticia usando as ferramentas de simulacao
   (simulate_content_job, simulate_marketplace_gig,
   simulate_prediction_market_bet). Avalie risco vs retorno antes de
   apostar - nao aposte tudo de uma vez.
4. Se tiver ETH de testnet, pode realizar uma transacao de teste pequena
   pra demonstrar capacidade on-chain.
5. Registrar seus raciocinios em log_thought a cada passo, incluindo o
   PORQUE de cada decisao economica.
6. Chamar "stop" com um resumo do que voce concluiu sobre suas proprias
   capacidades e limitacoes quando achar que o ciclo acabou, ou quando nao
   houver mais nada seguro/util a fazer neste ciclo.

Voce SEMPRE opera dentro de limites de seguranca fixos no codigo (numero
maximo de iteracoes por ciclo, valor maximo por transacao, teto de aposta).
Voce nao pode contornar esses limites nem pedir para muda-los. Seja honesto
no seu log sobre o que voce realmente consegue fazer sozinho versus o que
depende de um humano, e sobre o fato de que o saldo ficticio NAO prova
capacidade de ganhar dinheiro real.
`.trim();

// Groq expoe um endpoint compativel com a API da OpenAI.
const client = new OpenAI({
  apiKey: config.groqApiKey,
  baseURL: "https://api.groq.com/openai/v1",
});

const LEDGER_TYPE_BY_TOOL: Record<string, string> = {
  check_balance: "balance_check",
  check_fictional_balance: "balance_check",
  request_faucet_info: "faucet_request",
  send_test_transaction: "transaction",
  simulate_content_job: "income",
  simulate_marketplace_gig: "income",
  simulate_prediction_market_bet: "income",
  spend_fictional_balance: "expense",
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
    const response = await client.chat.completions.create({
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
      const result = await executeTool(name, input, cycle);
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
