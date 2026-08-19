import axios from 'axios';
import { config } from '../config';
import { createLogger } from '../logger';
import { errorMessage } from '../utils';

const log = createLogger('email:personalize');

export const isAiPersonalizationConfigured = (): boolean => !!config.anthropicApiKey;

interface ClaudeMessageResponse {
  content: Array<{ type: string; text?: string }>;
}

/**
 * Generates a 1-2 sentence personalized opening line for a cold email using
 * company name + detected tech stack. Only the opener is AI-generated — the
 * rest of the template is fixed — to keep cost low and avoid the model
 * inventing claims about the company. Returns null on any failure so the
 * caller falls back to the generic template line.
 */
export async function generateOpeningLine(company: string, domain: string, techStack: string[]): Promise<string | null> {
  if (!isAiPersonalizationConfigured()) return null;

  const techNote = techStack.length > 0 ? `Su web menciona: ${techStack.join(', ')}.` : '';

  try {
    const { data } = await axios.post<ClaudeMessageResponse>(
      'https://api.anthropic.com/v1/messages',
      {
        model: config.anthropicModel,
        max_tokens: 120,
        temperature: 0.6,
        system:
          'Escribes una única frase de apertura (máx 2 frases cortas) para un email frío B2B en español, ' +
          'tono profesional y cercano, sin inventar datos que no te han dado, sin usar signos de exclamación, ' +
          'sin emojis. Responde solo con la frase, nada más.',
        messages: [
          {
            role: 'user',
            content: `Empresa: ${company} (${domain}). ${techNote} Escribe la frase de apertura.`,
          },
        ],
      },
      {
        headers: {
          'x-api-key': config.anthropicApiKey,
          'anthropic-version': '2023-06-01',
          'content-type': 'application/json',
        },
        timeout: 15_000,
      }
    );

    const text = data.content.find((c) => c.type === 'text')?.text?.trim();
    return text || null;
  } catch (err) {
    log.warn(`AI personalization failed for ${company}, falling back to generic line: ${errorMessage(err)}`);
    return null;
  }
}
