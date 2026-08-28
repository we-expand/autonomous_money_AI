import { config } from "./config.js";

const BASE_URL = config.alpacaPaper
  ? "https://paper-api.alpaca.markets"
  : "https://api.alpaca.markets";
const DATA_URL = "https://data.alpaca.markets";

function headers() {
  return {
    "APCA-API-KEY-ID": config.alpacaApiKey,
    "APCA-API-SECRET-KEY": config.alpacaSecretKey,
    "Content-Type": "application/json",
  };
}

async function alpacaFetch(url: string, init?: RequestInit) {
  const res = await fetch(url, { ...init, headers: headers() });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(`Alpaca API error ${res.status}: ${JSON.stringify(body)}`);
  }
  return body;
}

export async function getAccount() {
  const account = await alpacaFetch(`${BASE_URL}/v2/account`);
  return {
    cash_usd: Number(account.cash),
    portfolio_value_usd: Number(account.portfolio_value),
    buying_power_usd: Number(account.buying_power),
    mode: config.alpacaPaper ? "PAPER (dinheiro simulado)" : "LIVE (dinheiro real)",
  };
}

export async function getQuote(symbol: string) {
  const data = await alpacaFetch(`${DATA_URL}/v2/stocks/${symbol}/quotes/latest`);
  const quote = data.quote;
  return {
    symbol,
    ask_price: quote?.ap,
    bid_price: quote?.bp,
    timestamp: quote?.t,
  };
}

export async function placeMarketOrder(symbol: string, side: "buy" | "sell", notionalUsd: number) {
  const order = await alpacaFetch(`${BASE_URL}/v2/orders`, {
    method: "POST",
    body: JSON.stringify({
      symbol,
      side,
      type: "market",
      time_in_force: "day",
      notional: notionalUsd.toFixed(2),
    }),
  });
  return {
    order_id: order.id,
    symbol: order.symbol,
    side: order.side,
    notional_usd: notionalUsd,
    status: order.status,
    mode: config.alpacaPaper ? "PAPER (dinheiro simulado)" : "LIVE (dinheiro real)",
  };
}
