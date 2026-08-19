import express from 'express';
import path from 'path';
import { pingDb } from '../db/pool';
import { listLeads, getDashboardStats } from '../db/queries';
import { createLogger } from '../logger';
import { errorMessage } from '../utils';

const log = createLogger('web');

const app = express();
const PORT = Number(process.env.PORT ?? 3300);
const PAGE_SIZE = 25;

app.use(express.static(path.join(__dirname, 'public')));

app.get('/api/stats', async (_req, res) => {
  try {
    const dbUp = await pingDb();
    if (!dbUp) {
      res.status(503).json({ error: 'database unreachable' });
      return;
    }
    const stats = await getDashboardStats();
    res.json(stats);
  } catch (err) {
    log.error(`/api/stats failed: ${errorMessage(err)}`);
    res.status(500).json({ error: 'internal error' });
  }
});

app.get('/api/leads', async (req, res) => {
  try {
    const dbUp = await pingDb();
    if (!dbUp) {
      res.status(503).json({ error: 'database unreachable' });
      return;
    }
    const search = typeof req.query.q === 'string' ? req.query.q : '';
    const page = Math.max(1, Number(req.query.page ?? 1) || 1);
    const { rows, total } = await listLeads(search, PAGE_SIZE, (page - 1) * PAGE_SIZE);
    res.json({ rows, total, page, pageSize: PAGE_SIZE });
  } catch (err) {
    log.error(`/api/leads failed: ${errorMessage(err)}`);
    res.status(500).json({ error: 'internal error' });
  }
});

export function startWebServer(): void {
  app.listen(PORT, () => {
    log.info(`dashboard listening on http://localhost:${PORT}`);
  });
}

if (require.main === module) {
  startWebServer();
}
