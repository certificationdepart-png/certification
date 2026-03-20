type CounterName =
  | "webhook.requests.total"
  | "webhook.errors.total"
  | "sync.processed.total"
  | "sync.failed.total"
  | "outbox.processed.total"
  | "outbox.failed.total";

const counters = new Map<CounterName, number>();
const timings = new Map<string, number[]>();

function increment(name: CounterName, value = 1) {
  counters.set(name, (counters.get(name) ?? 0) + value);
}

function observe(name: string, valueMs: number) {
  const current = timings.get(name) ?? [];
  current.push(valueMs);
  if (current.length > 200) {
    current.shift();
  }
  timings.set(name, current);
}

function avg(values: number[]) {
  if (values.length === 0) return 0;
  return values.reduce((acc, item) => acc + item, 0) / values.length;
}

function p95(values: number[]) {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.max(Math.ceil(sorted.length * 0.95) - 1, 0);
  return sorted[index];
}

export const observability = {
  increment,
  observe,
  snapshot() {
    const webhookLatency = timings.get("webhook.latency.ms") ?? [];
    return {
      counters: Object.fromEntries(counters.entries()),
      histograms: {
        webhookLatencyMs: {
          avg: Number(avg(webhookLatency).toFixed(2)),
          p95: Number(p95(webhookLatency).toFixed(2)),
          samples: webhookLatency.length,
        },
      },
    };
  },
};
