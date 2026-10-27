import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';
import request from 'supertest';
import { nameFromEmail, pickDisplayName } from '../src/google.js';
import { setupTestApp, signIn, validItem } from './helpers.js';

let app;
let pool;

before(async () => {
  ({ app, pool } = await setupTestApp());
});
after(async () => {
  await pool?.end();
});

describe('health and public browsing', () => {
  test('GET /api/health reports API and database status', async () => {
    const res = await request(app).get('/api/health').expect(200);
    assert.equal(res.body.api, 'running');
    assert.equal(res.body.database, 'connected');
  });

  test('demo listings are seeded, labelled, and expose no email addresses', async () => {
    const res = await request(app).get('/api/items?pageSize=48').expect(200);
    assert.equal(res.body.total, 8);
    for (const item of res.body.items) {
      assert.equal(item.isDemo, true);
      assert.equal(item.owner.displayName, 'Demo listing');
    }
    assert.ok(!JSON.stringify(res.body).includes('@'), 'no emails in public listing');
  });

  test('search and filters narrow the results (parameterized, wildcard-safe)', async () => {
    const keys = await request(app).get('/api/items?type=found&category=keys').expect(200);
    assert.deepEqual(keys.body.items.map((i) => i.title), ['Keys on a red lanyard']);

    const text = await request(app).get('/api/items?q=calculator').expect(200);
    assert.equal(text.body.items.length, 1);

    const loc = await request(app).get('/api/items?location=library').expect(200);
    assert.ok(loc.body.items.every((i) => /library/i.test(i.location)));

    const wildcard = await request(app).get(`/api/items?q=${encodeURIComponent("%' OR 1=1 --")}`).expect(200);
    assert.equal(wildcard.body.total, 0);

    await request(app).get('/api/items?type=stolen').expect(400);
  });

  test('unknown item returns 404', async () => {
    await request(app).get('/api/items/999999').expect(404);
  });
});

describe('authentication guards', () => {
  test('creating, claiming and resolving require sign-in', async () => {
    await request(app).post('/api/items').send(validItem()).expect(401);
    await request(app).post('/api/items/1/claims').send({ message: 'This is mine, it has my initials.' }).expect(401);
    await request(app).post('/api/items/1/resolve').expect(401);
    await request(app).get('/api/me/items').expect(401);
  });

  test('a callback with the wrong state is rejected', async () => {
    const agent = request.agent(app);
    await agent.get('/api/auth/google').expect(303);
    const cb = await agent.get('/api/auth/google/callback?code=alice&state=forged').expect(303);
    assert.equal(cb.headers.location, '/?auth_error=state_mismatch');
    const me = await agent.get('/api/auth/me').expect(200);
    assert.equal(me.body.user, null);
  });

  test('a callback without a started login is rejected', async () => {
    const cb = await request(app).get('/api/auth/google/callback?code=alice&state=x').expect(303);
    assert.equal(cb.headers.location, '/?auth_error=expired');
  });

  test('accounts outside the allowed university domain are refused', async () => {
    const agent = request.agent(app);
    const start = await agent.get('/api/auth/google').expect(303);
    const state = new URL(start.headers.location).searchParams.get('state');
    const cb = await agent.get(`/api/auth/google/callback?code=outsider&state=${state}`).expect(303);
    assert.equal(cb.headers.location, '/?auth_error=domain_not_allowed');
  });

  test('unverified emails are refused', async () => {
    const agent = request.agent(app);
    const start = await agent.get('/api/auth/google').expect(303);
    const state = new URL(start.headers.location).searchParams.get('state');
    const cb = await agent.get(`/api/auth/google/callback?code=unverified&state=${state}`).expect(303);
    assert.equal(cb.headers.location, '/?auth_error=email_unverified');
  });

  test('signed-in user sees name and lower-cased email; session cookie is HttpOnly + SameSite=Lax', async () => {
    const agent = request.agent(app);
    const start = await agent.get('/api/auth/google').expect(303);
    const state = new URL(start.headers.location).searchParams.get('state');
    const cb = await agent.get(`/api/auth/google/callback?code=alice&state=${state}`).expect(303);
    const cookie = cb.headers['set-cookie'].join(';');
    assert.match(cookie, /clf\.sid=/);
    assert.match(cookie, /HttpOnly/i);
    assert.match(cookie, /SameSite=Lax/i);
    const me = await agent.get('/api/auth/me').expect(200);
    assert.equal(me.body.user.name, 'Alice Student');
    assert.equal(me.body.user.email, 'alice.student@zewailcity.edu.eg');
  });

  test('display name falls back to the email when the Google name looks like an id', async () => {
    const agent = request.agent(app);
    await signIn(agent, 'bob');
    const me = await agent.get('/api/auth/me').expect(200);
    assert.equal(me.body.user.name, 'Bob Builder');
    assert.equal(nameFromEmail('s-alaa.aladdin@zewailcity.edu.eg'), 'Alaa Aladdin');
    assert.equal(pickDisplayName({ name: 'Reem Tamer', email: 'x@y.z' }), 'Reem Tamer');
  });

  test('state-changing requests without the CSRF token are refused', async () => {
    const agent = request.agent(app);
    await signIn(agent, 'alice');
    const res = await agent.post('/api/items').send(validItem()).expect(403);
    assert.equal(res.body.error, 'forbidden');
    await agent.post('/api/items').set('X-CSRF-Token', 'wrong').send(validItem()).expect(403);
  });

  test('logout ends the session', async () => {
    const agent = request.agent(app);
    const csrf = await signIn(agent, 'carol');
    await agent.post('/api/auth/logout').set('X-CSRF-Token', csrf).expect(200);
    const me = await agent.get('/api/auth/me').expect(200);
    assert.equal(me.body.user, null);
    await agent.post('/api/items').set('X-CSRF-Token', csrf).send(validItem()).expect(401);
  });
});

