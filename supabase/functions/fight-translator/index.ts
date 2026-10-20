/**
 * fight-translator — TODO(phase-3). Skeleton only; not wired into the UI yet.
 *
 * Flow (to build):
 *   1. Each partner inserts their private entry into fight_entries (owner-only RLS).
 *   2. This function is called after each insert. It reframes *that* entry into
 *      an underlying need and stores reframed_need (service role).
 *   3. When both entries exist, set fight_sessions.revealed_at and
 *      cooldown_until = now() + interval '20 minutes'; a definer function
 *      exposes both reframed needs (never the partner's raw text).
 *
 * Env: ANTHROPIC_API_KEY
 */
import Anthropic from 'npm:@anthropic-ai/sdk';
import { cors, json, requireCaller } from '../_shared/auth.ts';

const client = new Anthropic(); // reads ANTHROPIC_API_KEY

const SYSTEM = `You help one partner in a couple understand themselves during a disagreement.
You receive what they privately wrote. Reframe it as the underlying need or feeling,
in first person, warm and non-blaming, without quoting them or describing their partner's faults.
Keep it to one or two short sentences. Example: "I need to feel like my time matters to you."`;

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  const caller = await requireCaller(req);
  if (caller instanceof Response) return caller;

  const { entryId } = await req.json().catch(() => ({}));
  const { data: entry } = await caller.admin
    .from('fight_entries')
    .select('id, owner_id, raw_text')
    .eq('id', entryId)
    .maybeSingle();
  if (!entry || entry.owner_id !== caller.userId) return json({ error: 'forbidden' }, 403);

  try {
    const response = await client.beta.messages.create({
      model: 'claude-opus-5-5',
      max_tokens: 1024,
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
      output_config: {
        effort: 'low',
        format: {
          type: 'json_schema',
          schema: {
            type: 'object',
            properties: { need: { type: 'string' } },
            required: ['need'],
            additionalProperties: false,
          },
        },
      },
      system: SYSTEM,
      messages: [{ role: 'user', content: entry.raw_text }],
    } as never);

    const message = response as unknown as {
      stop_reason: string;
      content: { type: string; text?: string }[];
    };
    if (message.stop_reason === 'refusal') return json({ error: 'could_not_reframe' }, 422);
    const text = message.content.find((b) => b.type === 'text')?.text ?? '{}';
    const { need } = JSON.parse(text) as { need?: string };
    if (!need) return json({ error: 'could_not_reframe' }, 422);

    await caller.admin.from('fight_entries').update({ reframed_need: need }).eq('id', entry.id);
    // TODO(phase-3): if both entries now have reframed_need → set revealed_at + cooldown_until.
    return json({ ok: true });
  } catch (e) {
    if (e instanceof Anthropic.RateLimitError) return json({ error: 'busy' }, 429);
    if (e instanceof Anthropic.APIError) return json({ error: 'llm_error', status: e.status }, 502);
    throw e;
  }
});
