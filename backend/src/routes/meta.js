import { Router } from 'express';
import { CATEGORIES, CONTACT_PREFERENCES, ITEM_TYPES } from '../validation.js';

// Health check used by Docker, the frontend and the lab experiments. Mounted before the
// session middleware so it still answers (503) when the database, and so the session store, is down.
export function healthRoutes({ pool }) {
  const router = Router();
  router.get('/health', async (req, res) => {
    try {
      await pool.query('SELECT 1');
      res.json({ status: 'ok', api: 'running', database: 'connected', uptimeSeconds: Math.round(process.uptime()) });
    } catch {
      res.status(503).json({ status: 'degraded', api: 'running', database: 'unavailable' });
    }
  });
  return router;
}

export function metaRoutes({ pool }) {
  const router = Router();

  router.get('/meta', async (req, res) => {
    const [locations, stats] = await Promise.all([
      pool.query(
        `SELECT location, count(*)::int AS n FROM items GROUP BY location ORDER BY n DESC, location LIMIT 40`,
      ),
      pool.query(
        `SELECT count(*) FILTER (WHERE status <> 'resolved' AND item_type = 'lost')::int  AS open_lost,
                count(*) FILTER (WHERE status <> 'resolved' AND item_type = 'found')::int AS open_found,
                count(*) FILTER (WHERE status = 'resolved')::int AS resolved,
                count(*)::int AS total
           FROM items`,
      ),
    ]);
    const s = stats.rows[0];
    res.json({
      categories: CATEGORIES,
      itemTypes: ITEM_TYPES,
      contactPreferences: CONTACT_PREFERENCES,
      locations: locations.rows.map((r) => r.location),
      stats: { openLost: s.open_lost, openFound: s.open_found, resolved: s.resolved, total: s.total },
    });
  });

  return router;
}
