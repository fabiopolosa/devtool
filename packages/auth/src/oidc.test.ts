import { OidcHttpClient, UnconfiguredExternalIdentityClient } from "./oidc.js";

describe("OIDC stub client", () => {
  it("throws clear errors when not configured", async () => {
    const client = new UnconfiguredExternalIdentityClient();

    await expect(
      client.beginAuthorization({
        state: "state_001",
        nonce: "nonce_001"
      })
    ).rejects.toThrow(/not configured/i);

    await expect(
      client.exchangeCodeForIdentity({
        code: "code_001",
        state: "state_001"
      })
    ).rejects.toThrow(/not configured/i);
  });

  it("builds authorization URL and exchanges token payload", async () => {
    const fetchMock: typeof fetch = async (input, init) => {
      const url = String(input);
      if (url.endsWith("/token")) {
        expect(init?.method).toBe("POST");
        return new Response(JSON.stringify({
          access_token: "access_token_123",
          id_token: "eyJhbGciOiJub25lIn0.eyJzdWIiOiJzdWJfMDAxIiwiZW1haWwiOiJ1c2VyQGV4YW1wbGUuY29tIiwibmFtZSI6Ik9JREMgVXNlciJ9."
        }), { status: 200, headers: { "content-type": "application/json" } });
      }

      if (url.endsWith("/userinfo")) {
        return new Response(JSON.stringify({
          sub: "sub_001",
          email: "user@example.com",
          name: "OIDC User"
        }), { status: 200, headers: { "content-type": "application/json" } });
      }

      return new Response("not found", { status: 404 });
    };

    const client = new OidcHttpClient({
      issuer: "https://idp.example.com",
      clientId: "client_001",
      clientSecret: "secret_001",
      redirectUri: "http://localhost:5173/login",
      scopes: ["openid", "profile", "email"]
    }, fetchMock);

    const start = await client.beginAuthorization({
      state: "state_abc",
      nonce: "nonce_abc",
      codeVerifier: "verifier_abc"
    });
    expect(start.authorizationUrl).toContain("response_type=code");
    expect(start.authorizationUrl).toContain("state=state_abc");
    expect(start.authorizationUrl).toContain("code_challenge=");

    const identity = await client.exchangeCodeForIdentity({
      code: "code_123",
      state: "state_abc",
      codeVerifier: "verifier_abc"
    });
    expect(identity.subject).toBe("sub_001");
    expect(identity.email).toBe("user@example.com");
    expect(identity.displayName).toBe("OIDC User");
  });
});
