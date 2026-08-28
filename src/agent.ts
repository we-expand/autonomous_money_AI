import OpenAI from "openai";
import type { ChatCompletionMessageParam } from "openai/resources/chat/completions";
import { config } from "./config.js";
import { toolDefinitions, executeTool } from "./tools.js";
import { appendLedger } from "./ledger.js";
import { account } from "./wallet.js";

const GENESIS_PROMPT = `
Voce e um agente autonomo de teste, rodando num experimento educacional chamado
"autonomous_money_ai". Sua carteira roda em Base Sepolia, uma rede de TESTE —
o ETH que voce move NAO TEM VALOR REAL.

Seu objetivo neste experimento e simples e explicitamente limitado:
1. Verificar seu saldo atual.
2. Se o saldo for zero, pedir instrucoes de faucet (voce nao consegue se
   autofinanciar sozinho — isso e esperado, registre essa limitacao).
3. Se tiver saldo, realizar 1 a 2 transacoes de teste pequenas para
   demonstrar que voce consegue decidir e executar acoes on-chain sozinho.
4. Registrar seus raciocinios em log_thought a cada passo.
5. Chamar "stop" com um resumo do que voce concluiu sobre suas proprias
   capacidades e limitacoes quando achar que a tarefa acabou, ou quando
   nao houver mais nada seguro/util a fazer.

Voce SEMPRE opera dentro de limites de seguranca fixos no codigo (numero
maximo de iteracoes, valor maximo por transacao). Voce nao pode contornar
esses limites nem pedir para muda-los. Seja honesto no seu log sobre o
que voce realmente consegue fazer sozinho versus o que depende de um
humano.
`.trim();

// Groq expoe um endpoint compativel com a API da OpenAI.
const client = new OpenAI({
  apiKey: config.groqApiKey,
  baseURL: "https://api.groq.com/openai/v1",
});

export async function runAgent() {
  const messages: ChatCompletionMessageParam[] = [
    { role: "system", content: GENESIS_PROMPT },
    { role: "user", content: `Endereco da sua carteira: ${account.address}\n\nComece.` },
  ];

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
      console.log(`\n[iteracao ${iteration}] Modelo: ${message.content.trim()}`);
    }

    const toolCalls = message.tool_calls ?? [];

    if (toolCalls.length === 0) {
      // Sem tool_call e sem stop explicito: encerra por seguranca em vez de
      // ficar girando sem acao.
      console.log("Nenhuma ferramenta chamada. Encerrando o loop.");
      break;
    }

    let shouldStop = false;

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
      const result = await executeTool(name, input);
      console.log(`     resultado: ${JSON.stringify(result)}`);

      appendLedger({
        timestamp: new Date().toISOString(),
        iteration,
        type:
          name === "check_balance"
            ? "balance_check"
            : name === "request_faucet_info"
              ? "faucet_request"
              : name === "send_test_transaction"
                ? "transaction"
                : name === "stop"
                  ? "stop"
                  : "thought",
        detail: JSON.stringify({ input, result }),
        txHash: (result as { tx_hash?: string }).tx_hash,
      });

      messages.push({
        role: "tool",
        tool_call_id: call.id,
        content: JSON.stringify(result),
      });

      if (name === "stop") shouldStop = true;
    }

    if (shouldStop) {
      console.log("\nAgente decidiu parar.");
      break;
    }

    if (iteration === config.maxIterations) {
      console.log(`\nLimite de ${config.maxIterations} iteracoes atingido. Encerrando por seguranca.`);
    }
  }
}
