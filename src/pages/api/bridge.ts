import type { APIRoute } from 'astro';
import { LastfmClient } from '../../lastfm/client.js';
import { checkArtistConfidence } from '../../llm/artistConfidence.js';
import { buildContext } from '../../context/builder.js';
import { runQuery } from '../../llm/harness.js';
import { parseTracksFromResponse } from '../../llm/parseTracksFromResponse.js';
import { resolveProcessingModel } from '../../llm/provider.js';
import { validateStringField, validateOptionalStringField } from '../../lib/validate.js';
import { createJob, toErrorResult, type RouteResult } from '../../lib/jobStore.js';

async function runBridge(
  from: string,
  to: string,
  fromSong: string | undefined,
  toSong: string | undefined,
  voice: string | undefined,
): Promise<RouteResult> {
  try {
    const client = new LastfmClient({ noCache: false });
    const processingModel = resolveProcessingModel();
    const [fromCheck, toCheck] = await Promise.all([
      checkArtistConfidence(from, client, processingModel),
      checkArtistConfidence(to, client, processingModel),
    ]);

    if (fromCheck.result.confidence === 'low') {
      return {
        status: 404,
        body: { error: fromCheck.result.reasoning, type: 'artist_not_found', artist: from },
      };
    }
    if (toCheck.result.confidence === 'low') {
      return {
        status: 404,
        body: { error: toCheck.result.reasoning, type: 'artist_not_found', artist: to },
      };
    }

    const resolvedFrom = fromCheck.result.resolvedName ?? from;
    const resolvedTo = toCheck.result.resolvedName ?? to;

    const query = {
      type: 'bridge' as const,
      fromArtist: resolvedFrom,
      toArtist: resolvedTo,
      ...(fromSong?.trim() ? { fromSong: fromSong.trim() } : {}),
      ...(toSong?.trim()   ? { toSong: toSong.trim() }     : {}),
    };
    const context = await buildContext(client, query);
    const { response: raw } = await runQuery(context, { expand: false, voice });
    const { narrative, tracks, warning } = parseTracksFromResponse(raw);
    if (warning) process.stderr.write(`[bridge] ${warning}\n[bridge] raw tail: ${JSON.stringify(raw.slice(-500))}\n`);

    const fromCorrected = resolvedFrom.toLowerCase() !== from.toLowerCase();
    const toCorrected = resolvedTo.toLowerCase() !== to.toLowerCase();

    return {
      status: 200,
      body: {
        response: narrative,
        tracks,
        ...((fromCorrected || toCorrected) ? {
          resolvedArtist: [resolvedFrom, resolvedTo],
          originalInput: [from, to],
        } : {}),
      },
    };
  } catch (err) {
    return toErrorResult(err, 'bridge');
  }
}

export const POST: APIRoute = async ({ request }) => {
  const { from, to, fromSong, toSong, voice } = await request.json() as {
    from?: string;
    to?: string;
    fromSong?: string;
    toSong?: string;
    voice?: string;
  };

  const fromErr = validateStringField(from, 'from');
  if (fromErr) return Response.json({ error: fromErr.error }, { status: fromErr.status });

  const toErr = validateStringField(to, 'to');
  if (toErr) return Response.json({ error: toErr.error }, { status: toErr.status });

  const fromSongErr = validateOptionalStringField(fromSong, 'fromSong');
  if (fromSongErr) return Response.json({ error: fromSongErr.error }, { status: fromSongErr.status });

  const toSongErr = validateOptionalStringField(toSong, 'toSong');
  if (toSongErr) return Response.json({ error: toSongErr.error }, { status: toSongErr.status });

  const jobId = createJob(() => runBridge(from!, to!, fromSong, toSong, voice));
  return Response.json({ jobId }, { status: 202 });
};
