/**
 * Financial Copilot — Claude with tool use over the intelligence layer.
 * Spec: docs/budget/PRD.md §10, ARCHITECTURE.md §5, ADR-6.
 *
 * The grounding rule is structural: every tool is read-only (run_purchase_
 * scenario is side-effect-free), all figures come from tool results, and the
 * full tool-call transcript is persisted with each reply as the audit trail.
 */
import Anthropic from '@anthropic-ai/sdk';
import { desc, eq } from 'drizzle-orm';
import { db, schema } from '../../db';
import { executeTool, toolDefinitions } from './tools';

export function aiEnabled(): boolean {
  return process.env.AI_ENABLED === 'true' && Boolean(process.env.ANTHROPIC_API_KEY);
}

let cached: Anthropic | null = null;
function client(): Anthropic {
  if (!aiEnabled()) throw new Error('AI is not enabled (AI_ENABLED / ANTHROPIC_API_KEY)');
  cached ??= new Anthropic();
  return cached;
}

const COPILOT_MODEL = 'claude-sonnet-5';
const MAX_LOOP_ITERATIONS = 8;

const SYSTEM_PROMPT = `You are the financial copilot inside SafeSpend, a personal finance app built around one daily number: "Safe to Spend Today". You are a calm, practical financial coach — encouraging, direct, never shaming. The user is a real person supporting a family; treat their money questions with care.

Grounding rules (non-negotiable):
- Every dollar figure, date, score, or verdict in your answers MUST come from a tool result in this conversation. Never estimate, recall, or compute money math yourself — the app's deterministic engine does that. If a needed number isn't available from tools, say so.
- For any "can I afford X" question, call run_purchase_scenario and relay its verdict — do not judge affordability yourself.
- If tools return no data (new account), guide the user to connect accounts instead of speculating.

Style:
- Lead with the answer, then the supporting numbers. Keep responses short — a few sentences, occasionally a short list. This renders in a small chat panel.
- Plain text only: no markdown syntax (**, ##, backticks). Simple hyphen lists are fine.
- Forward-looking framing: what to do next, never guilt about the past.
- Plain language; no jargon. Use exact figures from tools (e.g. "$47.83", not "about $50").

Boundaries:
- You provide decision support grounded in the user's own data, not licensed financial advice — remind them of this only when a decision is genuinely consequential (large debt moves, investments), not on every message.
- No specific investment, security, tax-filing, or insurance product recommendations. For those, suggest a licensed professional.
- Politely decline anything unrelated to the user's personal finances.`;

export interface CopilotTurnResult {
  conversationId: string;
  reply: string;
  toolsUsed: string[];
}

interface ToolCallRecord {
  name: string;
  input: unknown;
  result: unknown;
}

export async function runCopilotTurn(
  userId: string,
  message: string,
  conversationId?: string,
): Promise<CopilotTurnResult> {
  // Load or create the conversation.
  let convo =
    conversationId != null
      ? (
          await db
            .select()
            .from(schema.copilotConversations)
            .where(eq(schema.copilotConversations.id, conversationId))
        )[0]
      : undefined;
  if (convo && convo.userId !== userId) throw new Error('Conversation not found');
  if (!convo) {
    [convo] = await db
      .insert(schema.copilotConversations)
      .values({ userId, title: message.slice(0, 80) })
      .returning();
  }

  // Rebuild prior turns (text only — tool transcripts are audit data, and the
  // fresh turn re-fetches live numbers rather than trusting stale ones).
  const history = await db
    .select()
    .from(schema.copilotMessages)
    .where(eq(schema.copilotMessages.conversationId, convo!.id))
    .orderBy(schema.copilotMessages.createdAt);

  const messages: Anthropic.MessageParam[] = [
    ...history.map((m) => ({
      role: m.role as 'user' | 'assistant',
      content: m.content,
    })),
    { role: 'user' as const, content: message },
  ];

  await db.insert(schema.copilotMessages).values({
    conversationId: convo!.id,
    role: 'user',
    content: message,
  });

  const anthropic = client();
  const toolCalls: ToolCallRecord[] = [];
  let tokensIn = 0;
  let tokensOut = 0;
  let reply = '';

  for (let i = 0; i < MAX_LOOP_ITERATIONS; i++) {
    const response = await anthropic.messages.create({
      model: COPILOT_MODEL,
      max_tokens: 8000,
      output_config: { effort: 'medium' },
      system: [{ type: 'text', text: SYSTEM_PROMPT, cache_control: { type: 'ephemeral' } }],
      tools: toolDefinitions,
      messages,
    });
    tokensIn += response.usage.input_tokens;
    tokensOut += response.usage.output_tokens;

    if (response.stop_reason === 'refusal') {
      reply = "I can't help with that one — but I'm here for anything about your finances.";
      break;
    }

    const toolUses = response.content.filter(
      (b): b is Anthropic.ToolUseBlock => b.type === 'tool_use',
    );
    if (toolUses.length === 0 || response.stop_reason !== 'tool_use') {
      reply = response.content
        .filter((b): b is Anthropic.TextBlock => b.type === 'text')
        .map((b) => b.text)
        .join('\n')
        .trim();
      break;
    }

    // Execute all requested tools; results go back in ONE user message.
    messages.push({ role: 'assistant', content: response.content });
    const results: Anthropic.ToolResultBlockParam[] = [];
    for (const use of toolUses) {
      let result: unknown;
      try {
        result = await executeTool(userId, use.name, use.input as Record<string, unknown>);
      } catch (err) {
        result = { error: err instanceof Error ? err.message : 'Tool failed' };
      }
      toolCalls.push({ name: use.name, input: use.input, result });
      results.push({
        type: 'tool_result',
        tool_use_id: use.id,
        content: JSON.stringify(result),
      });
    }
    messages.push({ role: 'user', content: results });
  }

  if (!reply) {
    reply =
      'I gathered the data but ran out of room to finish the answer — try asking a more specific question.';
  }

  await db.insert(schema.copilotMessages).values({
    conversationId: convo!.id,
    role: 'assistant',
    content: reply,
    toolCalls: toolCalls as unknown as Record<string, unknown>[],
    model: COPILOT_MODEL,
    tokensIn,
    tokensOut,
  });
  await db
    .update(schema.copilotConversations)
    .set({ updatedAt: new Date() })
    .where(eq(schema.copilotConversations.id, convo!.id));

  return {
    conversationId: convo!.id,
    reply,
    toolsUsed: [...new Set(toolCalls.map((t) => t.name))],
  };
}

export async function listConversations(userId: string) {
  return db
    .select()
    .from(schema.copilotConversations)
    .where(eq(schema.copilotConversations.userId, userId))
    .orderBy(desc(schema.copilotConversations.updatedAt))
    .limit(20);
}

export async function listMessages(userId: string, conversationId: string) {
  const [convo] = await db
    .select()
    .from(schema.copilotConversations)
    .where(eq(schema.copilotConversations.id, conversationId));
  if (!convo || convo.userId !== userId) return null;
  const rows = await db
    .select()
    .from(schema.copilotMessages)
    .where(eq(schema.copilotMessages.conversationId, conversationId))
    .orderBy(schema.copilotMessages.createdAt);
  return rows.map((m) => ({
    id: m.id,
    role: m.role,
    content: m.content,
    toolsUsed: Array.isArray(m.toolCalls)
      ? [...new Set((m.toolCalls as Array<{ name?: string }>).map((t) => t.name).filter(Boolean))]
      : [],
    createdAt: m.createdAt,
  }));
}
