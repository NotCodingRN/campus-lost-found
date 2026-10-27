-- Campus Lost & Found: core schema (users, items, claims) + session store.

CREATE TABLE users (
  id          BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  google_sub  TEXT NOT NULL UNIQUE,              -- Google's stable account id, never the email
  name        TEXT NOT NULL CHECK (char_length(name) BETWEEN 1 AND 200),
  email       TEXT CHECK (email IS NULL OR email = lower(email)),
  picture_url TEXT,
  is_demo     BOOLEAN NOT NULL DEFAULT false,    -- seed account, cannot sign in
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX users_email_idx ON users (email);

CREATE TABLE items (
  id                 BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  owner_id           BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title              TEXT NOT NULL CHECK (char_length(title) BETWEEN 3 AND 120),
  description        TEXT NOT NULL CHECK (char_length(description) BETWEEN 10 AND 2000),
  category           TEXT NOT NULL CHECK (category IN (
                       'electronics', 'keys', 'wallets_ids', 'bags', 'clothing',
                       'books_notes', 'bottles', 'accessories', 'sports', 'other')),
  item_type          TEXT NOT NULL CHECK (item_type IN ('lost', 'found')),
  location           TEXT NOT NULL CHECK (char_length(location) BETWEEN 2 AND 120),
  event_date         DATE,
  contact_preference TEXT NOT NULL DEFAULT 'in_app'
                       CHECK (contact_preference IN ('in_app', 'email_on_accept', 'security_desk')),
  status             TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'claimed', 'resolved')),
  is_demo            BOOLEAN NOT NULL DEFAULT false,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  resolved_at        TIMESTAMPTZ,
  CHECK ((status = 'resolved') = (resolved_at IS NOT NULL))
);
CREATE INDEX items_status_created_idx ON items (status, created_at DESC);
CREATE INDEX items_owner_idx ON items (owner_id, created_at DESC);
CREATE INDEX items_type_category_idx ON items (item_type, category);

CREATE TABLE claims (
  id          BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  item_id     BIGINT NOT NULL REFERENCES items(id) ON DELETE CASCADE,
  claimant_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  message     TEXT NOT NULL CHECK (char_length(message) BETWEEN 10 AND 1000),
  status      TEXT NOT NULL DEFAULT 'pending'
                CHECK (status IN ('pending', 'accepted', 'rejected', 'cancelled')),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
-- One active (pending/accepted) claim per user per item, enforced by the database itself.
CREATE UNIQUE INDEX claims_one_active_per_user_idx
  ON claims (item_id, claimant_id) WHERE status IN ('pending', 'accepted');
-- At most one accepted claim per item.
CREATE UNIQUE INDEX claims_one_accepted_per_item_idx
  ON claims (item_id) WHERE status = 'accepted';
CREATE INDEX claims_claimant_idx ON claims (claimant_id, created_at DESC);
CREATE INDEX claims_item_idx ON claims (item_id, created_at DESC);

-- Database-level guard: nobody may claim their own item or a resolved item.
CREATE FUNCTION claims_insert_guard() RETURNS trigger AS $$
DECLARE
  item_owner  BIGINT;
  item_status TEXT;
BEGIN
  SELECT owner_id, status INTO item_owner, item_status FROM items WHERE id = NEW.item_id;
  IF item_owner = NEW.claimant_id THEN
    RAISE EXCEPTION 'cannot claim your own item' USING ERRCODE = 'check_violation', CONSTRAINT = 'claims_not_own_item';
  END IF;
  IF item_status = 'resolved' THEN
    RAISE EXCEPTION 'item is already resolved' USING ERRCODE = 'check_violation', CONSTRAINT = 'claims_item_not_resolved';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER claims_insert_guard_trg
  BEFORE INSERT ON claims
  FOR EACH ROW EXECUTE FUNCTION claims_insert_guard();

-- Login sessions (express-session + connect-pg-simple).
CREATE TABLE user_sessions (
  sid    VARCHAR NOT NULL PRIMARY KEY,
  sess   JSON NOT NULL,
  expire TIMESTAMP(6) NOT NULL
);
CREATE INDEX user_sessions_expire_idx ON user_sessions (expire);
