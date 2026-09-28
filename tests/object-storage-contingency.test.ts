import { assertEquals, assertRejects } from "jsr:@std/assert@1.0.14";
import {
  deleteStorageObject,
  downloadStorageObject,
  headStorageObject,
  putStorageObject,
  sha256Hex,
  storageWritePlan,
} from "../supabase/functions/_shared/object-storage.ts";

Deno.test("Supabase remains the default storage provider", () => {
  const names = [
    "RATEWARE_ORACLE_STORAGE_CONFIG",
    "RATEWARE_OBJECT_STORAGE_MODE",
    "RATEWARE_RAW_UPLOAD_STORAGE_MODE",
  ];
  const previous = new Map(names.map((name) => [name, Deno.env.get(name)]));
  try {
    for (const name of names) Deno.env.delete(name);
    assertEquals(storageWritePlan("raw-uploads"), {
      mode: "supabase",
      primary: "supabase",
      replica: null,
    });
  } finally {
    for (const [name, value] of previous) {
      if (value === undefined) Deno.env.delete(name);
      else Deno.env.set(name, value);
    }
  }
});

Deno.test("Oracle activation fails closed when its configuration is absent", async () => {
  const previous = Deno.env.get("RATEWARE_RAW_UPLOAD_STORAGE_MODE");
  const previousBucket = Deno.env.get("OCI_S3_RAW_UPLOADS_BUCKET");
  try {
    Deno.env.set("RATEWARE_RAW_UPLOAD_STORAGE_MODE", "oracle");
    Deno.env.delete("OCI_S3_RAW_UPLOADS_BUCKET");
    await assertRejects(
      async () => storageWritePlan("raw-uploads"),
      Error,
      "OCI_S3_RAW_UPLOADS_BUCKET is required",
    );
  } finally {
    if (previous === undefined) {
      Deno.env.delete("RATEWARE_RAW_UPLOAD_STORAGE_MODE");
    } else Deno.env.set("RATEWARE_RAW_UPLOAD_STORAGE_MODE", previous);
    if (previousBucket === undefined) {
      Deno.env.delete("OCI_S3_RAW_UPLOADS_BUCKET");
    } else Deno.env.set("OCI_S3_RAW_UPLOADS_BUCKET", previousBucket);
  }
});

Deno.test("one JSON secret can configure Oracle dual-write", () => {
  const names = [
    "RATEWARE_ORACLE_STORAGE_CONFIG",
    "RATEWARE_OBJECT_STORAGE_MODE",
    "RATEWARE_RAW_UPLOAD_STORAGE_MODE",
    "OCI_S3_RAW_UPLOADS_BUCKET",
  ];
  const previous = new Map(names.map((name) => [name, Deno.env.get(name)]));
  try {
    for (const name of names) Deno.env.delete(name);
    Deno.env.set(
      "RATEWARE_ORACLE_STORAGE_CONFIG",
      JSON.stringify({
        namespace: "namespace",
        region: "mx-monterrey-1",
        rawUploadsBucket: "rateware-attachments",
        accessKeyId: "access-key",
        secretAccessKey: "secret-key",
        rawUploadsMode: "dual",
      }),
    );
    assertEquals(storageWritePlan("raw-uploads"), {
      mode: "dual",
      primary: "supabase",
      replica: "oracle_s3",
    });
  } finally {
    for (const [name, value] of previous) {
      if (value === undefined) Deno.env.delete(name);
      else Deno.env.set(name, value);
    }
  }
});

Deno.test("Supabase adapter preserves upload, download, head, and delete behavior", async () => {
  const calls: Array<Record<string, unknown>> = [];
  const payload = new TextEncoder().encode("rateware-storage-canary");
  const expectedHash =
    "7b68c0e4a20c7f1b77631fd456eebc67c5d0627459279e11b952fc26f31a7648";
  const bucket = {
    async upload(
      path: string,
      bytes: Uint8Array,
      options: Record<string, unknown>,
    ) {
      calls.push({ action: "upload", path, size: bytes.byteLength, options });
      return { data: { path }, error: null };
    },
    async download(path: string) {
      calls.push({ action: "download", path });
      return { data: new Blob([payload]), error: null };
    },
    async list(prefix: string, options: Record<string, unknown>) {
      calls.push({ action: "list", prefix, options });
      return {
        data: [{
          name: "canary.txt",
          metadata: { size: payload.byteLength, eTag: "etag-1" },
        }],
        error: null,
      };
    },
    async remove(paths: string[]) {
      calls.push({ action: "remove", paths });
      return { data: paths, error: null };
    },
  };
  const supabase = {
    storage: {
      from: (name: string) => {
        calls.push({ action: "from", name });
        return bucket;
      },
    },
  };

  assertEquals(await sha256Hex(payload), expectedHash);
  await putStorageObject(
    supabase,
    "supabase",
    "raw-uploads",
    "2026/09/canary.txt",
    payload,
    {
      contentType: "text/plain",
      sha256: expectedHash,
    },
  );
  const downloaded = await downloadStorageObject(
    supabase,
    "supabase",
    "raw-uploads",
    "2026/09/canary.txt",
  );
  assertEquals(new Uint8Array(await downloaded.arrayBuffer()), payload);
  assertEquals(
    await headStorageObject(
      supabase,
      "supabase",
      "raw-uploads",
      "2026/09/canary.txt",
    ),
    {
      size: payload.byteLength,
      etag: "etag-1",
      lastModified: null,
      sha256: null,
    },
  );
  await deleteStorageObject(
    supabase,
    "supabase",
    "raw-uploads",
    "2026/09/canary.txt",
  );
  assertEquals(calls.filter((call) => call.action === "upload").length, 1);
  assertEquals(calls.filter((call) => call.action === "remove").length, 1);
});
