import type { APIRoute } from 'astro';
import { LastfmClient } from '../../lastfm/client.js';
import { checkArtistConfidence } from '../../llm/artistConfidence.js';
import { buildContext } from '../../context/builder.js';
import { runQuery } from '../../llm/harness.js';
import { parseTracksFromResponse } from '../../llm/parseTracksFromResponse.js';
import { resolveProcessingModel } from '../../llm/provider.js';
import { validateStringField, validateOptionalStringField } from '../../lib/validate.js';
import { createJob, toErrorResult, type RouteResult } from '../../lib/jobStore.js';

async function runExplore(artist: string, track: string | undefined, voice: string | undefined): Promise<RouteResult> {
  try {
    const client = new LastfmClient({ noCache: false });
    const processingModel = resolveProcessingModel();
    const { result } = await checkArtistConfidence(artist, client, processingModel);

    if (result.confidence === 'low') {
      return { status: 404, body: { error: result.reasoning, type: 'artist_not_found' } };
    }

    const resolvedName = result.resolvedName ?? artist;
    const query = { type: 'explore' as const, artist: resolvedName, ...(track ? { track } : {}) };
    const context = await buildContext(client, query);
    const { response: raw } = await runQuery(context, { expand: false, voice });
    const { narrative, tracks, warning } = parseTracksFromResponse(raw);
    if (warning) process.stderr.write(`[explore] ${warning}\n[explore] raw tail: ${JSON.stringify(raw.slice(-500))}\n`);

    const corrected = resolvedName.toLowerCase() !== artist.toLowerCase();
    return {
      status: 200,
      body: {
        response: narrative,
        tracks,
        ...(corrected ? { resolvedArtist: resolvedName, originalInput: artist } : {}),
      },
    };
  } catch (err) {
    return toErrorResult(err, 'explore');
  }
}

export const POST: APIRoute = async ({ request }) => {
  const { artist, track, voice } = await request.json() as {
    artist?: string;
    track?: string;
    voice?: string;
  };

  const artistErr = validateStringField(artist, 'artist');
  if (artistErr) return Response.json({ error: artistErr.error }, { status: artistErr.status });

  const trackErr = validateOptionalStringField(track, 'track');
  if (trackErr) return Response.json({ error: trackErr.error }, { status: trackErr.status });

  const jobId = createJob(() => runExplore(artist!, track, voice));
  return Response.json({ jobId }, { status: 202 });
};
