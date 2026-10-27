import { Router } from 'express';
import { withTransaction } from '../db.js';
import { conflict, forbidden, notFound } from '../errors.js';
import { requireAuth, requireCsrf } from '../security.js';
import { claimCreateSchema, idParamSchema, itemCreateSchema, itemListQuerySchema } from '../validation.js';
import { ITEM_SELECT, serializeClaim, serializeItem } from './serializers.js';

const escapeLike = (value) => value.replace(/[\\%_]/g, '\\$&');

export function itemRoutes({ pool }) {
  const router = Router();

  // Public: browse and search with filters. Every value is passed as a query parameter ($n).
  router.get('/', async (req, res) => {
    const query = itemListQuerySchema.parse(req.query);
    const where = [];
    const params = [];
    const param = (value) => {
      params.push(value);
      return `$${params.length}`;
    };

    if (query.q) {
      const p = param(`%${escapeLike(query.q)}%`);
      where.push(`(i.title ILIKE ${p} OR i.description ILIKE ${p} OR i.location ILIKE ${p})`);
    }
    if (query.type) where.push(`i.item_type = ${param(query.type)}`);
    if (query.category) where.push(`i.category = ${param(query.category)}`);
    if (query.location) where.push(`i.location ILIKE ${param(`%${escapeLike(query.location)}%`)}`);
    if (query.status === 'active') where.push(`i.status IN ('open', 'claimed')`);
    else if (query.status !== 'all') where.push(`i.status = ${param(query.status)}`);

    const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
    const limit = param(query.pageSize);
    const offset = param((query.page - 1) * query.pageSize);

    const [{ rows }, { rows: countRows }] = await Promise.all([
      pool.query(`${ITEM_SELECT} ${whereSql} ORDER BY i.created_at DESC, i.id DESC LIMIT ${limit} OFFSET ${offset}`, params),
      pool.query(`SELECT count(*)::int AS total FROM items i ${whereSql}`, params.slice(0, params.length - 2)),
    ]);

    res.json({
      items: rows.map(serializeItem),
      page: query.page,
      pageSize: query.pageSize,
      total: countRows[0].total,
    });
  });

  router.get('/:id', async (req, res) => {
    const id = idParamSchema.parse(req.params.id);
    const { rows } = await pool.query(`${ITEM_SELECT} WHERE i.id = $1`, [id]);
    if (!rows.length) throw notFound('Item');
    const row = rows[0];
    const item = serializeItem(row);
    const viewer = req.user;
    const isOwner = Boolean(viewer && Number(row.owner_id) === Number(viewer.id));

    let claims = null;
    let viewerClaim = null;
    let contact = null;

    if (isOwner) {
      const result = await pool.query(
        `SELECT c.*, u.name AS claimant_name, u.email AS claimant_email
           FROM claims c JOIN users u ON u.id = c.claimant_id
          WHERE c.item_id = $1
          ORDER BY c.created_at DESC`,
        [id],
      );
      claims = result.rows.map((r) => ({
        ...serializeClaim(r),
        // The owner sees a claimant's email only after accepting that claim.
        claimantEmail: r.status === 'accepted' ? r.claimant_email : undefined,
      }));
    } else if (viewer) {
      const result = await pool.query(
        `SELECT * FROM claims WHERE item_id = $1 AND claimant_id = $2 ORDER BY created_at DESC LIMIT 1`,
        [id, viewer.id],
      );
      if (result.rows.length) {
        viewerClaim = serializeClaim(result.rows[0]);
        if (viewerClaim.status === 'accepted') {
          contact = { preference: row.contact_preference };
          if (row.contact_preference === 'email_on_accept') {
            const owner = await pool.query('SELECT email FROM users WHERE id = $1', [row.owner_id]);
            contact.ownerEmail = owner.rows[0]?.email || null;
          }
        }
      }
    }

    res.json({ item, isOwner, claims, viewerClaim, contact });
  });

  router.post('/', requireAuth, requireCsrf, async (req, res) => {
    const data = itemCreateSchema.parse(req.body ?? {});
    const { rows } = await pool.query(
      `INSERT INTO items (owner_id, title, description, category, item_type, location, event_date, contact_preference)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING id`,
      [req.user.id, data.title, data.description, data.category, data.itemType, data.location, data.eventDate, data.contactPreference],
    );
    const created = await pool.query(`${ITEM_SELECT} WHERE i.id = $1`, [rows[0].id]);
    res.status(201).json({ item: serializeItem(created.rows[0]) });
  });

  // Only the listing owner may mark it returned/resolved. Open claims are closed at the same time.
  router.post('/:id/resolve', requireAuth, requireCsrf, async (req, res) => {
    const id = idParamSchema.parse(req.params.id);
    await withTransaction(pool, async (client) => {
      const { rows } = await client.query('SELECT owner_id, status FROM items WHERE id = $1 FOR UPDATE', [id]);
      if (!rows.length) throw notFound('Item');
      if (Number(rows[0].owner_id) !== Number(req.user.id)) throw forbidden('Only the person who posted this listing can resolve it.');
      if (rows[0].status === 'resolved') throw conflict('already_resolved', 'This listing is already resolved.');
      await client.query(
        `UPDATE items SET status = 'resolved', resolved_at = now(), updated_at = now() WHERE id = $1`,
        [id],
      );
      await client.query(
        `UPDATE claims SET status = 'rejected', updated_at = now() WHERE item_id = $1 AND status = 'pending'`,
        [id],
      );
    });
    const { rows } = await pool.query(`${ITEM_SELECT} WHERE i.id = $1`, [id]);
    res.json({ item: serializeItem(rows[0]) });
  });

  router.post('/:id/claims', requireAuth, requireCsrf, async (req, res) => {
    const id = idParamSchema.parse(req.params.id);
    const data = claimCreateSchema.parse(req.body ?? {});
    const claim = await withTransaction(pool, async (client) => {
      const { rows } = await client.query('SELECT owner_id, status FROM items WHERE id = $1 FOR UPDATE', [id]);
      if (!rows.length) throw notFound('Item');
      if (Number(rows[0].owner_id) === Number(req.user.id)) throw forbidden('You cannot claim your own listing.');
      if (rows[0].status === 'resolved') throw conflict('item_resolved', 'This item has already been returned.');

      const existing = await client.query(
        `SELECT 1 FROM claims WHERE item_id = $1 AND claimant_id = $2 AND status IN ('pending', 'accepted')`,
        [id, req.user.id],
      );
      if (existing.rows.length) throw conflict('duplicate_claim', 'You already have an active claim on this item.');

      try {
        const inserted = await client.query(
          `INSERT INTO claims (item_id, claimant_id, message) VALUES ($1, $2, $3) RETURNING *`,
          [id, req.user.id, data.message],
        );
        return inserted.rows[0];
      } catch (error) {
        // Two simultaneous requests: the partial unique index still stops the duplicate.
        if (error.code === '23505') throw conflict('duplicate_claim', 'You already have an active claim on this item.');
        throw error;
      }
    });
    res.status(201).json({ claim: serializeClaim(claim) });
  });

  return router;
}
