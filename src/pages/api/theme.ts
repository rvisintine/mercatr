import type { APIRoute } from 'astro';
import { LastfmClient } from '../../lastfm/client.js';
import { checkArtistConfidence } from '../../llm/artistConfidence.js';
import { runThemeTranslation } from '../../llm/themeTranslate.js';
import { buildContext } from '../../context/builder.js';
import { runQuery } from '../../llm/harness.js';
import { parseTracksFromResponse } from '../../llm/parseTracksFromResponse.js';
import { resolveProcessingModel } from '../../llm/provider.js';
import { validateStringField, validateOptionalStringField } from '../../lib/validate.js';
import { createJob, type RouteResult } from '../../lib/jobStore.js';

async function runTheme(theme: string, seedArtist: string | undefined, voice: string | undefined): Promise<RouteResult> {
  try {
    const client = new LastfmClient({ noCache: false });
    const processingModel = resolveProcessingModel();

    let resolvedSeed: string | undefined;
    if (seedArtist) {
      const { result } = await checkArtistConfidence(seedArtist, client, processingModel);
      if (result.confidence === 'low') {
        return { status: 404, body: { error: result.reasoning, type: 'artist_not_found' } };
      }
      resolvedSeed = result.resolvedName ?? seedArtist;
    }

    const { result: translation } = await runThemeTranslation(theme, processingModel);
    const { translatedTags, moodTerms, genreHints } = translation;

    const query = {
      type: 'theme' as const,
      theme,
      translatedTags,
      translateMetadata: { moodTerms, genreHints },
      ...(resolvedSeed ? { seedArtist: resolvedSeed } : {}),
    };

    const context = await buildContext(client, query);
    const { response: raw } = await runQuery(context, { expand: false, voice });
    const { narrative, tracks, warning } = parseTracksFromResponse(raw);
    if (warning) process.stderr.write(`[theme] ${warning}\n`);

    const seedCorrected = resolvedSeed && seedArtist && resolvedSeed.toLowerCase() !== seedArtist.toLowerCase();

    return {
      status: 200,
      body: {
        response: narrative,
        tracks,
        ...(seedCorrected ? { resolvedArtist: resolvedSeed, originalInput: seedArtist } : {}),
      },
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Internal server error';
    return { status: 500, body: { error: message } };
  }
}

export const POST: APIRoute = async ({ request }) => {
  const { theme, seedArtist, voice } = await request.json() as {
    theme?: string;
    seedArtist?: string;
    voice?: string;
  };

  const themeErr = validateStringField(theme, 'theme');
  if (themeErr) return Response.json({ error: themeErr.error }, { status: themeErr.status });

  const seedErr = validateOptionalStringField(seedArtist, 'seedArtist');
  if (seedErr) return Response.json({ error: seedErr.error }, { status: seedErr.status });

  const jobId = createJob(() => runTheme(theme!, seedArtist, voice));
  return Response.json({ jobId }, { status: 202 });
};
