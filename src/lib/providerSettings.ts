import fs from 'node:fs';
import path from 'node:path';

export type LlmProvider = 'claude' | 'openai-compat';

const OVERRIDE_PATH = path.resolve(process.cwd(), '.cache/provider-override.json');

function loadOverride(): LlmProvider | null {
  try {
    const raw = fs.readFileSync(OVERRIDE_PATH, 'utf-8');
    const parsed = JSON.parse(raw) as { provider?: unknown };
    if (parsed.provider === 'claude' || parsed.provider === 'openai-compat') {
      return parsed.provider;
    }
  } catch {
    // No override file yet, or unreadable -- fall back to LLM_PROVIDER env default.
  }
  return null;
}

let cachedOverride = loadOverride();

/**
 * Runtime-switchable active provider, persisted to the .cache volume so a
 * choice made in the UI survives container restarts without editing .env.
 * Returns null when no override has been set, meaning callers should fall
 * back to the LLM_PROVIDER env var.
 */
export function getProviderOverride(): LlmProvider | null {
  return cachedOverride;
}

export function setProviderOverride(provider: LlmProvider): void {
  cachedOverride = provider;
  fs.mkdirSync(path.dirname(OVERRIDE_PATH), { recursive: true });
  fs.writeFileSync(OVERRIDE_PATH, JSON.stringify({ provider }), 'utf-8');
}
