import { Router, type IRouter } from "express";
import {
  GetMarketBridgeQueryParams,
  GetMarketBridgeResponse,
} from "@workspace/api-zod";
import { logger } from "../lib/logger";

type YahooChartResult = {
  chart?: {
    result?: Array<{
      meta?: {
        regularMarketPrice?: number;
        previousClose?: number;
        regularMarketTime?: number;
        regularMarketVolume?: number;
      };
      timestamp?: number[];
      indicators?: {
        quote?: Array<{
          open?: Array<number | null>;
          high?: Array<number | null>;
          low?: Array<number | null>;
          close?: Array<number | null>;
          volume?: Array<number | null>;
        }>;
      };
    } | null>;
  };
};

type MarketCandle = {
  timestamp: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number | null;
};

type MarketLeg = {
  symbol: string;
  price: number | null;
  previousClose: number | null;
  change: number | null;
  changePercent: number | null;
  timestamp: number | null;
  candles: MarketCandle[];
  volume: number | null;
  openInterest: number | null;
};

const YAHOO_CHART_URL = "https://query1.finance.yahoo.com/v8/finance/chart";
const SAFE_SYMBOL = /^[A-Za-z0-9=.^_-]{1,20}$/;

function numberOrNull(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function getChartResult(payload: YahooChartResult) {
  const result = payload.chart?.result?.[0];
  if (!result) {
    throw new Error("Upstream chart response did not include a result");
  }
  return result;
}

async function fetchMarketLeg(
  symbol: string,
  range: "1d" | "5d" | "1mo",
  interval: "5m" | "15m" | "1h",
): Promise<MarketLeg> {
  if (!SAFE_SYMBOL.test(symbol)) {
    throw new Error(`Unsupported market symbol: ${symbol}`);
  }

  const query = new URLSearchParams({
    range,
    interval,
    includePrePost: "true",
    events: "div,splits",
  });
  const response = await fetch(
    `${YAHOO_CHART_URL}/${encodeURIComponent(symbol)}?${query.toString()}`,
    {
      headers: {
        Accept: "application/json",
        "User-Agent": "XAUUSD-Smart-Money-Analyzer/1.0",
      },
      signal: AbortSignal.timeout(8000),
    },
  );

  if (!response.ok) {
    throw new Error(`Market upstream returned HTTP ${response.status}`);
  }

  const result = getChartResult((await response.json()) as YahooChartResult);
  const meta = result.meta ?? {};
  const quote = result.indicators?.quote?.[0] ?? {};
  const timestamps = result.timestamp ?? [];
  const candles: MarketCandle[] = [];

  for (let index = 0; index < timestamps.length; index += 1) {
    const open = numberOrNull(quote.open?.[index]);
    const high = numberOrNull(quote.high?.[index]);
    const low = numberOrNull(quote.low?.[index]);
    const close = numberOrNull(quote.close?.[index]);
    if (
      open === null ||
      high === null ||
      low === null ||
      close === null ||
      typeof timestamps[index] !== "number"
    ) {
      continue;
    }
    candles.push({
      timestamp: timestamps[index],
      open,
      high,
      low,
      close,
      volume: numberOrNull(quote.volume?.[index]),
    });
  }

  const lastCandle = candles.at(-1);
  const price = numberOrNull(meta.regularMarketPrice) ?? lastCandle?.close;
  if (price === undefined || price === null) {
    throw new Error(`Market upstream returned no usable price for ${symbol}`);
  }

  const previousClose = numberOrNull(meta.previousClose);
  const change =
    previousClose === null ? null : Number((price - previousClose).toFixed(4));
  const changePercent =
    previousClose === null || previousClose === 0
      ? null
      : Number((((price - previousClose) / previousClose) * 100).toFixed(4));

  return {
    symbol,
    price,
    previousClose,
    change,
    changePercent,
    timestamp:
      numberOrNull(meta.regularMarketTime) ??
      lastCandle?.timestamp ??
      Math.floor(Date.now() / 1000),
    candles: candles.slice(-180),
    volume: numberOrNull(meta.regularMarketVolume) ?? lastCandle?.volume ?? null,
    // Yahoo's chart endpoint does not expose a centralized open-interest tape.
    openInterest: null,
  };
}

function freshnessStatus(
  spotTimestamp: number | null,
  futuresTimestamp: number | null,
): {
  spotSeconds: number | null;
  futuresSeconds: number | null;
  status: "fresh" | "delayed" | "stale" | "unavailable";
} {
  if (spotTimestamp === null || futuresTimestamp === null) {
    return { spotSeconds: null, futuresSeconds: null, status: "unavailable" };
  }
  const now = Math.floor(Date.now() / 1000);
  const spotSeconds = Math.max(0, now - spotTimestamp);
  const futuresSeconds = Math.max(0, now - futuresTimestamp);
  const oldest = Math.max(spotSeconds, futuresSeconds);

  return {
    spotSeconds,
    futuresSeconds,
    status: oldest <= 90 ? "fresh" : oldest <= 300 ? "delayed" : "stale",
  };
}

const router: IRouter = Router();

router.get("/market/bridge", async (req, res) => {
  const parsed = GetMarketBridgeQueryParams.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({
      error: "Invalid market bridge query",
      code: "INVALID_QUERY",
    });
    return;
  }

  const { spotSymbol, futuresSymbol, range, interval } = parsed.data;

  try {
    const [spot, futures] = await Promise.all([
      fetchMarketLeg(spotSymbol, range, interval),
      fetchMarketLeg(futuresSymbol, range, interval),
    ]);
    if (spot.price === null || futures.price === null) {
      throw new Error("Market upstream returned an empty price snapshot");
    }
    const basis = Number((futures.price - spot.price).toFixed(4));
    const freshness = freshnessStatus(spot.timestamp, futures.timestamp);

    const data = GetMarketBridgeResponse.parse({
      sourceMode: "partial",
      spot,
      futures,
      basis: {
        value: basis,
        percent: Number(((basis / spot.price) * 100).toFixed(4)),
        futuresPremium: basis > 0,
      },
      // Separate Yahoo chart snapshots cannot prove tick-level lead/lag.
      leadLagMs: null,
      // Delta and true OI require a centralized futures trade/DOM feed.
      delta: null,
      imbalance: {
        buyPercent: null,
        sellPercent: null,
      },
      freshness,
      provenance: {
        spot: `Yahoo Finance chart · ${spotSymbol} · ${interval}`,
        futures: `Yahoo Finance chart · ${futuresSymbol} · ${interval}`,
        delta: "Unavailable · centralized futures trade tape required",
        openInterest: "Unavailable · futures OI feed required",
        cot: "Unavailable · weekly CFTC feed not connected",
      },
      warning:
        "Live price and candle bridge is active. Delta, order-book imbalance, and open interest are unavailable from this upstream and cannot be inferred safely.",
    });

    res.json(data);
  } catch (error) {
    logger.warn({ err: error }, "Market bridge upstream unavailable");
    const unavailableLeg = (symbol: string): MarketLeg => ({
      symbol,
      price: null,
      previousClose: null,
      change: null,
      changePercent: null,
      timestamp: null,
      candles: [],
      volume: null,
      openInterest: null,
    });
    res.json(
      GetMarketBridgeResponse.parse({
        sourceMode: "unavailable",
        spot: unavailableLeg(spotSymbol),
        futures: unavailableLeg(futuresSymbol),
        basis: { value: null, percent: null, futuresPremium: false },
        leadLagMs: null,
        delta: null,
        imbalance: { buyPercent: null, sellPercent: null },
        freshness: {
          spotSeconds: null,
          futuresSeconds: null,
          status: "unavailable",
        },
        provenance: {
          spot: "Unavailable · upstream did not return a usable snapshot",
          futures: "Unavailable · upstream did not return a usable snapshot",
          delta: "Unavailable · centralized futures trade tape required",
          openInterest: "Unavailable · futures OI feed required",
          cot: "Unavailable · weekly CFTC feed not connected",
        },
        warning:
          "No upstream market snapshot is available. The dashboard is intentionally showing the demo fixture and keeping the recommendation in WAIT.",
      }),
    );
  }
});

export default router;