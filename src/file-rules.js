export const ALLOWED_EXTENSIONS = new Set(["xlsx", "pdf", "eml", "jpg", "jpeg", "png", "gif", "webp", "bmp", "tif", "tiff"]);

const IMAGE_MIME_PREFIX = "image/";
const XLSX_MIME = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

export function getExtension(filename) {
  const parts = filename.toLowerCase().split(".");
  return parts.length > 1 ? parts.pop() : "";
}

export function detectDocumentType(file) {
  const extension = getExtension(file.name);

  if (extension === "xlsx" || file.type === XLSX_MIME) return "xlsx";
  if (extension === "pdf" || file.type === "application/pdf") return "pdf";
  if (extension === "eml" || file.type === "message/rfc822") return "email";
  if (ALLOWED_EXTENSIONS.has(extension) && file.type.startsWith(IMAGE_MIME_PREFIX)) return "image";
  if (["jpg", "jpeg", "png", "gif", "webp", "bmp", "tif", "tiff"].includes(extension)) return "image";

  return "unsupported";
}

export function isAllowedFile(file) {
  return detectDocumentType(file) !== "unsupported";
}

export function sanitizeFilename(filename) {
  return filename
    .normalize("NFKD")
    .replace(/[^\w.\-]+/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_+|_+$/g, "");
}

export function buildStoragePath(file, uploadId = crypto.randomUUID(), now = new Date()) {
  const year = String(now.getUTCFullYear());
  const month = String(now.getUTCMonth() + 1).padStart(2, "0");
  const filename = sanitizeFilename(file.name) || `upload.${getExtension(file.name) || "bin"}`;

  return {
    uploadId,
    path: `${year}/${month}/${uploadId}/${filename}`
  };
}
