import { Router } from 'express';
import { withTransaction } from '../db.js';
import { conflict, forbidden, notFound } from '../errors.js';
import { requireAuth, requireCsrf } from '../security.js';
import { idParamSchema } from '../validation.js';
import { serializeClaim } from './serializers.js';

// Claim lifecycle:
//   pending  -> accepted  (item owner)    item becomes "claimed"
//   pending  -> rejected  (item owner)
//   accepted -> rejected  (item owner)    item goes back to "open"
//   pending/accepted -> cancelled (claimant)
const ACTIONS = {
  accept: { actor: 'owner', from: ['pending'], to: 'accepted' },
  reject: { actor: 'owner', from: ['pending', 'accepted'], to: 'rejected' },
  cancel: { actor: 'claimant', from: ['pending', 'accepted'], to: 'cancelled' },
};

export function claimRoutes({ pool }) {
  const router = Router();

  router.post('/:id/:action', requireAuth, requireCsrf, async (req, res) => {
    const rule = ACTIONS[req.params.action];
    if (!rule) throw notFound('Action');
    const id = idParamSchema.parse(req.params.id);

    const updated = await withTransaction(pool, async (client) => {
      const { rows } = await client.query(
        `SELECT c.id, c.status, c.claimant_id, c.item_id, i.owner_id, i.status AS item_status
           FROM claims c JOIN items i ON i.id = c.item_id
          WHERE c.id = $1
          FOR UPDATE OF c, i`,
        [id],
      );
      if (!rows.length) throw notFound('Claim');
      const claim = rows[0];
      const userId = Number(req.user.id);

      if (rule.actor === 'owner' && Number(claim.owner_id) !== userId) {
        throw forbidden('Only the listing owner can do that.');
      }
      if (rule.actor === 'claimant' && Number(claim.claimant_id) !== userId) {
        throw forbidden('Only the person who made this claim can cancel it.');
      }
      if (claim.item_status === 'resolved') throw conflict('item_resolved', 'This item has already been resolved.');
      if (!rule.from.includes(claim.status)) {
        throw conflict('invalid_transition', `A ${claim.status} claim cannot be changed that way.`);
      }

      if (rule.to === 'accepted') {
        const other = await client.query(
          `SELECT 1 FROM claims WHERE item_id = $1 AND status = 'accepted' AND id <> $2`,
          [claim.item_id, id],
        );
        if (other.rows.length) throw conflict('already_accepted', 'Another claim on this item is already accepted.');
      }

      const result = await client.query(
        `UPDATE claims SET status = $2, updated_at = now() WHERE id = $1 RETURNING *`,
        [id, rule.to],
      );

      if (rule.to === 'accepted') {
        await client.query(`UPDATE items SET status = 'claimed', updated_at = now() WHERE id = $1`, [claim.item_id]);
      } else if (claim.status === 'accepted') {
        await client.query(`UPDATE items SET status = 'open', updated_at = now() WHERE id = $1`, [claim.item_id]);
      }
      return result.rows[0];
    });

    res.json({ claim: serializeClaim(updated) });
  });

  return router;
}
