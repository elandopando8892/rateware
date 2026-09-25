import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from "npm:@aws-sdk/client-s3@3.1127.0";
import { getSignedUrl } from "npm:@aws-sdk/s3-request-presigner@3.1127.0";

export type StorageProvider = "supabase" | "oracle_s3";
export type StorageMode = "supabase" | "dual" | "oracle";

export type StorageWritePlan = {
  mode: StorageMode;
  primary: StorageProvider;
  replica: StorageProvider | null;
};

export type StorageObjectHead = {
  size: number;
  etag: string | null;
  lastModified: string | null;
  sha256: string | null;
};

const ORACLE_BUCKET_ENV: Record<string, string> = {
  "raw-uploads": "OCI_S3_RAW_UPLOADS_BUCKET",
  "provider-entity-vault": "OCI_S3_PROVIDER_VAULT_BUCKET",
};

const MODE_ENV: Record<string, string> = {
  "raw-uploads": "RATEWARE_RAW_UPLOAD_STORAGE_MODE",
  "provider-entity-vault": "RATEWARE_PROVIDER_VAULT_STORAGE_MODE",
};

const ORACLE_BUCKET_CONFIG: Record<string, string> = {
  "raw-uploads": "rawUploadsBucket",
  "provider-entity-vault": "providerVaultBucket",
};

const MODE_CONFIG: Record<string, string> = {
  "raw-uploads": "rawUploadsMode",
  "provider-entity-vault": "providerVaultMode",
};

let oracleClient: S3Client | null = null;

function clean(value: unknown) {
  return String(value ?? "").trim();
}

