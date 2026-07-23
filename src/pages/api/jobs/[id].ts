import type { APIRoute } from 'astro';
import { getJobState } from '../../../lib/jobStore.js';

export const GET: APIRoute = async ({ params }) => {
  const id = params.id;
  if (!id) return Response.json({ error: 'Missing job id' }, { status: 400 });

  const state = getJobState(id);
  if (!state) return Response.json({ error: 'Job not found or expired' }, { status: 404 });

  if (state.status === 'pending') {
    return Response.json({ jobStatus: 'pending' });
  }

  return Response.json(
    { jobStatus: 'done', ...state.result.body },
    { status: state.result.status },
  );
};
