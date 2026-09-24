// One-time setup for the hourly sync-fcm-bases job, run by a person (not CI):
//   deno run -A tools/fcm-sync-reader-setup.ts [path/to/freight-cost-api/apps/api/.env]
//
// 1. With the FCM app's own DATABASE_URL, creates (or rotates) the role
//    quotedesk_sync_reader: read-only, limited to the tables the sync reads
//    ("User" only id, orgId and email; never password hashes).
// 2. Stores the reader's connection string as the Supabase Edge Function secret
//    FCM_DATABASE_URL.
// The password is random, never printed, and only lives in that secret.
import postgres from "https://deno.land/x/postgresjs@v3.4.5/mod.js";

const PROJECT_REF = "alqjqzqagdmcywpjtnnr";
const ROLE = "quotedesk_sync_reader";
const TABLES = ['"Organization"', '"CostBase"', '"AssumptionSet"', '"AssumptionParam"', '"MexLaneExpense"', '"UsaLaneData"', '"UsaMktCondition"'];
const envPath = Deno.args[0] || "D:/andre/repos/freight-cost-model/freight-cost-api/apps/api/.env";

function envValue(path: string, key: string) {
  for (const line of Deno.readTextFileSync(path).split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Za-z0-9_]+)\s*=\s*(.*?)\s*$/);
    if (match && match[1] === key) return match[2].replace(/^(['"])(.*)\1$/, "$2");
  }
  throw new Error(`${key} is not in ${path}.`);
}

const ownerUrl = new URL(envValue(envPath, "DATABASE_URL"));
const database = decodeURIComponent(ownerUrl.pathname.replace(/^\//, "")) || "neondb";
const password = Array.from(crypto.getRandomValues(new Uint8Array(32)), (byte) => byte.toString(16).padStart(2, "0")).join("");

const owner = postgres(ownerUrl.toString(), { ssl: "require", max: 1, prepare: false });
try {
  // deno-lint-ignore no-explicit-any
  await owner.begin(async (tx: any) => {
    const exists = await tx`select 1 from pg_roles where rolname = ${ROLE}`;
    // The role name and the tables are constants; the password is hex.
    await tx.unsafe(`${exists.length ? "alter" : "create"} role ${ROLE} with login password '${password}'`);
    await tx.unsafe(`grant connect on database "${database.replace(/"/g, '""')}" to ${ROLE}`);
    await tx.unsafe(`grant usage on schema public to ${ROLE}`);
    await tx.unsafe(`grant select on ${TABLES.join(", ")} to ${ROLE}`);
    await tx.unsafe(`grant select (id, "orgId", email) on "User" to ${ROLE}`);
    await tx.unsafe(`alter role ${ROLE} set default_transaction_read_only = on`);
  });
} finally {
  await owner.end();
}

const readerUrl = new URL(ownerUrl.toString());
readerUrl.username = ROLE;
readerUrl.password = password;

const reader = postgres(readerUrl.toString(), { ssl: "require", max: 1, prepare: false });
try {
  const [row] = await reader`select count(*)::int as sets from "AssumptionSet"`;
  let canWrite = true;
  try {
    await reader`update "Organization" set name = name where false`;
  } catch {
    canWrite = false;
  }
  if (canWrite) throw new Error("The reader role can write; stopping before storing it.");
  console.log(`Usuario de solo lectura listo (${row.sets} bases visibles en el FCM).`);
} finally {
  await reader.end();
}

const envFile = await Deno.makeTempFile({ suffix: ".env" });
try {
  await Deno.writeTextFile(envFile, `FCM_DATABASE_URL=${readerUrl.toString()}\n`);
  const npx = Deno.build.os === "windows"
    ? new Deno.Command("cmd", { args: ["/c", "npx", "--yes", "supabase", "secrets", "set", "--env-file", envFile, "--project-ref", PROJECT_REF], stdout: "inherit", stderr: "inherit" })
    : new Deno.Command("npx", { args: ["--yes", "supabase", "secrets", "set", "--env-file", envFile, "--project-ref", PROJECT_REF], stdout: "inherit", stderr: "inherit" });
  const { code } = await npx.spawn().status;
  if (code !== 0) throw new Error("No se pudo guardar FCM_DATABASE_URL en Supabase (supabase secrets set).");
  console.log("FCM_DATABASE_URL guardado en Supabase. La sincronización corre cada hora.");
} finally {
  await Deno.remove(envFile).catch(() => undefined);
}
