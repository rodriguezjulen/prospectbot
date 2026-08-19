import { createLogger } from '../logger';
import { scrapeCompanies } from './googleSearch';

const log = createLogger('scraper:test');

scrapeCompanies()
  .then((companies) => {
    log.info(`scraped ${companies.length} companies`);
    console.table(companies.slice(0, 20));
  })
  .catch((err) => {
    log.error('scraper test failed', err);
    process.exitCode = 1;
  });
