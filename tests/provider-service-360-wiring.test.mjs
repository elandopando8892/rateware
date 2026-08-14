import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('Provider 360 backend is routed only after canonical runtime identity resolution', async () => {
  const source = await read('supabase/functions/shipper-directory-api/index.ts');
  assert.match(source, /import \{ handleProviderServiceAction, isProviderServiceAction \} from "\.\/provider-service\.ts"/);
  const identityIndex = source.indexOf('resolveRuntimeWorkspaceUser');
  const dispatchIndex = source.indexOf('isProviderServiceAction(body.action)');
  assert.ok(identityIndex >= 0);
  assert.ok(dispatchIndex > identityIndex);
  assert.match(source, /handleProviderServiceAction\(supabase, user, body\)/);
});

test('Provider 360 handler verifies workspace mapping and vendor ownership', async () => {
  const source = await read('supabase/functions/shipper-directory-api/provider-service.ts');
  assert.match(source, /\.from\("workspace_registry"\)/);
  assert.match(source, /\.select\("organization_uuid"\)/);
  assert.match(source, /\.from\("vendors"\)/);
  assert.match(source, /\.eq\("organization_id", workspaceId\)/);
  assert.match(source, /provider_service_360_relationship_summary/);
  assert.match(source, /provider_service_360_activation_requirements/);
  assert.match(source, /provider_service_360_activity_feed/);
});

test('Provider 360 browser client uses the authenticated internal directory endpoint', async () => {
  const source = await read('src/provider-service-360.js');
  assert.match(source, /callRatewareFunction\('shipper-directory-api','get_provider_360'/);
  assert.doesNotMatch(source, /\.from\(['"]provider_/);
});

test('Vendor CRM bootstraps lazy Provider 360 drawer mounting', async () => {
  const vendorService = await read('src/vendor-service.js');
  const mount = await read('src/provider-service-360-mount.js');
  assert.match(vendorService, /import "\.\/provider-service-360-mount\.js"/);
  assert.match(mount, /mountProviderService360/);
  assert.match(mount, /drawer-vendor-relationship/);
  assert.match(mount, /data-vendor-id/);
});
