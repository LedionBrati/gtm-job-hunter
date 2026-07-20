-- Loosen socials.platform from a fixed enum to open text — which platform
-- matters varies per company, and Part 3's discovery pipeline needs to be
-- able to check new platforms without another schema migration.
ALTER TABLE socials ALTER COLUMN platform TYPE TEXT;
DROP TYPE social_platform;

-- Contacts: add email (preferred outreach channel when available)
ALTER TABLE contacts ADD COLUMN email TEXT;

-- Contact-level socials — a founder's personal handles (X, Instagram, etc.),
-- separate from the company's own socials. Mirrors the socials table.
CREATE TABLE contact_socials (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  contact_id UUID NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
  platform TEXT NOT NULL,
  url TEXT,
  followers INT,
  last_post_at DATE,
  status social_status DEFAULT 'not_found',
  checked_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_contact_socials_contact_id ON contact_socials(contact_id);

ALTER TABLE contact_socials ENABLE ROW LEVEL SECURITY;

-- Outreach: record which channel a message was actually sent through
-- (default preference when drafting is email > linkedin > x, decided in-app)
ALTER TABLE outreach ADD COLUMN channel TEXT;
