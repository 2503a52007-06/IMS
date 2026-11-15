import { getCurrencyCache, saveCurrencyCache } from '../db.ts';
import type { CurrencyRateCache } from '../types.ts';

const CACHE_TTL_MS = 1000 * 60 * 60; // 1 hour

export interface CurrencyRatesResult {
  available: boolean;
  base: 'INR';
  inrPerUnit: Record<string, number>;
  ratesPerInr: Record<string, number>;
  fetchedAt: string | null;
  source: string;
  isCachedFallback: boolean;
  errorMessage?: string;
}

function buildInrPerUnit(ratesPerInr: Record<string, number>): Record<string, number> {
  const inrPerUnit: Record<string, number> = { INR: 1 };
  for (const [code, perInr] of Object.entries(ratesPerInr)) {
    if (typeof perInr === 'number' && perInr > 0) {
      inrPerUnit[code] = Number((1 / perInr).toFixed(4));
    }
  }
  return inrPerUnit;
}

async function fetchFromOpenErApi(): Promise<CurrencyRateCache> {
  const response = await fetch('https://open.er-api.com/v6/latest/INR', {
    signal: AbortSignal.timeout(6000),
  });
  if (!response.ok) {
    throw new Error(`Exchange rate upstream returned HTTP ${response.status}`);
  }
  const data = (await response.json()) as {
    result?: string;
    rates?: Record<string, number>;
  };
  if (data.result !== 'success' || !data.rates || !data.rates.USD) {
    throw new Error('Malformed exchange rate payload from open.er-api.com');
  }
  return {
    base: 'INR',
    ratesPerInr: data.rates,
    inrPerUnit: buildInrPerUnit(data.rates),
    fetchedAt: new Date().toISOString(),
    source: 'open.er-api.com (Live)',
  };
}

async function fetchFromFrankfurter(): Promise<CurrencyRateCache> {
  const response = await fetch('https://api.frankfurter.app/latest?from=INR', {
    signal: AbortSignal.timeout(6000),
  });
  if (!response.ok) {
    throw new Error(`Frankfurter upstream returned HTTP ${response.status}`);
  }
  const data = (await response.json()) as {
    rates?: Record<string, number>;
  };
  if (!data.rates || !data.rates.USD) {
    throw new Error('Malformed payload from api.frankfurter.app');
  }
  const ratesWithInr = { INR: 1, ...data.rates };
  return {
    base: 'INR',
    ratesPerInr: ratesWithInr,
    inrPerUnit: buildInrPerUnit(ratesWithInr),
    fetchedAt: new Date().toISOString(),
    source: 'api.frankfurter.app (ECB Reference)',
  };
}

export async function getExchangeRates(forceRefresh = false): Promise<CurrencyRatesResult> {
  const cached = getCurrencyCache();
  if (!forceRefresh && cached) {
    const ageMs = Date.now() - new Date(cached.fetchedAt).getTime();
    if (ageMs < CACHE_TTL_MS) {
      return {
        available: true,
        base: 'INR',
        inrPerUnit: cached.inrPerUnit,
        ratesPerInr: cached.ratesPerInr,
        fetchedAt: cached.fetchedAt,
        source: cached.source,
        isCachedFallback: false,
      };
    }
  }

  try {
    const live = await fetchFromOpenErApi();
    await saveCurrencyCache(live);
    return {
      available: true,
      base: 'INR',
      inrPerUnit: live.inrPerUnit,
      ratesPerInr: live.ratesPerInr,
      fetchedAt: live.fetchedAt,
      source: live.source,
      isCachedFallback: false,
    };
  } catch (err1) {
    try {
      const secondary = await fetchFromFrankfurter();
      await saveCurrencyCache(secondary);
      return {
        available: true,
        base: 'INR',
        inrPerUnit: secondary.inrPerUnit,
        ratesPerInr: secondary.ratesPerInr,
        fetchedAt: secondary.fetchedAt,
        source: secondary.source,
        isCachedFallback: false,
      };
    } catch (err2) {
      if (cached) {
        return {
          available: true,
          base: 'INR',
          inrPerUnit: cached.inrPerUnit,
          ratesPerInr: cached.ratesPerInr,
          fetchedAt: cached.fetchedAt,
          source: `${cached.source} (Last Available Cached Rate)`,
          isCachedFallback: true,
          errorMessage: 'Live exchange-rate service is temporarily unreachable; displaying the last available cached INR rates.',
        };
      }
      const message = err2 instanceof Error ? err2.message : String(err1);
      return {
        available: false,
        base: 'INR',
        inrPerUnit: { INR: 1 },
        ratesPerInr: { INR: 1 },
        fetchedAt: null,
        source: 'Unavailable',
        isCachedFallback: false,
        errorMessage: `Exchange-rate API unavailable (${message}). Please retry shortly.`,
      };
    }
  }
}

export async function convertToInr(
  amount: number,
  fromCurrency: string
): Promise<{
  available: boolean;
  originalAmount: number;
  fromCurrency: string;
  convertedInr: number | null;
  rateUsed: number | null;
  isCachedFallback: boolean;
  source: string;
  fetchedAt: string | null;
  errorMessage?: string;
}> {
  const code = fromCurrency.trim().toUpperCase();
  if (code === 'INR') {
    return {
      available: true,
      originalAmount: amount,
      fromCurrency: 'INR',
      convertedInr: Math.round(amount),
      rateUsed: 1,
      isCachedFallback: false,
      source: 'Native INR',
      fetchedAt: new Date().toISOString(),
    };
  }

  const rates = await getExchangeRates();
  if (!rates.available) {
    return {
      available: false,
      originalAmount: amount,
      fromCurrency: code,
      convertedInr: null,
      rateUsed: null,
      isCachedFallback: false,
      source: rates.source,
      fetchedAt: null,
      errorMessage: rates.errorMessage || `Unable to fetch ${code} to INR rate.`,
    };
  }

  const rate = rates.inrPerUnit[code];
  if (!rate) {
    return {
      available: false,
      originalAmount: amount,
      fromCurrency: code,
      convertedInr: null,
      rateUsed: null,
      isCachedFallback: rates.isCachedFallback,
      source: rates.source,
      fetchedAt: rates.fetchedAt,
      errorMessage: `Currency ${code} is not currently supported by the live exchange-rate feed.`,
    };
  }

  return {
    available: true,
    originalAmount: amount,
    fromCurrency: code,
    convertedInr: Math.round(amount * rate),
    rateUsed: rate,
    isCachedFallback: rates.isCachedFallback,
    source: rates.source,
    fetchedAt: rates.fetchedAt,
  };
}
