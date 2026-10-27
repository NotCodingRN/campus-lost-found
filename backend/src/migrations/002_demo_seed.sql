-- Demo listings for the presentation. They belong to a clearly marked demo account
-- (is_demo = true) that can never sign in, and no claims are seeded.

INSERT INTO users (google_sub, name, email, is_demo)
VALUES ('demo:seed-data', 'Demo listing', NULL, true)
ON CONFLICT (google_sub) DO NOTHING;

INSERT INTO items (owner_id, title, description, category, item_type, location, event_date, contact_preference, is_demo, created_at)
SELECT u.id, v.title, v.description, v.category, v.item_type, v.location, current_date - v.days_ago, v.contact, true,
       now() - make_interval(days => v.days_ago, hours => v.hours)
FROM users u
CROSS JOIN (VALUES
  ('Black Anker power bank', 'Found a black 10,000 mAh Anker power bank with a short USB-C cable still attached. Left on a study desk near the window.',
   'electronics', 'found', 'Main Library, 2nd floor', 1, 3, 'security_desk'),
  ('Blue water bottle with stickers', 'Lost a navy blue insulated bottle covered in travel stickers (one says "Alexandria"). Probably left after football practice.',
   'bottles', 'lost', 'Sports Complex', 2, 5, 'in_app'),
  ('Keys on a red lanyard', 'Three keys and a small torch on a red university lanyard. Found on a table by the coffee counter.',
   'keys', 'found', 'Student Cafeteria', 0, 2, 'security_desk'),
  ('Casio fx-991EX calculator', 'Lost my Casio fx-991EX ClassWiz scientific calculator. Has initials scratched on the back cover. Needed for the midterm!',
   'electronics', 'lost', 'Lecture Hall B', 3, 1, 'in_app'),
  ('Grey hoodie, size M', 'Plain grey zip hoodie, size M, left on a chair after the evening lab session. Nothing in the pockets.',
   'clothing', 'found', 'Engineering Building, Lab 204', 4, 4, 'in_app'),
  ('Brown leather wallet', 'Small brown bifold wallet. Contains a few cards. Lost somewhere between the shuttle stop and the main gate.',
   'wallets_ids', 'lost', 'Shuttle Bus Stop', 1, 7, 'email_on_accept'),
  ('Calculus textbook with handwritten notes', 'Stewart Calculus (8th edition) with lots of handwritten notes and sticky tabs. Found on a bench.',
   'books_notes', 'found', 'Science Building courtyard', 5, 6, 'in_app'),
  ('Wireless earbuds case (white)', 'White charging case for wireless earbuds, no earbuds inside. Found under a seat in the back row.',
   'electronics', 'found', 'Lecture Hall A', 6, 2, 'security_desk')
) AS v(title, description, category, item_type, location, days_ago, hours, contact)
WHERE u.google_sub = 'demo:seed-data';
