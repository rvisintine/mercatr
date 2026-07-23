import path from 'path';
import { fileURLToPath } from 'url';
import { loadTemplate, interpolate } from './templates.js';
import { generateText } from './provider.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const TRACK_EXTRACT_TEMPLATE_PATH = path.resolve(__dirname, '../../prompts/track-extract.md');

export interface TrackInfo {
  artist: string;
  track: string;
  album: string;
  year: string;
}

function assertTrackInfoArray(v: unknown): asserts v is TrackInfo[] {
  if (!Array.isArray(v)) throw new Error('Expected array');
  for (const item of v) {
    if (!item || typeof item !== 'object') throw new Error('Each track must be an object');
    for (const field of ['artist', 'track']) {
      if (typeof (item as Record<string, unknown>)[field] !== 'string')
        throw new Error(`Track missing string field: ${field}`);
    }
  }
}

export async function extractTracks(
  responseText: string,
  model?: string
): Promise<TrackInfo[]> {
  const template = loadTemplate(TRACK_EXTRACT_TEMPLATE_PATH);
  const userPrompt = interpolate(template.user, { response: responseText });

  const completion = await generateText({
    model,
    maxTokens: 2560,
    systemPrompt: template.system,
    userPrompt,
  });

  const rawText = completion.text;

  const jsonText = rawText.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim();

  let tracks: TrackInfo[];
  try {
    const parsed: unknown = JSON.parse(jsonText);
    assertTrackInfoArray(parsed);
    tracks = parsed;
  } catch (err) {
    throw new Error(`Failed to parse track-extract response: ${err instanceof Error ? err.message : String(err)}\n\nRaw: ${rawText}`);
  }

  return tracks;
}
