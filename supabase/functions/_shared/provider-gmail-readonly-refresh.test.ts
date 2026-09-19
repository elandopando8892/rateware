import { assertEquals } from "jsr:@std/assert@1.0.14";

Deno.test({
  name:
    "read-only Gmail token refresh never persists the temporary access token",
  permissions: { env: true, read: true },
  async fn() {
    const prior = {
      encryptionKey: Deno.env.get("GMAIL_TOKEN_ENCRYPTION_KEY"),
      clientId: Deno.env.get("GOOGLE_CLIENT_ID"),
      clientSecret: Deno.env.get("GOOGLE_CLIENT_SECRET"),
    };
    Deno.env.set("GMAIL_TOKEN_ENCRYPTION_KEY", "synthetic-encryption-key");
    Deno.env.set("GOOGLE_CLIENT_ID", "synthetic-client-id");
    Deno.env.set("GOOGLE_CLIENT_SECRET", "synthetic-client-secret");
    try {
      const gmail = await import(
        `./provider-gmail.ts?readonly=${crypto.randomUUID()}`
      );
      const encryptedRefreshToken = await gmail.encryptProviderGmailToken(
        "synthetic-refresh-token",
      );
      let writes = 0;
      const accessToken = await gmail.getProviderGmailAccessToken({
        from: () => ({
          update: () => {
            writes++;
            return { eq: () => ({ eq: async () => ({ error: null }) }) };
          },
        }),
      }, {
        id: "11111111-1111-4111-8111-111111111111",
        organization_id: "22222222-2222-4222-8222-222222222222",
        refresh_token_encrypted: encryptedRefreshToken,
        token_expires_at: "2020-01-01T00:00:00Z",
        scopes: ["https://www.googleapis.com/auth/gmail.readonly"],
      }, {
        persistRefreshedToken: false,
        request: async () =>
          new Response(
            JSON.stringify({
              access_token: "temporary-access-token",
              expires_in: 3600,
              scope: "https://www.googleapis.com/auth/gmail.readonly",
            }),
            {
              status: 200,
              headers: { "Content-Type": "application/json" },
            },
          ),
      });
      assertEquals(accessToken, "temporary-access-token");
      assertEquals(writes, 0);
    } finally {
      for (
        const [name, value] of Object.entries({
          GMAIL_TOKEN_ENCRYPTION_KEY: prior.encryptionKey,
          GOOGLE_CLIENT_ID: prior.clientId,
          GOOGLE_CLIENT_SECRET: prior.clientSecret,
        })
      ) {
        if (value === undefined) Deno.env.delete(name);
        else Deno.env.set(name, value);
      }
    }
  },
});
