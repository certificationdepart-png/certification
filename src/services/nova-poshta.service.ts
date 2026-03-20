/**
 * Nova Poshta API 2.0 wrapper.
 * @see https://devcenter.novaposhta.ua/
 */

const NP_API_URL = "https://api.novaposhta.ua/v2.0/json/";
const CACHE_TTL_MS = 10 * 60 * 1000; // 10 min
const MAX_RETRIES = 3;
const INITIAL_BACKOFF_MS = 500;

export type NovaPoshtaCity = {
  ref: string;
  name: string;
  area?: string;
  areaDescription?: string;
};

export type NovaPoshtaWarehouse = {
  ref: string;
  description: string;
  number?: string;
  cityRef: string;
  cityDescription?: string;
};

type NpApiResponse<T> = {
  success: boolean;
  data?: T[];
  errors?: string[];
  warnings?: string[];
};

const cityCache = new Map<string, { data: NovaPoshtaCity[]; expires: number }>();
const warehouseCache = new Map<string, { data: NovaPoshtaWarehouse[]; expires: number }>();

function buildCacheKey(prefix: string, ...parts: string[]): string {
  return `${prefix}:${parts.join(":")}`;
}

async function npRequest<T>(
  apiKey: string,
  modelName: string,
  calledMethod: string,
  methodProperties: Record<string, string | number | undefined>,
): Promise<T[]> {
  const body = {
    apiKey,
    modelName,
    calledMethod,
    methodProperties: Object.fromEntries(
      Object.entries(methodProperties).filter(([, v]) => v !== undefined && v !== ""),
    ) as Record<string, string | number>,
  };

  let lastError: Error | null = null;

  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    try {
      const res = await fetch(NP_API_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      const status = res.status;

      if (status === 429) {
        const backoff = INITIAL_BACKOFF_MS * Math.pow(2, attempt);
        await new Promise((r) => setTimeout(r, backoff));
        continue;
      }

      if (status >= 500) {
        const backoff = INITIAL_BACKOFF_MS * Math.pow(2, attempt);
        await new Promise((r) => setTimeout(r, backoff));
        continue;
      }

      const json = (await res.json()) as NpApiResponse<T>;

      if (!json.success) {
        const msg = json.errors?.join("; ") ?? "Невідома помилка API Нової Пошти";
        throw new Error(msg);
      }

      return json.data ?? [];
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
      if (attempt < MAX_RETRIES - 1) {
        const backoff = INITIAL_BACKOFF_MS * Math.pow(2, attempt);
        await new Promise((r) => setTimeout(r, backoff));
      } else {
        throw lastError;
      }
    }
  }

  throw lastError ?? new Error("Nova Poshta API request failed");
}

function normalizeCity(raw: Record<string, unknown>): NovaPoshtaCity {
  return {
    ref: String(raw.Ref ?? raw.ref ?? ""),
    name: String(raw.Description ?? raw.description ?? raw.SettlementTypeDescription ?? ""),
    area: raw.Area ? String(raw.Area) : undefined,
    areaDescription: raw.AreaDescription ? String(raw.AreaDescription) : undefined,
  };
}

function normalizeWarehouse(raw: Record<string, unknown>): NovaPoshtaWarehouse {
  return {
    ref: String(raw.Ref ?? raw.ref ?? ""),
    description: String(raw.Description ?? raw.description ?? ""),
    number: raw.Number !== undefined ? String(raw.Number) : undefined,
    cityRef: String(raw.CityRef ?? raw.cityRef ?? ""),
    cityDescription: raw.CityDescription ? String(raw.CityDescription) : undefined,
  };
}

/**
 * Search cities by name (partial match).
 * Results are cached for 10 minutes per (apiKey, query).
 */
export async function searchCities(apiKey: string, query: string): Promise<NovaPoshtaCity[]> {
  const trimmed = query.trim();
  if (!trimmed) return [];

  const key = buildCacheKey("cities", apiKey.slice(0, 8), trimmed.toLowerCase());
  const cached = cityCache.get(key);
  if (cached && Date.now() < cached.expires) {
    return cached.data;
  }

  const raw = await npRequest<Record<string, unknown>>(apiKey, "Address", "getCities", {
    FindByString: trimmed,
  });

  const normalized = raw.map(normalizeCity).filter((c) => c.ref && c.name);
  cityCache.set(key, { data: normalized, expires: Date.now() + CACHE_TTL_MS });

  return normalized;
}

/**
 * Get warehouses (branches) for a city by its Ref.
 * Results are cached for 10 minutes per (apiKey, cityRef).
 */
export async function getWarehouses(
  apiKey: string,
  cityRef: string,
): Promise<NovaPoshtaWarehouse[]> {
  const key = buildCacheKey("warehouses", apiKey.slice(0, 8), cityRef);
  const cached = warehouseCache.get(key);
  if (cached && Date.now() < cached.expires) {
    return cached.data;
  }

  const raw = await npRequest<Record<string, unknown>>(apiKey, "Address", "getWarehouses", {
    CityRef: cityRef || undefined,
  });

  const normalized = raw.map(normalizeWarehouse).filter((w) => w.ref && w.description);
  warehouseCache.set(key, { data: normalized, expires: Date.now() + CACHE_TTL_MS });

  return normalized;
}
