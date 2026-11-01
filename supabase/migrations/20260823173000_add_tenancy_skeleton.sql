-- Phase 1 of the multi-tenant migration: tenancy skeleton.
--
-- Deliberately changes NO behaviour. The app still runs on the service-role
-- key and still bypasses RLS after this migration; every existing row simply
-- gains an owner. Phase 2 adds auth and the policies that make the owner mean
-- something.
--
-- The split this encodes:
--   companies, socials  -> GLOBAL. Public business facts, and one Apify
--                          enrichment then serves every tenant.
--   contacts, contact_socials, scores, outreach -> PER-TENANT. Contacts are
--                          real people's names, emails and LinkedIn URLs, so
--                          this column is the GDPR boundary, not a preference.

CREATE TABLE tenants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  -- Nullable, and unclaimed until Phase 2. Ledi has no auth.users row yet, so
  -- tenant #1 is created here ownerless and linked to his account when he
  -- first signs in. current_tenant_id() returns NULL for an unclaimed tenant,
  -- which fails closed — exactly what we want in the gap between phases.
  owner_user_id UUID UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE tenants ENABLE ROW LEVEL SECURITY;

-- Every RLS policy in Phase 2 calls this rather than inlining the lookup, so
-- that supporting teams later means changing one function instead of ~10
-- policies. SECURITY DEFINER with a pinned search_path: the function reads
-- tenants, which the caller cannot read directly under RLS.
CREATE FUNCTION current_tenant_id() RETURNS UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT id FROM tenants WHERE owner_user_id = auth.uid()
$$;

-- Add the column nullable first so the backfill below has something to write
-- into, then tighten to NOT NULL in the same transaction.
ALTER TABLE contacts        ADD COLUMN tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE;
ALTER TABLE contact_socials ADD COLUMN tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE;
ALTER TABLE scores          ADD COLUMN tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE;
ALTER TABLE outreach        ADD COLUMN tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE;

-- Tenant #1 owns everything that exists today. Done in one block so the new
-- id is held in a variable rather than re-found by name on each statement —
-- the tenant name is a label, not a key, and must not become load-bearing.
DO $$
DECLARE
  v_tenant UUID;
BEGIN
  INSERT INTO tenants (name) VALUES ('Ledi Brati') RETURNING id INTO v_tenant;

  UPDATE contacts        SET tenant_id = v_tenant;
  UPDATE contact_socials SET tenant_id = v_tenant;
  UPDATE scores          SET tenant_id = v_tenant;
  UPDATE outreach        SET tenant_id = v_tenant;
END $$;

ALTER TABLE contacts        ALTER COLUMN tenant_id SET NOT NULL;
ALTER TABLE contact_socials ALTER COLUMN tenant_id SET NOT NULL;
ALTER TABLE scores          ALTER COLUMN tenant_id SET NOT NULL;
ALTER TABLE outreach        ALTER COLUMN tenant_id SET NOT NULL;

-- Every per-tenant read filters on tenant_id, and the RLS policies in Phase 2
-- add that predicate to queries that don't mention it themselves.
CREATE INDEX idx_contacts_tenant        ON contacts(tenant_id);
CREATE INDEX idx_contact_socials_tenant ON contact_socials(tenant_id);
CREATE INDEX idx_outreach_tenant        ON outreach(tenant_id);

-- scores is insert-only and read as "newest row per company", which is now
-- per-tenant too. This composite serves that exact lookup.
CREATE INDEX idx_scores_tenant_company_scored_at
  ON scores(tenant_id, company_id, scored_at DESC);