describe('items and claims business rules', () => {
  let alice;
  let bob;
  let carol;
  let aliceCsrf;
  let bobCsrf;
  let carolCsrf;
  let itemId;
  let bobClaimId;

  before(async () => {
    alice = request.agent(app);
    bob = request.agent(app);
    carol = request.agent(app);
    aliceCsrf = await signIn(alice, 'alice');
    bobCsrf = await signIn(bob, 'bob');
    carolCsrf = await signIn(carol, 'carol');
  });

  test('server-side validation rejects bad input with field messages', async () => {
    const res = await alice
      .post('/api/items')
      .set('X-CSRF-Token', aliceCsrf)
      .send(validItem({ title: '  ', category: 'spaceship', itemType: 'misplaced', eventDate: '2999-01-01' }))
      .expect(400);
    assert.equal(res.body.error, 'validation_failed');
    assert.ok(res.body.fields.title);
    assert.ok(res.body.fields.category);
    assert.ok(res.body.fields.itemType);
    assert.ok(res.body.fields.eventDate);
  });

  test('a user id supplied by the browser is never trusted', async () => {
    const res = await alice
      .post('/api/items')
      .set('X-CSRF-Token', aliceCsrf)
      .send({ ...validItem(), ownerId: 1 })
      .expect(400);
    assert.equal(res.body.error, 'validation_failed');
  });

  test('signed-in user creates a listing', async () => {
    const res = await alice.post('/api/items').set('X-CSRF-Token', aliceCsrf).send(validItem()).expect(201);
    itemId = res.body.item.id;
    assert.equal(res.body.item.status, 'open');
    assert.equal(res.body.item.owner.displayName, 'Alice S.');
    const mine = await alice.get('/api/me/items').expect(200);
    assert.ok(mine.body.items.some((i) => i.id === itemId));
  });

  test('owner cannot claim their own listing', async () => {
    const res = await alice
      .post(`/api/items/${itemId}/claims`)
      .set('X-CSRF-Token', aliceCsrf)
      .send({ message: 'Testing my own listing here.' })
      .expect(403);
    assert.equal(res.body.error, 'forbidden');
  });

  test('another user can claim once; a duplicate active claim is refused', async () => {
    const first = await bob
      .post(`/api/items/${itemId}/claims`)
      .set('X-CSRF-Token', bobCsrf)
      .send({ message: 'That is my charger, the cable has a blue tag.' })
      .expect(201);
    bobClaimId = first.body.claim.id;
    assert.equal(first.body.claim.status, 'pending');

    const dup = await bob
      .post(`/api/items/${itemId}/claims`)
      .set('X-CSRF-Token', bobCsrf)
      .send({ message: 'Claiming again just in case.' })
      .expect(409);
    assert.equal(dup.body.error, 'duplicate_claim');
  });

  test('the database itself also blocks duplicate active claims', async () => {
    const owner = await pool.query(`SELECT id FROM users WHERE google_sub = '1002'`);
    await assert.rejects(
      pool.query(`INSERT INTO claims (item_id, claimant_id, message) VALUES ($1, $2, 'direct insert dup')`, [itemId, owner.rows[0].id]),
      (error) => error.code === '23505',
    );
  });

  test('only the owner can accept, reject or resolve', async () => {
    await bob.post(`/api/claims/${bobClaimId}/accept`).set('X-CSRF-Token', bobCsrf).expect(403);
    await carol.post(`/api/items/${itemId}/resolve`).set('X-CSRF-Token', carolCsrf).expect(403);
  });

  test('owner sees claimant email only after accepting; claimant then sees owner contact', async () => {
    const before = await alice.get(`/api/items/${itemId}`).expect(200);
    assert.equal(before.body.isOwner, true);
    assert.equal(before.body.claims.length, 1);
    assert.equal(before.body.claims[0].claimant.name, 'Bob Builder');
    assert.equal(before.body.claims[0].claimantEmail, undefined);

    await alice.post(`/api/claims/${bobClaimId}/accept`).set('X-CSRF-Token', aliceCsrf).expect(200);
    const after = await alice.get(`/api/items/${itemId}`).expect(200);
    assert.equal(after.body.item.status, 'claimed');
    assert.equal(after.body.claims[0].claimantEmail, 's-bob.builder@zewailcity.edu.eg');

    const bobView = await bob.get(`/api/items/${itemId}`).expect(200);
    assert.equal(bobView.body.viewerClaim.status, 'accepted');
    assert.equal(bobView.body.contact.ownerEmail, 'alice.student@zewailcity.edu.eg');

    const carolView = await carol.get(`/api/items/${itemId}`).expect(200);
    assert.equal(carolView.body.claims, null);
    assert.equal(carolView.body.contact, null);
  });

  test('owner resolves; claims against a resolved item are refused', async () => {
    await carol
      .post(`/api/items/${itemId}/claims`)
      .set('X-CSRF-Token', carolCsrf)
      .send({ message: 'I think this could be mine too.' })
      .expect(201);
    const res = await alice.post(`/api/items/${itemId}/resolve`).set('X-CSRF-Token', aliceCsrf).expect(200);
    assert.equal(res.body.item.status, 'resolved');
    assert.ok(res.body.item.resolvedAt);

    const late = await carol
      .post(`/api/items/${itemId}/claims`)
      .set('X-CSRF-Token', carolCsrf)
      .send({ message: 'Trying again after it was resolved.' })
      .expect(409);
    assert.equal(late.body.error, 'item_resolved');

    const carolClaims = await carol.get('/api/me/claims').expect(200);
    assert.equal(carolClaims.body.claims[0].status, 'rejected', 'pending claims close when the item is resolved');

    await alice.post(`/api/items/${itemId}/resolve`).set('X-CSRF-Token', aliceCsrf).expect(409);
  });

  test('claimant can cancel and claim again; cancelling an accepted claim reopens the item', async () => {
    const created = await alice
      .post('/api/items')
      .set('X-CSRF-Token', aliceCsrf)
      .send(validItem({ title: 'Green umbrella', itemType: 'lost', category: 'accessories', contactPreference: 'in_app' }))
      .expect(201);
    const id = created.body.item.id;

    const c1 = await bob.post(`/api/items/${id}/claims`).set('X-CSRF-Token', bobCsrf).send({ message: 'I found it near the gate.' }).expect(201);
    await bob.post(`/api/claims/${c1.body.claim.id}/cancel`).set('X-CSRF-Token', bobCsrf).expect(200);
    const c2 = await bob.post(`/api/items/${id}/claims`).set('X-CSRF-Token', bobCsrf).send({ message: 'Sorry, it really is the one.' }).expect(201);

    await alice.post(`/api/claims/${c2.body.claim.id}/accept`).set('X-CSRF-Token', aliceCsrf).expect(200);
    await bob.post(`/api/claims/${c2.body.claim.id}/cancel`).set('X-CSRF-Token', bobCsrf).expect(200);
    const item = await alice.get(`/api/items/${id}`).expect(200);
    assert.equal(item.body.item.status, 'open');

    await bob.post(`/api/claims/${c2.body.claim.id}/cancel`).set('X-CSRF-Token', bobCsrf).expect(409);
  });

  test('the same Google account (sub) maps to one user even if its email changes', async () => {
    const { rows } = await pool.query(`SELECT count(*)::int AS n FROM users WHERE google_sub = '1001'`);
    assert.equal(rows[0].n, 1);
  });
});
