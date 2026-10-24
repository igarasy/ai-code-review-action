// USD per million tokens (Anthropic first-party API, October 2026). Used only
// for the cost estimate shown in the summary; unknown models show no estimate.
const PRICES: Record<string, { input: number; output: number; cacheRead: number }> = {
  'claude-fable-5-1': { input: 10, output: 50, cacheRead: 0.25 },
  'claude-opus-5-5': { input: 4, output: 20, cacheRead: 0.2 },
  'claude-opus-5': { input: 5, output: 25, cacheRead: 0.5 },
  'claude-sonnet-5-5': { input: 2, output: 10, cacheRead: 0.2 },
  'claude-sonnet-5': { input: 2, output: 10, cacheRead: 0.2 },
  'claude-haiku-5-5': { input: 0.1, output: 0.5, cacheRead: 0.01 },
};

export function estimateCostUsd(model: string, usage: { input: number; output: number; cacheRead: number; cacheWrite: number }): number | null {
  const p = PRICES[model];
  if (!p) return null;
  const perToken = (usd: number) => usd / 1_000_000;
  return (
    usage.input * perToken(p.input) +
    usage.cacheWrite * perToken(p.input * 1.25) +
    usage.cacheRead * perToken(p.cacheRead) +
    usage.output * perToken(p.output)
  );
}
