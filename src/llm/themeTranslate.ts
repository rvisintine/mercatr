import path from 'path';
import { fileURLToPath } from 'url';
import { loadTemplate, interpolate } from './templates.js';
import { generateText } from './provider.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const THEME_TRANSLATE_TEMPLATE_PATH = path.resolve(__dirname, '../../prompts/theme-translate.md');

export interface ThemeTranslateResult {
  originalTheme: string;
  translatedTags: string[];
  moodTerms: string[];
  genreHints: string[];
  reasoning: string;
}

export interface ThemeTranslateEntry {
  step: 'theme-translate';
  templatePath: string;
  input: { theme: string };
  output: ThemeTranslateResult;
  lastfmTagsQueried: string[];
  lastfmResultsReturned: number;
}

function assertThemeTranslateResult(v: unknown): asserts v is ThemeTranslateResult {
  if (!v || typeof v !== 'object') throw new Error('Expected object');
  const r = v as Record<string, unknown>;
  for (const field of ['translatedTags', 'moodTerms', 'genreHints']) {
    if (!Array.isArray(r[field])) throw new Error(`${field} must be an array`);
  }
  if (typeof r.originalTheme !== 'string') throw new Error('originalTheme must be a string');
}

export async function runThemeTranslation(
  theme: string,
  model?: string
): Promise<{ result: ThemeTranslateResult }> {
  const template = loadTemplate(THEME_TRANSLATE_TEMPLATE_PATH);
  const userPrompt = interpolate(template.user, { theme });

  const completion = await generateText({
    model,
    maxTokens: 2048,
    systemPrompt: template.system,
    userPrompt,
  });

  const rawText = completion.text;

  const jsonText = rawText.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim();

  let result: ThemeTranslateResult;
  try {
    const parsed: unknown = JSON.parse(jsonText);
    assertThemeTranslateResult(parsed);
    result = parsed;
  } catch (err) {
    throw new Error(`Failed to parse theme-translate response: ${err instanceof Error ? err.message : String(err)}\n\nRaw: ${rawText}`);
  }

  return { result };
}
