import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

// OSP added two unique constraints to tables it does not own -- public.vendors and
// public.workspace_registry -- and then hung two foreign keys off them. Both are live in
// production. Whoever rebuilds Rateware has no way to know they exist, and dropping the
// vendors one makes every insert into provider_relationships fail, which stops onboarding
// entirely.
//
// Nobody deletes a constraint on purpose. People recreate tables. This check makes the
// claim explicit and keeps docs/osp-rateware-seam.md -- the document handed to whoever
// owns Rateware -- from drifting away from what the migrations actually do.
//
// Deliberately credential-free: it reads the repo, not the database. A CI job holding a
// production service-role key to assert a constraint would be a worse trade than the
// drift it prevents.

const root = fileURLToPath(new URL('../', import.meta.url));
const seamDoc = readFileSync(`${root}docs/osp-rateware-seam.md`, 'utf8');
const CORE = 'supabase/migrations/20260813120000_provider_service_relationship_core_tables.sql';
const coreMigration = readFileSync(root + CORE, 'utf8');

/** Tables OSP reads or references but does not own. */
const RATEWARE_TABLES = ['vendors', 'workspace_registry'];

/** The constraints OSP requires to exist on those tables. */
const REQUIRED_CONSTRAINTS = [
  ['vendors', 'vendors_id_organization_id_unique', 'unique (id, organization_id)'],
  ['workspace_registry', 'workspace_registry_external_canonical_unique', 'unique (organization_id, organization_uuid)'],
];

test('the migration still declares both constraints OSP depends on', () => {
  for (const [table, name, definition] of REQUIRED_CONSTRAINTS) {
    assert.match(coreMigration, new RegExp(`alter table public\\.${table}`, 'i'), `no ALTER on ${table}`);
    assert.ok(coreMigration.includes(name), `${name} is no longer declared`);
    assert.ok(
      coreMigration.replace(/\s+/g, ' ').toLowerCase().includes(definition),
      `${name} no longer has the shape the foreign key needs: ${definition}`,
    );
  }
});

test('the foreign keys that consume them are still there', () => {
  // If these go, the constraints above become dead weight and the doc becomes a lie.
  const normalised = coreMigration.replace(/\s+/g, ' ');
  assert.match(normalised, /foreign key \(vendor_id, vendor_workspace_id\) references public\.vendors\(id, organization_id\)/i);
  assert.match(normalised, /foreign key \(vendor_workspace_id, organization_id\) references public\.workspace_registry\(organization_id, organization_uuid\)/i);
});

test('the seam document names every constraint the migrations claim', () => {
  // The document is what gets handed to whoever rebuilds Rateware. If a migration adds a
  // third claim and the document does not mention it, the handover is incomplete in
  // exactly the way that causes the outage.
  for (const [, name] of REQUIRED_CONSTRAINTS) {
    assert.ok(seamDoc.includes(name), `docs/osp-rateware-seam.md does not mention ${name}`);
  }
  assert.match(seamDoc, /provider_relationships/);
  assert.match(seamDoc, /every insert into\s*\n?`?provider_relationships`? fail/i);
});

test('no OSP migration has quietly added another claim on a Rateware table', () => {
  // The real risk is not these two -- they are documented now. It is the third one, added
  // later, that nobody writes down.
  const migrations = readdirSync(`${root}supabase/migrations`).filter((name) => name.endsWith('.sql'));
  const ospMigrations = migrations.filter((name) => /provider|legal_entit/i.test(name));
  assert.ok(ospMigrations.length >= 20, `only found ${ospMigrations.length} OSP migrations`);

  const undocumented = [];
  for (const file of ospMigrations) {
    const sql = readFileSync(`${root}supabase/migrations/${file}`, 'utf8');
    for (const table of RATEWARE_TABLES) {
      const pattern = new RegExp(`alter\\s+table\\s+(?:if\\s+exists\\s+)?public\\.${table}\\b`, 'gi');
      for (const _match of sql.matchAll(pattern)) {
        // Allowed only from the one migration the document describes.
        if (file === CORE.split('/').pop()) continue;
        undocumented.push(`${file} alters public.${table}`);
      }
    }
  }
  assert.deepEqual(undocumented, [],
    'an OSP migration alters a Rateware table without being in the seam document:\n  '
    + `${undocumented.join('\n  ')}\n`
    + 'Add it to docs/osp-rateware-seam.md and to REQUIRED_CONSTRAINTS, or move the change '
    + 'into a table OSP owns.');
});

test('the check can actually see the files it claims to check', () => {
  assert.ok(coreMigration.length > 2000, 'core migration looks truncated');
  assert.ok(seamDoc.length > 1500, 'seam document looks truncated');
  assert.match(coreMigration, /create table if not exists public\.legal_entities/);
});
