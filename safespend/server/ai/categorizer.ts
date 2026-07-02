/**
 * Tier-3 AI categorization fallback (ARCHITECTURE ADR-4): batched Haiku with
 * structured outputs, merchant strings only — no amounts, no balances, no
 * identity data. Only runs when tiers 1 (user rules) and 2 (Plaid PFC) fail.
 */
import Anthropic from '@anthropic-ai/sdk';
import { aiEnabled } from './copilot';

const CATEGORIZER_MODEL = 'claude-haiku-4-5';
const MAX_BATCH = 40;

let cached: Anthropic | null = null;
function client(): Anthropic {
  cached ??= new Anthropic();
  return cached;
}

export interface AiCategoryResult {
  index: number;
  category: string | null; // taxonomy name, or null when unsure
}

/**
 * Map merchant descriptions onto the user's category names.
 * Returns null category for anything the model isn't confident about —
 * those stay in the review queue, which is the honest failure mode.
 */
export async function categorizeWithAI(
  merchants: string[],
  categoryNames: string[],
): Promise<AiCategoryResult[]> {
  if (!aiEnabled() || merchants.length === 0) {
    return merchants.map((_, index) => ({ index, category: null }));
  }

  const out: AiCategoryResult[] = [];
  for (let start = 0; start < merchants.length; start += MAX_BATCH) {
    const batch = merchants.slice(start, start + MAX_BATCH);
    try {
      const response = await client().messages.create({
        model: CATEGORIZER_MODEL,
        max_tokens: 4000,
        system:
          'You classify bank-transaction merchant strings into personal-finance categories. Choose only from the provided category list. Use null when genuinely unsure — a wrong category is worse than no category.',
        output_config: {
          format: {
            type: 'json_schema',
            schema: {
              type: 'object',
              properties: {
                results: {
                  type: 'array',
                  items: {
                    type: 'object',
                    properties: {
                      index: { type: 'integer' },
                      category: {
                        anyOf: [{ type: 'string', enum: categoryNames }, { type: 'null' }],
                      },
                    },
                    required: ['index', 'category'],
                    additionalProperties: false,
                  },
                },
              },
              required: ['results'],
              additionalProperties: false,
            },
          },
        },
        messages: [
          {
            role: 'user',
            content: JSON.stringify({
              categories: categoryNames,
              merchants: batch.map((m, i) => ({ index: start + i, text: m })),
            }),
          },
        ],
      });

      const text = response.content.find(
        (b): b is Anthropic.TextBlock => b.type === 'text',
      )?.text;
      const parsed = text ? (JSON.parse(text) as { results: AiCategoryResult[] }) : { results: [] };
      const valid = new Set(categoryNames);
      for (const r of parsed.results) {
        if (
          Number.isInteger(r.index) &&
          r.index >= start &&
          r.index < start + batch.length &&
          (r.category === null || valid.has(r.category))
        ) {
          out.push({ index: r.index, category: r.category });
        }
      }
    } catch (err) {
      // Fail open into the review queue — never block a sync on the AI tier.
      console.error('[ai categorizer]', err);
    }
  }

  const byIndex = new Map(out.map((r) => [r.index, r]));
  return merchants.map((_, index) => byIndex.get(index) ?? { index, category: null });
}
