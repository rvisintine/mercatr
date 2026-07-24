import type { APIRoute } from 'astro';
import {
  resolveLlmSettings,
  resolveProcessingModel,
  isProviderConfigured,
  type LlmProvider,
} from '../../llm/provider.js';
import { setProviderOverride } from '../../lib/providerSettings.js';

const PROVIDERS: { id: LlmProvider; label: string }[] = [
  { id: 'claude', label: 'Claude' },
  { id: 'openai-compat', label: 'Self-hosted (OpenAI-compatible)' },
];

function buildConfigResponse() {
  const { provider, model } = resolveLlmSettings();
  const processingModel = resolveProcessingModel();
  return {
    provider,
    model,
    processingModel,
    availableProviders: PROVIDERS.map(p => ({ ...p, configured: isProviderConfigured(p.id) })),
  };
}

export const GET: APIRoute = () => {
  return Response.json(buildConfigResponse());
};

export const POST: APIRoute = async ({ request }) => {
  const { provider } = await request.json() as { provider?: string };

  if (provider !== 'claude' && provider !== 'openai-compat') {
    return Response.json({ error: 'provider must be "claude" or "openai-compat"' }, { status: 400 });
  }

  if (!isProviderConfigured(provider)) {
    return Response.json(
      { error: `${provider} is not configured -- check its required environment variables` },
      { status: 422 },
    );
  }

  setProviderOverride(provider);
  return Response.json(buildConfigResponse());
};
