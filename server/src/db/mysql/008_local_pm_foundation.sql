-- =============================================================================
-- Local-first Project Management foundation
-- Kissflow columns stay as optional legacy import keys. Our id + business codes
-- are the source of truth. Column/index/backfill work is applied idempotently
-- by schemaMigrate.ts so existing databases pick this up safely.
-- =============================================================================
SELECT 1 AS local_pm_foundation;
