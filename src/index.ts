import { assertOnTestnet } from "./wallet.js";
import { runAgent } from "./agent.js";

async function main() {
  await assertOnTestnet();
  console.log("Iniciando agente em Base Sepolia (testnet — sem valor real)...\n");
  await runAgent();
  console.log("\nFim da execucao. Veja o log completo com `npm run ledger`.");
}

main().catch((err) => {
  console.error("Erro fatal:", err);
  process.exit(1);
});
