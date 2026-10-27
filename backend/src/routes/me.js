import { Router } from 'express';
import { requireAuth } from '../security.js';
import { ITEM_SELECT, serializeClaim, serializeItem } from './serializers.js';

export function meRoutes({ pool }) {
  const router = Router();
  router.use(requireAuth);

  router.get('/items', async (req, res) => {
    const { rows } = await pool.query(
      `SELECT * FROM (${ITEM_SELECT}) AS i2
         CROSS JOIN LATERAL (
           SELECT count(*)::int AS pending_claims FROM claims c
            WHERE c.item_id = i2.id AND c.status = 'pending') AS p
        WHERE i2.owner_id = $1
        ORDER BY i2.created_at DESC`,
      [req.user.id],
    );
    res.json({ items: rows.map(serializeItem) });
  });

  router.get('/claims', async (req, res) => {
    const { rows } = await pool.query(
      `SELECT c.*, i.title AS item_title, i.item_type, i.category AS item_category,
              i.location AS item_location, i.status AS item_status, i.is_demo AS item_is_demo
         FROM claims c JOIN items i ON i.id = c.item_id
        WHERE c.claimant_id = $1
        ORDER BY c.created_at DESC`,
      [req.user.id],
    );
    res.json({ claims: rows.map((r) => serializeClaim(r, { includeItem: true })) });
  });

  return router;
}
