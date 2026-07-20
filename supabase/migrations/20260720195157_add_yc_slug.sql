-- Natural idempotency key for the YC importer (Part 2) — lets re-running
-- the import script for new batches upsert instead of duplicating rows.
ALTER TABLE companies ADD COLUMN yc_slug TEXT UNIQUE;
