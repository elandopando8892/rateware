import { assertEquals, assertThrows } from "jsr:@std/assert@1.0.14";

import {
  assertStrictJpeg,
  assertStrictPng,
  createStrictImageFormatScanner,
} from "./strict-image-format-scanner.ts";

function decode(value: string): Uint8Array {
  return Uint8Array.from(atob(value), (character) => character.charCodeAt(0));
}

const PNG = decode(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
);
const JPEG = decode(
  "/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////2wBDAf//////////////////////////////////////////////////////////////////////////////////////wAARCAABAAEDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAf/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/9oADAMBAAIQAxAAAAF//8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABBQJ//8QAFBEBAAAAAAAAAAAAAAAAAAAAAP/aAAgBAwEBPwF//8QAFBEBAAAAAAAAAAAAAAAAAAAAAP/aAAgBAgEBPwF//8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQAGPwJ//8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPyF//9oADAMBAAIAAwAAABD/xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oACAEDAQE/EB//xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oACAECAQE/EB//xAAUEAEAAAAAAAAAAAAAAAAAAAAA/9oACAEBAAE/EB//2Q==",
);

Deno.test("strict image policy accepts bounded PNG and JPEG evidence", async () => {
  assertStrictPng(PNG);
  assertStrictJpeg(JPEG);
  assertEquals(await createStrictImageFormatScanner("image/png")(PNG), "clean");
  assertEquals(await createStrictImageFormatScanner("image/jpeg")(JPEG), "clean");
});

Deno.test("strict image policy rejects corrupted, trailing and unsupported evidence", async () => {
  const corrupted = PNG.slice();
  corrupted[corrupted.length - 5] ^= 1;
  assertThrows(() => assertStrictPng(corrupted), Error, "IMAGE_FORMAT_POLICY_REJECTED");
  assertThrows(
    () => assertStrictPng(Uint8Array.from([...PNG, 1])),
    Error,
    "IMAGE_FORMAT_POLICY_REJECTED",
  );
  assertThrows(
    () => assertStrictJpeg(JPEG.slice(0, -1)),
    Error,
    "IMAGE_FORMAT_POLICY_REJECTED",
  );
  assertEquals(await createStrictImageFormatScanner("image/webp")(PNG), "unknown");
});
