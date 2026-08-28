import { parseEther } from "viem";
import type { Tool } from "@anthropic-ai/sdk/resources/messages";
import { account, publicClient, walletClient, getBalanceEth } from "./wallet.js";
import { config } from "./config.js";

export const toolDefinitions: Tool[] = [
  {
    name: "check_balance",
    description: "Consulta o saldo atual (em ETH de testnet, Base Sepolia) da carteira do agente.",
    input_schema: { type: "object", properties: {} },
  },
  {
    name: "request_faucet_info",
    description:
      "Retorna instrucoes de como conseguir ETH de testnet gratuito (faucet). " +
      "O agente NAO consegue chamar o faucet sozinho (a maioria exige captcha/login humano) " +
      "— isso e proposital, e o ponto central do experimento: a 'autonomia economica' tem limites reais.",
    input_schema: { type: "object", properties: {} },
  },
  {
    name: "send_test_transaction",
    description:
      "Envia uma transacao de valor minimo (ETH de testnet) para um endereco. " +
      "Use para simular 'pagamentos' do agente. Valor maximo por chamada e limitado por seguranca.",
    input_schema: {
      type: "object",
      properties: {
        to_address: {
          type: "string",
          description: "Endereco 0x de destino. Se omitido, envia para a propria carteira do agente (self-transfer, so para gerar uma tx de teste).",
        },
        amount_eth: {
          type: "string",
          description: `Quantidade em ETH de testnet, como string decimal (ex: "0.0001"). Teto absoluto: ${config.maxTxValueEth} ETH.`,
        },
        memo: {
          type: "string",
          description: "Motivo/contexto da transacao, para o log.",
        },
      },
      required: ["amount_eth", "memo"],
    },
  },
  {
    name: "log_thought",
    description: "Registra um raciocinio/observacao do agente no ledger, sem executar nenhuma acao externa.",
    input_schema: {
      type: "object",
      properties: {
        thought: { type: "string", description: "O que o agente esta pensando/concluindo." },
      },
      required: ["thought"],
    },
  },
  {
    name: "stop",
    description: "Encerra o loop do agente quando ele julgar que a tarefa acabou ou nao ha mais o que fazer com segurança.",
    input_schema: {
      type: "object",
      properties: {
        reason: { type: "string", description: "Por que o agente decidiu parar." },
      },
      required: ["reason"],
    },
  },
];

export async function executeTool(name: string, input: Record<string, unknown>) {
  switch (name) {
    case "check_balance": {
      const eth = await getBalanceEth();
      return { balance_eth: eth, address: account.address, network: "Base Sepolia (testnet, sem valor real)" };
    }

    case "request_faucet_info": {
      return {
        message:
          "Este agente nao pode se autofinanciar sozinho. Um humano precisa visitar um faucet " +
          "e mandar ETH de testnet manualmente para o endereco abaixo.",
        address: account.address,
        faucets: [
          "https://www.alchemy.com/faucets/base-sepolia",
          "https://faucet.quicknode.com/base/sepolia",
        ],
      };
    }

    case "send_test_transaction": {
      const amountEth = Number(input.amount_eth);
      if (!Number.isFinite(amountEth) || amountEth <= 0) {
        return { error: "amount_eth invalido." };
      }
      if (amountEth > config.maxTxValueEth) {
        return {
          error: `Valor pedido (${amountEth} ETH) excede o teto de seguranca (${config.maxTxValueEth} ETH). Transacao bloqueada.`,
        };
      }
      const to = (input.to_address as string | undefined) || account.address;
      const hash = await walletClient.sendTransaction({
        to: to as `0x${string}`,
        value: parseEther(amountEth.toFixed(18)),
      });
      const receipt = await publicClient.waitForTransactionReceipt({ hash });
      return {
        tx_hash: hash,
        status: receipt.status,
        to,
        amount_eth: amountEth,
        memo: input.memo,
        explorer_url: `https://sepolia.basescan.org/tx/${hash}`,
      };
    }

    case "log_thought": {
      return { logged: true };
    }

    case "stop": {
      return { stopped: true, reason: input.reason };
    }

    default:
      return { error: `Ferramenta desconhecida: ${name}` };
  }
}
