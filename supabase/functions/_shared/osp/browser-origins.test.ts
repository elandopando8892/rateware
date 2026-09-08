// deno-lint-ignore no-import-prefix -- pinned test assertions
import { assertEquals, assertThrows } from "jsr:@std/assert@1.0.14";
import { ospBrowserOrigins } from "./browser-origins.ts";
import { createOspReadHandler } from "../../osp-read-api/handler.ts";
import { createCaseApiHandler } from "../../osp-case-api/handler.ts";
import { createFormApiHandler } from "../../osp-form-api/handler.ts";
import { createDocumentApiHandler } from "../../osp-document-api/handler.ts";
import { OspApiError } from "../../osp-read-api/http.ts";

const approved =
  "https://osp-customer-setup-approved-elandopando8892s-projects.vercel.app";

Deno.test("authenticated preview origin is opt-in, exact and never a wildcard", () => {
  assertEquals(ospBrowserOrigins().has(approved), false);
  assertEquals(ospBrowserOrigins(approved).has(approved), true);
  assertEquals(
    ospBrowserOrigins(approved).has(approved.replace("approved-", "other-")),
    false,
  );
  assertEquals(
    ospBrowserOrigins(approved).has("https://osp.heymarksman.com"),
    true,
  );
  for (
    const value of [
      "",
      "*",
      "https://*.vercel.app",
      `${approved}/`,
      `${approved}?x=1`,
      `${approved}.evil.test`,
      approved.replace("elandopando8892s", "attacker"),
      approved.replace("https://", "http://"),
      "https://osp.heymarksman.com",
    ]
  ) {
    assertThrows(
      () => ospBrowserOrigins(value),
      Error,
      "INVALID_OSP_PREVIEW_ORIGIN",
    );
  }
});

Deno.test("all four API handlers allow only the configured preview and still require authentication", async (t) => {
  let verified = 0;
  const verifyToken = () => {
    verified++;
    return Promise.reject(new OspApiError("UNAUTHORIZED"));
  };
  const factories = [
    {
      slug: "osp-read-api",
      query: "",
      headers: "authorization, content-type",
      create: (approvedPreviewOrigin?: string) =>
        createOspReadHandler({
          approvedPreviewOrigin,
          verifyToken,
          store: {} as never,
        }),
    },
    {
      slug: "osp-case-api",
      query: "?action=list_clarification_reviews",
      headers: "authorization",
      create: (approvedPreviewOrigin?: string) =>
        createCaseApiHandler({
          approvedPreviewOrigin,
          verifyToken,
          clarificationStore: {} as never,
        }),
    },
    {
      slug: "osp-form-api",
      query: "",
      headers: "authorization, content-type",
      create: (approvedPreviewOrigin?: string) =>
        createFormApiHandler({
          approvedPreviewOrigin,
          verifyToken,
          store: {} as never,
          canonicalFieldIds: [],
        }),
    },
    {
      slug: "osp-document-api",
      query: "?action=list_document_versions",
      headers: "authorization",
      create: (approvedPreviewOrigin?: string) =>
        createDocumentApiHandler({
          approvedPreviewOrigin,
          verifyToken,
          listVersions: () => {
            throw new Error("UNEXPECTED_STORAGE");
          },
          documentService: {} as never,
        }),
    },
  ];
  for (const entry of factories) {
    await t.step(entry.slug, async () => {
      const url = `https://example.test/${entry.slug}${entry.query}`;
      const preflight = (origin: string) =>
        new Request(url, {
          method: "OPTIONS",
          headers: {
            origin,
            "access-control-request-method": "POST",
            "access-control-request-headers": entry.headers,
          },
        });
      const handler = entry.create(approved);
      const allowed = await handler(preflight(approved));
      assertEquals(allowed.status, 204);
      assertEquals(
        allowed.headers.get("access-control-allow-origin"),
        approved,
      );
      for (
        const origin of [
          approved.replace("approved-", "other-"),
          `${approved}.evil.test`,
        ]
      ) {
        const denied = await handler(preflight(origin));
        assertEquals(denied.status, 400);
        assertEquals(denied.headers.get("access-control-allow-origin"), null);
      }
      assertEquals((await entry.create()(preflight(approved))).status, 400);
      const before = verified;
      const noToken = await handler(
        new Request(url, {
          method: "POST",
          headers: { origin: approved, "content-type": "application/json" },
          body: "{}",
        }),
      );
      assertEquals(noToken.status, 401);
      assertEquals(verified, before);
      const invalid = await handler(
        new Request(url, {
          method: "POST",
          headers: {
            origin: approved,
            "content-type": "application/json",
            authorization: "Bearer invalid",
          },
          body: "{}",
        }),
      );
      assertEquals(invalid.status, 401);
      assertEquals(verified, before + 1);
    });
  }
});
