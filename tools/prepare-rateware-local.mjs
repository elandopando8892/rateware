import { mkdirSync, existsSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

// Bootstrap only: never links a project, copies credentials, runs migrations,
// starts Docker, or imports production data.
export const LOCAL_PROJECT_ID = 'rateware-carrier-local-v1';
export const LOCAL_CONFIG = `project_id = "${LOCAL_PROJECT_ID}"

[api]
enabled = true
port = 56431
schemas = ["public", "graphql_public"]
extra_search_path = ["public", "extensions"]
max_rows = 1000

[db]
port = 56432
shadow_port = 56430
major_version = 17

[db.migrations]
enabled = false

[db.seed]
enabled = false

[realtime]
enabled = false

[studio]
enabled = false

[local_smtp]
enabled = false

[storage]
enabled = false

[auth]
enabled = true
site_url = "http://127.0.0.1:56400"
additional_redirect_urls = []
enable_signup = false
enable_anonymous_sign_ins = false

[auth.email]
enable_signup = false

[auth.sms]
enable_signup = false

[auth.external.google]
enabled = false
client_id = ""
secret = ""
skip_nonce_check = false

[edge_runtime]
enabled = false

[analytics]
enabled = false
`;

export function prepareLocal(root) {
  const target = resolve(root, '.rateware-local');
  // Refuse all existing targets, including symlinks; no overwrite or reset.
  if (existsSync(target)) throw new Error('Local target already exists; inspect it before reuse.');
  mkdirSync(resolve(target, 'supabase'), { recursive: true });
  writeFileSync(resolve(target, 'supabase', 'config.toml'), LOCAL_CONFIG, { flag: 'wx' });
  return { target, project_id: LOCAL_PROJECT_ID, state: 'prepared-not-started',
    migrations: 'not-applied', google: 'not-configured', production_access: false };
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const root = resolve(import.meta.dirname, '..');
  console.log(JSON.stringify(prepareLocal(root), null, 2));
}
