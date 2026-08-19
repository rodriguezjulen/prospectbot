export interface TemplateVars {
  first_name: string;
  company: string;
  job_title: string;
  email: string;
}

function render(text: string, vars: TemplateVars): string {
  return text
    .replace(/\{\{first_name\}\}/g, vars.first_name || 'equipo')
    .replace(/\{\{company\}\}/g, vars.company)
    .replace(/\{\{job_title\}\}/g, vars.job_title || '')
    .replace(/\{\{email\}\}/g, vars.email);
}

const DEFAULT_BODY = `Hola {{first_name}},

{{opening_line}}

¿Tenéis 15 minutos esta semana para una llamada rápida?

Saludos,
{{from_name}}`;

const FALLBACK_OPENING_LINE =
  'Vi que en {{company}} estáis construyendo cosas interesantes en el sector tech, y quería preguntaros rápidamente si os interesaría conocer cómo ayudamos a equipos como el vuestro a [propuesta de valor aquí].';

/**
 * Renders subject + plain-text body from templates, appending the configured unsubscribe line.
 * `openingLine` is the (optionally AI-generated) personalized paragraph — falls back to a
 * generic line when not provided, so the email is always well-formed even without AI.
 */
export function renderEmail(
  vars: TemplateVars,
  fromName: string,
  subjectTemplate: string,
  bodyTemplate: string,
  unsubscribeText: string,
  openingLine?: string | null
): { subject: string; text: string } {
  const subject = render(subjectTemplate, vars);
  const opening = render(openingLine || FALLBACK_OPENING_LINE, vars);
  const body = render(bodyTemplate, vars)
    .replace(/\{\{opening_line\}\}/g, opening)
    .replace(/\{\{from_name\}\}/g, fromName);
  const text = `${body}\n\n---\n${unsubscribeText}`;
  return { subject, text };
}

export const defaultBodyTemplate = DEFAULT_BODY;
