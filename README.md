# ProspectBot v1.0

Generador automatizado de leads B2B (startups/pymes tech). Busca empresas,
valida emails, filtra por tech-stack/tamaño, y exporta CSV semanal listo para
Lemlist.

## Setup (5 pasos)

```bash
git clone <repo-url> && cd prospectbot
npm install
cp .env.example .env        # rellena tus API keys (opcional, ver abajo)
npm run db:init              # crea tablas en Postgres
npm run dev                  # ejecución manual (una vez)
```

Producción:

```bash
npm run build && npm start   # arranca el cron semanal (lunes 09:00 UTC)
```

## Modo MOCK (sin API keys)

Si faltan `HUNTER_API_KEY`, `GOOGLE_CSE_ID` o `GOOGLE_API_KEY`, ProspectBot
corre automáticamente en modo mock: usa una lista de empresas de ejemplo y
contactos simulados. Útil para probar el pipeline entero (CSV, DB, filtros)
sin gastar cuota de las APIs gratuitas.

## Base de datos

Local con Docker:

```bash
docker compose up -d
```

O usa un Postgres existente y apunta `DATABASE_URL` en `.env`.

## Variables de entorno

Ver [.env.example](.env.example) — todas comentadas. Las relevantes:

- `HUNTER_API_KEY` / `GOOGLE_CSE_ID` / `GOOGLE_API_KEY`: vacías = modo mock.
- `SEARCH_KEYWORDS`, `SEARCH_COUNTRY`, `SEARCH_LIMIT`: qué buscar.
- `MIN_COMPANY_SIZE` / `MAX_COMPANY_SIZE` / `FOCUS_TECH_STACK`: filtros.
- `LEMLIST_API_KEY`: opcional, sync automático si presente.
- `TELEGRAM_BOT_TOKEN` / `TELEGRAM_CHAT_ID`: opcional, notificación al terminar.
- `CRON_SCHEDULE`: expresión cron UTC (default lunes 09:00).
- `HUNTER_MAX_SEARCHES_PER_RUN`: cap para no agotar el free tier (100/mes).

## Deploy en Railway

1. Push a GitHub (repo público u privado).
2. Railway → New Project → Deploy from GitHub repo.
3. Añade plugin PostgreSQL (Railway te da `DATABASE_URL` automático).
4. En Variables, pega el resto del `.env` (API keys, cron, filtros).
5. Start command: `npm run build && npm start`.
6. Railway mantiene el proceso vivo — el cron interno (`node-cron`) dispara
   cada semana sin necesidad de un cron externo.

## Troubleshooting

- **`role "..." does not exist"` al arrancar**: `DATABASE_URL` mal o Postgres
  no levantado. Revisa `docker compose ps` o corre `npm run db:init` de nuevo.
- **Hunter devuelve 0 contactos**: cuota mensual agotada (100/mes free tier).
  Revisa `HUNTER_MAX_SEARCHES_PER_RUN` o espera al reset mensual.
- **CSV vacío**: normal si ningún lead pasó los filtros de tamaño/tech-stack
  en ese run — revisa `logs/YYYY-MM-DD.log` para ver qué se descartó y por qué.
- **`getaddrinfo ENOTFOUND` en logs**: dominio mock o caído — el pipeline
  falla "open" (no descarta el lead) para no perder resultados por un DNS caído.
- **Cron no dispara**: verifica `CRON_SCHEDULE` es válido; el proceso valida
  y cae a `0 9 * * 1` si no lo es (revisa logs de arranque).

## Scripts

| Comando | Qué hace |
|---|---|
| `npm run dev` | Corre el pipeline una vez (equivalente a `--once`) |
| `npm run build` | Compila TypeScript a `dist/` |
| `npm start` | Arranca proceso con cron semanal (producción) |
| `npm run db:init` | Crea las tablas si no existen |
| `npm run test:scraper` | Prueba solo el scraper (mock o real) |
| `npm run typecheck` | `tsc --noEmit` |

## Notas de diseño

- Sin Selenium/Puppeteer — Cheerio + axios, scraping ligero.
- LinkedIn scraping deshabilitado por diseño (ToS) — ver
  [src/scraper/linkedinParser.ts](src/scraper/linkedinParser.ts).
- Duplicados evitados via `UNIQUE` en `companies.domain` y `contacts.email`.
- Delays configurables (`REQUEST_DELAY_MS`) entre requests externos.