function oracleConfig(): Record<string, unknown> {
  const value = clean(Deno.env.get("RATEWARE_ORACLE_STORAGE_CONFIG"));
  if (!value) return {};
  try {
    const parsed = JSON.parse(value);
    if (!parsed || Array.isArray(parsed) || typeof parsed !== "object") {
      throw new Error("configuration must be a JSON object");
    }
    return parsed as Record<string, unknown>;
  } catch (error) {
    throw new Error(
      `RATEWARE_ORACLE_STORAGE_CONFIG is invalid: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
  }
}

function oracleSetting(envName: string, configName: string, required = true) {
  const value = clean(Deno.env.get(envName)) ||
    clean(oracleConfig()[configName]);
  if (!value && required) {
    throw new Error(
      `${envName} is required for Oracle Object Storage (directly or in RATEWARE_ORACLE_STORAGE_CONFIG.${configName}).`,
    );
  }
  return value;
}

function normalizeProvider(value: unknown): StorageProvider {
  return clean(value).toLowerCase() === "oracle_s3" ? "oracle_s3" : "supabase";
}

function oracleBucket(logicalBucket: string) {
  const envName = ORACLE_BUCKET_ENV[logicalBucket];
  const configName = ORACLE_BUCKET_CONFIG[logicalBucket];
  if (!envName || !configName) {
    throw new Error(
      `Oracle bucket mapping is not allowed for ${logicalBucket}.`,
    );
  }
  return oracleSetting(envName, configName);
}

function s3() {
  if (oracleClient) return oracleClient;
  const namespace = oracleSetting("OCI_S3_NAMESPACE", "namespace");
  const region = oracleSetting("OCI_S3_REGION", "region");
  const endpoint = oracleSetting("OCI_S3_ENDPOINT", "endpoint", false) ||
    `https://${namespace}.compat.objectstorage.${region}.oraclecloud.com`;
  oracleClient = new S3Client({
    region,
    endpoint,
    forcePathStyle: true,
    credentials: {
      accessKeyId: oracleSetting("OCI_S3_ACCESS_KEY_ID", "accessKeyId"),
      secretAccessKey: oracleSetting(
        "OCI_S3_SECRET_ACCESS_KEY",
        "secretAccessKey",
      ),
    },
  });
  return oracleClient;
}

function splitPath(path: string) {
  const normalized = clean(path).replace(/^\/+/, "");
  const slash = normalized.lastIndexOf("/");
  return slash < 0 ? { prefix: "", filename: normalized } : {
    prefix: normalized.slice(0, slash),
    filename: normalized.slice(slash + 1),
  };
}

function supabaseStorage(supabase: any, bucket: string) {
  if (!supabase?.storage?.from) {
    throw new Error("Supabase Storage client is required.");
  }
  return supabase.storage.from(bucket);
}

export function storageWritePlan(logicalBucket: string): StorageWritePlan {
  const envName = MODE_ENV[logicalBucket];
  const configName = MODE_CONFIG[logicalBucket];
  const configured = clean(
    (envName && Deno.env.get(envName)) ||
      Deno.env.get("RATEWARE_OBJECT_STORAGE_MODE") ||
      (configName && oracleConfig()[configName]) || "supabase",
  ).toLowerCase();
  if (!new Set(["supabase", "dual", "oracle"]).has(configured)) {
    throw new Error(
      `${
        envName || "RATEWARE_OBJECT_STORAGE_MODE"
      } must be supabase, dual, or oracle.`,
    );
  }
  const mode = configured as StorageMode;
  if (mode !== "supabase") oracleBucket(logicalBucket);
  return {
    mode,
    primary: mode === "oracle" ? "oracle_s3" : "supabase",
    replica: mode === "dual" ? "oracle_s3" : null,
  };
}

export async function sha256Hex(bytes: Uint8Array) {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    bytes.slice().buffer as ArrayBuffer,
  );
  return [...new Uint8Array(digest)].map((value) =>
    value.toString(16).padStart(2, "0")
  ).join("");
}

export async function putStorageObject(
  supabase: any,
  providerValue: unknown,
  logicalBucket: string,
  path: string,
  bytes: Uint8Array,
  options: {
    contentType?: string | null;
    sha256?: string | null;
    upsert?: boolean;
  } = {},
): Promise<
  {
    provider: StorageProvider;
    bucket: string;
    path: string;
    etag: string | null;
  }
> {
  const provider = normalizeProvider(providerValue);
  if (provider === "supabase") {
    const result = await supabaseStorage(supabase, logicalBucket).upload(
      path,
      bytes,
      {
        cacheControl: "3600",
        contentType: clean(options.contentType) || undefined,
        upsert: Boolean(options.upsert),
      },
    );
    if (result.error) throw result.error;
    return { provider, bucket: logicalBucket, path, etag: null };
  }

  const result = await s3().send(
    new PutObjectCommand({
      Bucket: oracleBucket(logicalBucket),
      Key: path,
      Body: bytes,
      ContentType: clean(options.contentType) || undefined,
      Metadata: options.sha256 ? { sha256: options.sha256 } : undefined,
    }),
  );
  return {
    provider,
    bucket: logicalBucket,
    path,
    etag: clean(result.ETag).replace(/^"|"$/g, "") || null,
  };
}

export async function downloadStorageObject(
  supabase: any,
  providerValue: unknown,
  logicalBucket: string,
  path: string,
) {
  const provider = normalizeProvider(providerValue);
  if (provider === "supabase") {
    const result = await supabaseStorage(supabase, logicalBucket).download(
      path,
    );
    if (result.error || !result.data) {
      throw result.error || new Error("Supabase object download failed.");
    }
    return result.data as Blob;
  }
  const result = await s3().send(
    new GetObjectCommand({ Bucket: oracleBucket(logicalBucket), Key: path }),
  );
  if (!result.Body) {
    throw new Error("Oracle object download returned an empty body.");
  }
  const bytes = await result.Body.transformToByteArray();
  return new Blob([bytes.slice().buffer as ArrayBuffer], {
    type: clean(result.ContentType) || "application/octet-stream",
  });
}

export async function headStorageObject(
  supabase: any,
  providerValue: unknown,
  logicalBucket: string,
  path: string,
): Promise<StorageObjectHead> {
  const provider = normalizeProvider(providerValue);
  if (provider === "supabase") {
    const { prefix, filename } = splitPath(path);
    const result = await supabaseStorage(supabase, logicalBucket).list(prefix, {
      limit: 2,
      search: filename,
    });
    if (result.error) throw result.error;
    const matches = (result.data || []).filter((item: Record<string, any>) =>
      item.name === filename
    );
    if (matches.length !== 1) {
      throw new Error("Exactly one storage object is required.");
    }
    const object = matches[0];
    const size = Number(
      object?.metadata?.size ?? object?.metadata?.contentLength,
    );
    return {
      size,
      etag: clean(object?.metadata?.eTag || object?.metadata?.etag) || null,
      lastModified: clean(object?.updated_at || object?.last_modified_at) ||
        null,
      sha256: clean(object?.metadata?.sha256) || null,
    };
  }
  const result = await s3().send(
    new HeadObjectCommand({ Bucket: oracleBucket(logicalBucket), Key: path }),
  );
  return {
    size: Number(result.ContentLength),
    etag: clean(result.ETag).replace(/^"|"$/g, "") || null,
    lastModified: result.LastModified?.toISOString() || null,
    sha256: clean(result.Metadata?.sha256) || null,
  };
}

export async function deleteStorageObject(
  supabase: any,
  providerValue: unknown,
  logicalBucket: string,
  path: string,
) {
  const provider = normalizeProvider(providerValue);
  if (provider === "supabase") {
    const result = await supabaseStorage(supabase, logicalBucket).remove([
      path,
    ]);
    if (result.error) throw result.error;
    return;
  }
  await s3().send(
    new DeleteObjectCommand({ Bucket: oracleBucket(logicalBucket), Key: path }),
  );
}

export async function createStorageUploadUrl(
  supabase: any,
  providerValue: unknown,
  logicalBucket: string,
  path: string,
  options: {
    expiresIn?: number;
    contentType?: string | null;
    sha256?: string | null;
  } = {},
) {
  const provider = normalizeProvider(providerValue);
  if (provider === "supabase") {
    const result = await supabaseStorage(supabase, logicalBucket)
      .createSignedUploadUrl(path);
    if (result.error || !result.data?.signedUrl) {
      throw result.error ||
        new Error("Supabase signed upload URL was not created.");
    }
    return {
      url: result.data.signedUrl,
      token: result.data.token || null,
      headers: {},
    };
  }
  const url = await getSignedUrl(
    s3(),
    new PutObjectCommand({
      Bucket: oracleBucket(logicalBucket),
      Key: path,
      ContentType: clean(options.contentType) || undefined,
      Metadata: options.sha256 ? { sha256: options.sha256 } : undefined,
    }),
    { expiresIn: options.expiresIn || 600 },
  );
  const headers: Record<string, string> = {};
  if (clean(options.contentType)) {
    headers["content-type"] = clean(options.contentType);
  }
  if (options.sha256) headers["x-amz-meta-sha256"] = options.sha256;
  return { url, token: null, headers };
}

export async function createStorageDownloadUrl(
  supabase: any,
  providerValue: unknown,
  logicalBucket: string,
  path: string,
  options: { expiresIn?: number; downloadName?: string | null } = {},
) {
  const provider = normalizeProvider(providerValue);
  if (provider === "supabase") {
    const result = await supabaseStorage(supabase, logicalBucket)
      .createSignedUrl(path, options.expiresIn || 600, {
        download: clean(options.downloadName) || undefined,
      });
    if (result.error || !result.data?.signedUrl) {
      throw result.error ||
        new Error("Supabase signed download URL was not created.");
    }
    return result.data.signedUrl as string;
  }
  const downloadName = clean(options.downloadName).replace(/["\r\n]/g, "_");
  return await getSignedUrl(
    s3(),
    new GetObjectCommand({
      Bucket: oracleBucket(logicalBucket),
      Key: path,
      ResponseContentDisposition: downloadName
        ? `attachment; filename="${downloadName}"`
        : undefined,
    }),
    { expiresIn: options.expiresIn || 600 },
  );
}
