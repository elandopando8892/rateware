import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import test from 'node:test';

// pg_get_functiondef header captured from the isolated PostgreSQL 17.6 replay.
// This checks the exact historically recorded precondition, not SQL equivalence.
const header = "CREATE OR REPLACE FUNCTION public.rateware_outreach_tracking_page(p_owner_email text, p_rfx_event_id uuid DEFAULT NULL::uuid, p_channels text[] DEFAULT NULL::text[], p_tracking_status text DEFAULT NULL::text, p_search_terms text[] DEFAULT NULL::text[], p_include_archived boolean DEFAULT false, p_enforce_event_scope boolean DEFAULT false, p_offset integer DEFAULT 0, p_limit integer DEFAULT 100)\n RETURNS jsonb\n LANGUAGE sql\n STABLE\n SET search_path TO ''\n";
const before = readFileSync(resolve('supabase/migrations/20260803013648_optimize_outreach_tracking_scope_arrays.sql'), 'utf8').replace(/\r\n/g, '\n');
const update = readFileSync(resolve('supabase/migrations/20261007204842_outreach_pending_delivery_projection.sql'), 'utf8');
const expected = '90b7e462d575e17a75b3274e46ca0e83';
const match = /create\s+or\s+replace\s+function\s+public\.rateware_outreach_tracking_page\b[\s\S]*?\bas\s+(\$\w*\$)([\s\S]*?)\1/i.exec(before);
assert.ok(match, 'Historical tracking-page definition must remain versioned');
const digest = body => createHash('md5').update(header + 'AS $function$' + body + '$function$\n').digest('hex');

test('recorded August precondition matches the unchanged October drift guard', () => {
  assert.ok(update.includes("IS DISTINCT FROM '" + expected + "' THEN RAISE EXCEPTION 'Function drift: rateware_outreach_tracking_page'"));
  assert.equal(digest(match[2]), expected);
});

test('unreviewed changes to the historical function remain rejected', () => {
  assert.notEqual(digest(match[2] + '\n-- unreviewed change'), expected);
  assert.notEqual(digest(match[2].replace('search_text', 'unreviewed_search_text')), expected);
});
