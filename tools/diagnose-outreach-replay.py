"""Inspect the pre-October-7 catalog in an ephemeral GitHub Actions runner.

Never connects to a remote database. Suffix migrations are restored in finally;
the historical SQL and its drift guards remain byte-for-byte unchanged.
"""
import hashlib
import json
import os
from pathlib import Path
import subprocess
import tempfile

CUTOFF = "20261007204842_outreach_pending_delivery_projection.sql"
CONTAINER = "supabase_db_alqjqzqagdmcywpjtnnr"


def run(*args, **kwargs):
    return subprocess.run(args, check=True, **kwargs)


def main():
    if os.environ.get("GITHUB_ACTIONS") != "true":
        raise SystemExit("This diagnostic is restricted to an ephemeral GitHub Actions runner.")
    root = Path.cwd().resolve()
    migrations = root / "supabase/migrations"
    files = sorted(migrations.glob("*.sql"))
    if not any(p.name == CUTOFF for p in files):
        raise SystemExit("Exact cutoff migration missing; refusing a different replay.")
    suffix = [p for p in files if p.name >= CUTOFF]
    before = {p.name: hashlib.sha256(p.read_bytes()).hexdigest() for p in files}
    run("git", "diff", "--exit-code", "--", "supabase/migrations")
    print(json.dumps({"cutoff_excluded": CUTOFF, "prefix_count": len(files)-len(suffix),
                      "suffix_count": len(suffix), "commit": os.environ.get("GITHUB_SHA")}), flush=True)
    with tempfile.TemporaryDirectory(prefix="outreach-prefix-", dir=os.environ["RUNNER_TEMP"]) as tmp:
        moved = []
        try:
            for p in suffix:
                target = Path(tmp) / p.name
                p.rename(target)
                moved.append((p, target))
            # Success output contains throwaway local keys; do not print them.
            run("supabase", "start", stdout=subprocess.DEVNULL)
            query = """
              SELECT version();
              SELECT jsonb_pretty(jsonb_build_object(
                'name', p.proname,
                'identity', pg_get_function_identity_arguments(p.oid),
                'md5', md5(pg_get_functiondef(p.oid)),
                'definition', pg_get_functiondef(p.oid),
                'security_definer', p.prosecdef,
                'settings', p.proconfig
              ))
              FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
              WHERE n.nspname='public' AND p.proname IN
                ('rateware_outreach_tracking_page', 'rateware_outreach_tracking_state_sql',
                 'rateware_outreach_tracking_summary')
              ORDER BY p.proname, p.oid;
            """
            run("docker", "exec", CONTAINER, "psql", "-X", "-v", "ON_ERROR_STOP=1",
                "-U", "postgres", "-d", "postgres", "-Atc", query)
        finally:
            subprocess.run(["supabase", "stop", "--no-backup"], check=False)
            for p, target in reversed(moved):
                if p.exists():
                    raise RuntimeError(f"Refusing to overwrite a concurrently restored migration: {p.name}")
                target.rename(p)
            after = {p.name: hashlib.sha256(p.read_bytes()).hexdigest() for p in sorted(migrations.glob("*.sql"))}
            if after != before:
                raise RuntimeError("Migration inventory changed during isolated diagnostic.")
            run("git", "diff", "--exit-code", "--", "supabase/migrations")
            print("Exact migration collection restored; no drift guard changed.", flush=True)


if __name__ == "__main__":
    main()
