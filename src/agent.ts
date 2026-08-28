import Anthropic from "@anthropic-ai/sdk";
import type { MessageParam } from "@anthropic-ai/sdk/resources/messages";
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

const client = new Anthropic({ apiKey: config.anthropicApiKey });

export async function runAgent() {
  const messages: MessageParam[] = [
    { role: "user", content: `Endereco da sua carteira: ${account.address}\n\nComece.` },
  ];

  for (let iteration = 1; iteration <= config.maxIterations; iteration++) {
    const response = await client.messages.create({
      model: "claude-sonnet-4-5",
      max_tokens: 1024,
      system: GENESIS_PROMPT,
      tools: toolDefinitions,
      messages,
    });

    messages.push({ role: "assistant", content: response.content });

    const toolUses = response.content.filter((b) => b.type === "tool_use");

    for (const block of response.content) {
      if (block.type === "text" && block.text.trim()) {
        console.log(`\n[iteracao ${iteration}] Claude: ${block.text.trim()}`);
      }
    }

    if (toolUses.length === 0) {
      // Sem tool_use e sem stop explicito: encerra por seguranca em vez de
      // ficar girando sem acao.
      console.log("Nenhuma ferramenta chamada. Encerrando o loop.");
      break;
    }

    const toolResults = [];
    let shouldStop = false;

    for (const use of toolUses) {
      console.log(`  -> chamando ferramenta: ${use.name}(${JSON.stringify(use.input)})`);
      const result = await executeTool(use.name, use.input as Record<string, unknown>);
      console.log(`     resultado: ${JSON.stringify(result)}`);

      appendLedger({
        timestamp: new Date().toISOString(),
        iteration,
        type:
          use.name === "check_balance"
            ? "balance_check"
            : use.name === "request_faucet_info"
              ? "faucet_request"
              : use.name === "send_test_transaction"
                ? "transaction"
                : use.name === "stop"
                  ? "stop"
                  : "thought",
        detail: JSON.stringify({ input: use.input, result }),
        txHash: (result as { tx_hash?: string }).tx_hash,
      });

      toolResults.push({
        type: "tool_result" as const,
        tool_use_id: use.id,
        content: JSON.stringify(result),
      });

      if (use.name === "stop") shouldStop = true;
    }

    messages.push({ role: "user", content: toolResults });

    if (shouldStop) {
      console.log("\nAgente decidiu parar.");
      break;
    }

    if (iteration === config.maxIterations) {
      console.log(`\nLimite de ${config.maxIterations} iteracoes atingido. Encerrando por seguranca.`);
    }
  }
}
