import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

const image = process.env.RATEWARE_VENDOR_SEED_POSTGRES_IMAGE || "public.ecr.aws/supabase/postgres:17.6.1.165";
const container = `rateware-vendor-seed-103-${process.pid}`;
const database = "rateware_vendor_seed_103";
const password = `local-only-${process.pid}`;
const migration = (name) => readFile(resolve(import.meta.dirname, `../supabase/migrations/${name}`), "utf8");

function run(command, args, { input = "", allowFailure = false } = {}) {
  return new Promise((resolveRun, reject) => {
    const child = spawn(command, args, { stdio:["pipe", "pipe", "pipe"], windowsHide:true });
    let stdout = "", stderr = "";
    child.stdout.on("data", (chunk) => { stdout += chunk; });
    child.stderr.on("data", (chunk) => { stderr += chunk; });
    child.on("error", reject);
    child.on("close", (code) => {
      const result = { code, stdout:stdout.trim(), stderr:stderr.trim() };
      if (code === 0 || allowFailure) resolveRun(result);
      else reject(new Error(`${command} ${args.join(" ")} failed (${code})\n${stderr || stdout}`));
    });
    child.stdin.end(input);
  });
}

const docker = (...args) => run("docker", args);
const psql = (sql) => run("docker", ["exec", "-i", container, "psql", "-X", "-v", "ON_ERROR_STOP=1", "-U", "supabase_admin", "-d", database, "-At"], { input:sql });

async function waitReady() {
  let consecutive = 0;
  let stableSince = 0;
  for (let attempt = 0; attempt < 120; attempt += 1) {
    const ready = await run("docker", ["exec", container, "psql", "-X", "-U", "supabase_admin", "-d", database, "-At", "-c", "select 1"], { allowFailure:true });
    if (ready.code === 0 && ready.stdout === "1") {
      consecutive += 1;
      stableSince ||= Date.now();
    } else {
      consecutive = 0;
      stableSince = 0;
    }
    if (consecutive >= 3 && Date.now() - stableSince >= 5_000) return;
    await new Promise((resolveWait) => setTimeout(resolveWait, 250));
  }
  throw new Error("Supabase Postgres container did not become ready");
}

const [vendorSchema, quickwins, sourcingBase, vendorSeed, ownerScope] = await Promise.all([
  migration("20260608120000_vendor_crm.sql"),
  migration("20260608133000_vendor_quickwins.sql"),
  migration("20260609130000_sourcing_procurement_vendor_base.sql"),
  migration("20260617150000_import_sourcing_base_google_sheet.sql"),
  migration("20260617162000_scope_vendors_by_user.sql"),
]);

let created = false;
try {
  await docker("run", "--name", container, "-e", `POSTGRES_PASSWORD=${password}`, "-e", `POSTGRES_DB=${database}`, "-d", image);
  created = true;
  await waitReady();
  await psql(`
    create extension if not exists pgcrypto;
    do $$ begin
      if not exists (select 1 from pg_roles where rolname='authenticated') then create role authenticated nologin; end if;
    end $$;
    create table public.raw_uploads (id uuid primary key default gen_random_uuid());
    create table public.rate_staging (id uuid primary key default gen_random_uuid());
  `);
  await psql(vendorSchema);
  await psql(quickwins);
  await psql(sourcingBase);

  await psql(`insert into public.vendors (vendor_name, domain, primary_email, source)
    values ('ABELARDO JAVIER GONZALEZ ARREOLA', 'ta-gonzalez.com', 'old@example.invalid', 'manual');`);
  await psql(vendorSeed);
  const first = await psql(`select count(*), count(*) filter (where primary_email='clientes@ta-gonzalez.com')
    from public.vendors where source_spreadsheet_id='1m-ZhZL07orYfKkstgaDAlZjXZ9-WXiYUcBkPY_bQpn8';`);
  const [firstCount, updatedConflict] = first.stdout.split("|").map(Number);
  assert.ok(firstCount > 1_000, "the complete vendor fixture should load");
  assert.equal(updatedConflict, 1, "the historical composite conflict should update exactly one existing vendor");

  await psql(vendorSeed);
  const second = await psql(`select count(*) from public.vendors
    where source_spreadsheet_id='1m-ZhZL07orYfKkstgaDAlZjXZ9-WXiYUcBkPY_bQpn8';`);
  assert.equal(Number(second.stdout), firstCount, "an exact seed replay must preserve row count");

  await psql(ownerScope);
  const arbiter = await psql(`select count(*) from pg_constraint
    where conrelid='public.vendors'::regclass and conname='vendors_name_or_domain_unique';`);
  assert.equal(Number(arbiter.stdout), 0, "owner scoping should remove the historical global arbiter after seeding");

  console.log(JSON.stringify({
    status:"PASS",
    image,
    sourceRows:firstCount,
    conflictUpdated:updatedConflict,
    exactReplay:"stable",
    ownerScope:"applied_after_seed",
    remoteEffects:false,
  }, null, 2));
} finally {
  if (created) await docker("rm", "-f", container).catch(() => {});
}
