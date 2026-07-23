import { randomUUID } from 'node:crypto';

export interface RouteResult {
  status: number;
  body: Record<string, unknown>;
}

type JobState =
  | { status: 'pending' }
  | { status: 'done'; result: RouteResult };

const JOB_TTL_MS = 15 * 60 * 1000;
const jobs = new Map<string, { state: JobState; createdAt: number }>();

function sweepExpired() {
  const cutoff = Date.now() - JOB_TTL_MS;
  for (const [id, job] of jobs) {
    if (job.createdAt < cutoff) jobs.delete(id);
  }
}

/**
 * Converts a caught error into a 500 RouteResult, logging the full error
 * (including `cause`, where undici puts the real DNS/connect/TLS detail
 * behind generic messages like "fetch failed") to stderr first. Route
 * handlers only ever return `message` to the client -- this is the only
 * place that detail is visible.
 */
export function toErrorResult(err: unknown, context: string): RouteResult {
  const message = err instanceof Error ? err.message : 'Internal server error';
  const cause = err instanceof Error ? err.cause : undefined;
  process.stderr.write(
    `[${context}] ${message}${cause ? ` | cause: ${cause instanceof Error ? cause.stack ?? cause.message : String(cause)}` : ''}\n`,
  );
  return { status: 500, body: { error: message } };
}

/**
 * Runs `run` in the background and returns a job id immediately. Callers
 * poll getJobState() for the result instead of holding a single request
 * open for the whole pipeline -- needed because slow (e.g. self-hosted)
 * LLM backends can take longer than a reverse proxy's read timeout allows.
 */
export function createJob(run: () => Promise<RouteResult>): string {
  sweepExpired();
  const id = randomUUID();
  jobs.set(id, { state: { status: 'pending' }, createdAt: Date.now() });

  run()
    .then(result => {
      const job = jobs.get(id);
      if (job) job.state = { status: 'done', result };
    })
    .catch(err => {
      const job = jobs.get(id);
      if (!job) return;
      job.state = { status: 'done', result: toErrorResult(err, 'jobStore') };
    });

  return id;
}

export function getJobState(id: string): JobState | undefined {
  return jobs.get(id)?.state;
}
