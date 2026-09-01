const MAX_BYTES = 25 * 1024 * 1024;
const MAX_METADATA_BYTES = 4 * 1024 * 1024;
const MAX_DIMENSION = 20_000;
const MAX_PIXELS = 100_000_000;
const PNG_SIGNATURE = [137, 80, 78, 71, 13, 10, 26, 10] as const;

function reject(): never {
  throw new Error("IMAGE_FORMAT_POLICY_REJECTED");
}

function uint16(bytes: Uint8Array, offset: number): number {
  return (bytes[offset] << 8) | bytes[offset + 1];
}

function uint32(bytes: Uint8Array, offset: number): number {
  return (
    bytes[offset] * 0x1000000 +
    (bytes[offset + 1] << 16) +
    (bytes[offset + 2] << 8) +
    bytes[offset + 3]
  ) >>> 0;
}

function assertDimensions(width: number, height: number): void {
  if (
    !Number.isSafeInteger(width) || !Number.isSafeInteger(height) ||
    width < 1 || height < 1 || width > MAX_DIMENSION ||
    height > MAX_DIMENSION || width * height > MAX_PIXELS
  ) reject();
}

function crc32(bytes: Uint8Array, start: number, end: number): number {
  let crc = 0xffffffff;
  for (let index = start; index < end; index += 1) {
    crc ^= bytes[index];
    for (let bit = 0; bit < 8; bit += 1) {
      crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0);
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

export function assertStrictPng(bytes: Uint8Array): void {
  if (
    !(bytes instanceof Uint8Array) || bytes.byteLength < 45 ||
    bytes.byteLength > MAX_BYTES ||
    PNG_SIGNATURE.some((value, index) => bytes[index] !== value)
  ) reject();
  let offset: number = PNG_SIGNATURE.length;
  let chunks = 0;
  let sawHeader = false;
  let sawImageData = false;
  let sawEnd = false;
  while (offset < bytes.byteLength) {
    if (offset + 12 > bytes.byteLength || chunks >= 10_000) reject();
    const length = uint32(bytes, offset);
    const typeOffset = offset + 4;
    const dataOffset = offset + 8;
    const dataEnd = dataOffset + length;
    const chunkEnd = dataEnd + 4;
    if (length > MAX_BYTES || chunkEnd > bytes.byteLength) reject();
    const type = String.fromCharCode(...bytes.slice(typeOffset, typeOffset + 4));
    if (!/^[A-Za-z]{4}$/.test(type) || /[a-z]/.test(type[2])) reject();
    if (crc32(bytes, typeOffset, dataEnd) !== uint32(bytes, dataEnd)) reject();
    if (!sawHeader) {
      if (type !== "IHDR" || length !== 13) reject();
      const width = uint32(bytes, dataOffset);
      const height = uint32(bytes, dataOffset + 4);
      const bitDepth = bytes[dataOffset + 8];
      const colorType = bytes[dataOffset + 9];
      const allowedDepths: Record<number, readonly number[]> = {
        0: [1, 2, 4, 8, 16],
        2: [8, 16],
        3: [1, 2, 4, 8],
        4: [8, 16],
        6: [8, 16],
      };
      assertDimensions(width, height);
      if (
        !allowedDepths[colorType]?.includes(bitDepth) ||
        bytes[dataOffset + 10] !== 0 || bytes[dataOffset + 11] !== 0 ||
        ![0, 1].includes(bytes[dataOffset + 12])
      ) reject();
      sawHeader = true;
    } else if (type === "IHDR") {
      reject();
    }
    if (/^[A-Z]/.test(type) && !["IHDR", "PLTE", "IDAT", "IEND"].includes(type)) {
      reject();
    }
    if (type === "IDAT") sawImageData = true;
    if (type === "IEND") {
      if (length !== 0 || !sawImageData || chunkEnd !== bytes.byteLength) reject();
      sawEnd = true;
    }
    chunks += 1;
    offset = chunkEnd;
  }
  if (!sawHeader || !sawImageData || !sawEnd) reject();
}

const SOF_MARKERS = new Set([
  0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7,
  0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf,
]);

export function assertStrictJpeg(bytes: Uint8Array): void {
  if (
    !(bytes instanceof Uint8Array) || bytes.byteLength < 32 ||
    bytes.byteLength > MAX_BYTES || bytes[0] !== 0xff || bytes[1] !== 0xd8 ||
    bytes.at(-2) !== 0xff || bytes.at(-1) !== 0xd9
  ) reject();
  let offset = 2;
  let sawFrame = false;
  let sawScan = false;
  let metadataBytes = 0;
  while (offset < bytes.byteLength - 2) {
    if (bytes[offset] !== 0xff) reject();
    while (offset < bytes.byteLength - 2 && bytes[offset] === 0xff) offset += 1;
    const marker = bytes[offset++];
    if (marker === 0x00 || marker === 0xd8 || marker === 0xd9 ||
      marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) reject();
    if (offset + 2 > bytes.byteLength - 2) reject();
    const length = uint16(bytes, offset);
    if (length < 2 || offset + length > bytes.byteLength - 2) reject();
    const dataOffset = offset + 2;
    if (SOF_MARKERS.has(marker)) {
      if (length < 8) reject();
      assertDimensions(uint16(bytes, dataOffset + 3), uint16(bytes, dataOffset + 1));
      sawFrame = true;
    }
    if ((marker >= 0xe0 && marker <= 0xef) || marker === 0xfe) {
      metadataBytes += length - 2;
      if (metadataBytes > MAX_METADATA_BYTES) reject();
    }
    offset += length;
    if (marker === 0xda) {
      sawScan = true;
      break;
    }
  }
  if (!sawFrame || !sawScan || offset >= bytes.byteLength - 2) reject();
}

export function createStrictImageFormatScanner(contentType: string) {
  return (bytes: Uint8Array): Promise<"clean" | "unknown"> => {
    try {
      if (contentType === "image/png") assertStrictPng(bytes);
      else if (contentType === "image/jpeg") assertStrictJpeg(bytes);
      else return Promise.resolve("unknown");
      return Promise.resolve("clean");
    } catch {
      return Promise.resolve("unknown");
    }
  };
}
