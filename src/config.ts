// Action inputs, validated up front so a typo fails the run with a clear message
// instead of silently reviewing with surprising settings.

export const SEVERITIES = ['low', 'medium', 'high', 'critical'] as const;
export type Severity = (typeof SEVERITIES)[number];

export const EFFORTS = ['low', 'medium', 'high', 'xhigh', 'max'] as const;
export type Effort = (typeof EFFORTS)[number];

export type Language = 'en' | 'pt-BR';

export interface Config {
  model: string;
  effort: Effort;
  language: Language;
  minSeverity: Severity;
  maxFindings: number;
  maxDiffChars: number;
  include: string[];
  exclude: string[];
  instructionsFile: string;
  failOn: Severity | 'none';
  skipDrafts: boolean;
  incremental: boolean;
}

export const DEFAULT_EXCLUDE = [
  '**/package-lock.json',
  '**/pnpm-lock.yaml',
  '**/yarn.lock',
  '**/bun.lock*',
  '**/Cargo.lock',
  '**/poetry.lock',
  '**/composer.lock',
  '**/go.sum',
  '**/*.min.js',
  '**/*.min.css',
  '**/*.map',
  '**/dist/**',
  '**/build/**',
  '**/vendor/**',
  '**/*.snap',
  '**/*.{png,jpg,jpeg,gif,webp,ico,pdf,zip,woff,woff2,ttf}',
];

export type InputReader = (name: string) => string;

const list = (raw: string): string[] =>
  raw
    .split(/[\n,]/)
    .map((s) => s.trim())
    .filter(Boolean);

function oneOf<T extends string>(value: string, allowed: readonly T[], name: string): T {
  if ((allowed as readonly string[]).includes(value)) return value as T;
  throw new Error(`Input "${name}" must be one of: ${allowed.join(', ')} (got "${value}")`);
}

function int(value: string, name: string, min: number, max: number): number {
  const n = Number(value);
  if (!Number.isInteger(n) || n < min || n > max) {
    throw new Error(`Input "${name}" must be an integer between ${min} and ${max} (got "${value}")`);
  }
  return n;
}

const bool = (value: string, name: string): boolean => {
  if (/^(true|yes|1)$/i.test(value)) return true;
  if (/^(false|no|0)$/i.test(value)) return false;
  throw new Error(`Input "${name}" must be true or false (got "${value}")`);
};

export function readConfig(get: InputReader): Config {
  const model = get('model') || 'claude-opus-5-5';
  if (!/^[a-z0-9][a-z0-9.\-]{2,80}$/.test(model)) throw new Error(`Input "model" looks invalid: "${model}"`);

  const instructionsFile = get('instructions-file') || '.github/ai-review.md';
  if (instructionsFile.includes('..') || instructionsFile.startsWith('/')) {
    throw new Error('Input "instructions-file" must be a relative path inside the repository');
  }

  return {
    model,
    effort: oneOf(get('effort') || 'medium', EFFORTS, 'effort'),
    language: oneOf(get('language') || 'en', ['en', 'pt-BR'] as const, 'language'),
    minSeverity: oneOf(get('min-severity') || 'medium', SEVERITIES, 'min-severity'),
    maxFindings: int(get('max-findings') || '10', 'max-findings', 1, 50),
    maxDiffChars: int(get('max-diff-chars') || '120000', 'max-diff-chars', 2000, 2_000_000),
    include: list(get('include')),
    exclude: [...DEFAULT_EXCLUDE, ...list(get('exclude'))],
    instructionsFile,
    failOn: oneOf(get('fail-on') || 'none', ['none', ...SEVERITIES] as const, 'fail-on'),
    skipDrafts: bool(get('skip-drafts') || 'true', 'skip-drafts'),
    incremental: bool(get('incremental') || 'true', 'incremental'),
  };
}

export const severityRank = (s: Severity): number => SEVERITIES.indexOf(s);
