export const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

export function errorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  return String(err);
}

/** Normalize a hostname: strip protocol, www., path, port; lowercase. Returns null if invalid. */
export function normalizeDomain(input: string): string | null {
  let host = input.trim().toLowerCase();
  if (!host) return null;
  try {
    if (!/^https?:\/\//.test(host)) host = `http://${host}`;
    host = new URL(host).hostname;
  } catch {
    return null;
  }
  host = host.replace(/^www\./, '');
  if (!/^[a-z0-9.-]+\.[a-z]{2,}$/.test(host)) return null;
  return host;
}

export function tldOf(domain: string): string {
  const parts = domain.split('.');
  return parts[parts.length - 1] ?? '';
}

/** Guess a first name from an email local part ("juan.perez@x" -> "Juan"). Empty for role addresses. */
export function firstNameFromEmail(email: string): string {
  const local = email.split('@')[0] ?? '';
  const roleWords = new Set(['info', 'hello', 'contact', 'contacto', 'admin', 'sales', 'ventas', 'cto', 'ceo', 'hr', 'jobs', 'support', 'team', 'dev', 'tech', 'hola', 'press', 'marketing']);
  const token = local.split(/[._-]/)[0] ?? '';
  if (!token || roleWords.has(token) || /\d/.test(token) || token.length < 2) return '';
  return token.charAt(0).toUpperCase() + token.slice(1);
}

export function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}
