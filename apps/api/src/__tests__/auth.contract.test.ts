import type { FastifyInstance } from "fastify";

describe("Auth + RBAC slice", () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    process.env.API_STORE_MODE = "in_memory";
    process.env.AUTH_ENABLED = "1";
    process.env.AUTH_SESSION_TTL_HOURS = "24";

    const { buildApp } = await import("../app.js");
    app = await buildApp();
  });

  afterAll(async () => {
    if (app) {
      await app.close();
    }
    delete process.env.AUTH_ENABLED;
    delete process.env.AUTH_SESSION_TTL_HOURS;
  });

  it("authenticates valid credentials and returns a session token", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/auth/login",
      payload: {
        email: "admin@control-plane.local",
        password: "admin123!"
      }
    });

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(typeof body.item.token).toBe("string");
    expect(typeof body.item.refreshToken).toBe("string");
    expect(body.item.user.email).toBe("admin@control-plane.local");
    expect(body.item.roles).toContain("admin");
  });

  it("rotates session using refresh token", async () => {
    const login = await app.inject({
      method: "POST",
      url: "/auth/login",
      payload: {
        email: "viewer@control-plane.local",
        password: "viewer123!"
      }
    });
    expect(login.statusCode).toBe(200);
    const refreshToken = login.json().item.refreshToken as string;
    expect(typeof refreshToken).toBe("string");

    const refresh = await app.inject({
      method: "POST",
      url: "/auth/refresh",
      payload: { refreshToken }
    });

    expect(refresh.statusCode).toBe(200);
    expect(typeof refresh.json().item.token).toBe("string");
    expect(typeof refresh.json().item.refreshToken).toBe("string");
  });

  it("rejects invalid credentials", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/auth/login",
      payload: {
        email: "admin@control-plane.local",
        password: "wrong-password"
      }
    });

    expect(response.statusCode).toBe(401);
    expect(response.json()).toMatchObject({ error: "invalid_credentials" });
  });

  it("blocks protected endpoints when unauthenticated", async () => {
    const response = await app.inject({
      method: "GET",
      url: "/auth/users"
    });

    expect(response.statusCode).toBe(401);
    expect(response.json()).toMatchObject({ error: "unauthenticated" });
  });

  it("returns forbidden for authenticated users lacking admin role", async () => {
    const login = await app.inject({
      method: "POST",
      url: "/auth/login",
      payload: {
        email: "viewer@control-plane.local",
        password: "viewer123!"
      }
    });
    expect(login.statusCode).toBe(200);
    const token = login.json().item.token as string;

    const response = await app.inject({
      method: "GET",
      url: "/auth/users",
      headers: {
        authorization: `Bearer ${token}`
      }
    });

    expect(response.statusCode).toBe(403);
    expect(response.json()).toMatchObject({ error: "forbidden" });
  });

  it("returns not_found for OIDC start when OIDC is disabled", async () => {
    const response = await app.inject({
      method: "GET",
      url: "/auth/oidc/start"
    });
    expect(response.statusCode).toBe(404);
    expect(response.json()).toMatchObject({ error: "not_found" });
  });
});
