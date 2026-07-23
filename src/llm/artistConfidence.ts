import path from 'path';
import { fileURLToPath } from 'url';
import { loadTemplate, interpolate } from './templates.js';
import { generateText } from './provider.js';
import type { LastfmClient } from '../lastfm/client.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CONFIDENCE_TEMPLATE_PATH = path.resolve(__dirname, '../../prompts/artist-confidence.md');

export interface ConfidenceResult {
  confidence: 'high' | 'medium' | 'low';
  resolvedName: string | null;
  alternativeSuggestions: string[];
  reasoning: string;
  proceed: boolean;
}

export interface PreflightEntry {
  step: 'artist-confidence';
  templatePath: string;
  input: { artistName: string; lastfmDataPresent: boolean };
  output: ConfidenceResult;
  userConfirmed?: boolean;
  resolvedTo?: string;
}

function assertConfidenceResult(v: unknown): asserts v is ConfidenceResult {
  if (!v || typeof v !== 'object') throw new Error('Expected object');
  const r = v as Record<string, unknown>;
  if (!['high', 'medium', 'low'].includes(r.confidence as string))
    throw new Error(`Invalid confidence value: ${r.confidence}`);
  if (typeof r.proceed !== 'boolean')
    throw new Error(`Invalid proceed value: ${r.proceed}`);
  if (r.resolvedName !== null && typeof r.resolvedName !== 'string')
    throw new Error(`Invalid resolvedName: ${r.resolvedName}`);
  if (!Array.isArray(r.alternativeSuggestions))
    throw new Error('alternativeSuggestions must be an array');
}

export async function checkArtistConfidence(
  artistName: string,
  client: LastfmClient,
  model?: string
): Promise<{ result: ConfidenceResult; lastfmDataPresent: boolean }> {
  let lastfmData = '';
  let lastfmDataPresent = false;

  try {
    const info = await client.getArtistInfo(artistName);
    lastfmDataPresent = true;
    lastfmData = JSON.stringify({
      name: info.name,
      listeners: info.stats.listeners,
      playcount: info.stats.playcount,
      tags: info.tags.slice(0, 5).map(t => t.name),
      bioSummary: info.bio.summary.slice(0, 300),
    }, null, 2);
  } catch {
    lastfmDataPresent = false;
    lastfmData = 'No artist data returned from Last.fm.';
  }

  const noDataMessage = lastfmDataPresent
    ? ''
    : 'No artist data was returned from Last.fm for this name.';

  const template = loadTemplate(CONFIDENCE_TEMPLATE_PATH);
  const userPrompt = interpolate(template.user, {
    artistName,
    lastfmData,
    noDataMessage,
  });

  const completion = await generateText({
    model,
    maxTokens: 2048,
    systemPrompt: template.system,
    userPrompt,
  });

  const rawText = completion.text;

  // Strip markdown code fences if present
  const jsonText = rawText.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim();

  let result: ConfidenceResult;
  try {
    const parsed: unknown = JSON.parse(jsonText);
    assertConfidenceResult(parsed);
    result = parsed;
  } catch (err) {
    throw new Error(`Failed to parse artist confidence response: ${err instanceof Error ? err.message : String(err)}\n\nRaw: ${rawText}`);
  }

  return { result, lastfmDataPresent };
}

export { CONFIDENCE_TEMPLATE_PATH };
