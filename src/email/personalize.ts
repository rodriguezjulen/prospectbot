import axios from 'axios';
import { config } from '../config';
import { createLogger } from '../logger';
import { errorMessage } from '../utils';

const log = createLogger('email:personalize');

export const isAiPersonalizationConfigured = (): boolean => !!config.anthropicApiKey;

interface ClaudeMessageResponse {
  content: Array<{ type: string; text?: string }>;
}

async function callClaude(system: string, userContent: string, maxTokens: number): Promise<string | null> {
  try {
    const { data } = await axios.post<ClaudeMessageResponse>(
      'https://api.anthropic.com/v1/messages',
      {
        model: config.anthropicModel,
        max_tokens: maxTokens,
        temperature: 0.6,
        system,
        messages: [{ role: 'user', content: userContent }],
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
    return data.content.find((c) => c.type === 'text')?.text?.trim() || null;
  } catch (err) {
    log.warn(`Claude call failed: ${errorMessage(err)}`);
    return null;
  }
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
  const text = await callClaude(
    'Escribes una única frase de apertura (máx 2 frases cortas) para un email frío B2B en español, ' +
      'tono profesional y cercano, sin inventar datos que no te han dado, sin usar signos de exclamación, ' +
      'sin emojis. Responde solo con la frase, nada más.',
    `Empresa: ${company} (${domain}). ${techNote} Escribe la frase de apertura.`,
    120
  );
  if (!text) log.warn(`AI opening line failed for ${company}, falling back to generic line`);
  return text;
}

/**
 * Drafts a short reply to a prospect's response, given the reply snippet and company context.
 * Never invents pricing, features, or commitments not already implied by the outbound template —
 * asks a clarifying question or proposes a call instead. Returns null on failure (caller should skip).
 */
export async function generateReplyDraft(company: string, replySnippet: string, firstName: string): Promise<string | null> {
  if (!isAiPersonalizationConfigured()) return null;

  return callClaude(
    'Escribes una respuesta corta (3-5 frases) a la contestación de un prospecto B2B en español, tono cercano y profesional. ' +
      'No inventes precios, funcionalidades ni compromisos concretos — si preguntan algo específico que no sabes, propone una llamada de 15 minutos para resolverlo. ' +
      'Si la respuesta del prospecto es negativa o pide no recibir más correos, responde solo confirmando que no le contactarán más, sin insistir. ' +
      'Sin emojis, sin firma (se añade aparte). Responde solo con el cuerpo del mensaje.',
    `Empresa: ${company}. Nombre del contacto: ${firstName}. Su respuesta fue: "${replySnippet}". Escribe la respuesta.`,
    300
  );
}
