import { createHash } from "node:crypto";

export type ExternalIdentityProvider = "oidc" | "saml";

export interface OidcProviderConfig {
  issuer: string;
  clientId: string;
  clientSecretRef: string;
  redirectUri: string;
  scopes: string[];
}

export interface OidcAuthorizationRequest {
  state: string;
  nonce: string;
  codeVerifier?: string;
}

export interface OidcAuthorizationResult {
  authorizationUrl: string;
  state: string;
  nonce: string;
  codeVerifier?: string;
}

export interface OidcCallbackPayload {
  code: string;
  state: string;
  codeVerifier?: string;
}

export interface OidcIdentity {
  subject: string;
  email: string;
  displayName: string;
  claims?: Record<string, unknown>;
}

export interface ExternalIdentityClient {
  provider: ExternalIdentityProvider;
  beginAuthorization(request: OidcAuthorizationRequest): Promise<OidcAuthorizationResult>;
  exchangeCodeForIdentity(payload: OidcCallbackPayload): Promise<OidcIdentity>;
}

export interface OidcHttpClientConfig {
  issuer: string;
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  scopes: string[];
  authorizationEndpoint?: string;
  tokenEndpoint?: string;
  userinfoEndpoint?: string;
}

const normalizeIssuer = (issuer: string): string => issuer.replace(/\/$/, "");

const base64UrlEncode = (value: Buffer): string =>
  value
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");

const toCodeChallenge = (codeVerifier: string): string =>
  base64UrlEncode(createHash("sha256").update(codeVerifier, "utf8").digest());

const parseJsonSafe = async (response: Response): Promise<Record<string, unknown>> => {
  const text = await response.text();
  if (!text) return {};
  try {
    return JSON.parse(text) as Record<string, unknown>;
  } catch {
    return { raw: text };
  }
};

const parseJwtPayload = (token?: string): Record<string, unknown> => {
  if (!token) return {};
  const parts = token.split(".");
  if (parts.length < 2) return {};
  const payload = parts[1] ?? "";
  const normalized = payload.replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized + "=".repeat((4 - (normalized.length % 4)) % 4);
  try {
    const decoded = Buffer.from(padded, "base64").toString("utf8");
    return JSON.parse(decoded) as Record<string, unknown>;
  } catch {
    return {};
  }
};

const resolveSecretFromRef = (secretRef: string): string | undefined => {
  if (!secretRef) return undefined;

  if (secretRef.startsWith("env://")) {
    const envKey = secretRef.slice("env://".length);
    return process.env[envKey];
  }

  if (secretRef.startsWith("secret://")) {
    const rawPath = secretRef.slice("secret://".length);
    const envKey = rawPath
      .split("/")
      .filter(Boolean)
      .join("_")
      .replace(/[^a-zA-Z0-9_]/g, "_")
      .toUpperCase();

    return process.env[`SECRET_${envKey}`] ?? process.env[envKey];
  }

  return secretRef;
};

const asString = (value: unknown): string | undefined =>
  typeof value === "string" && value.trim().length > 0 ? value : undefined;

export class OidcHttpClient implements ExternalIdentityClient {
  readonly provider: ExternalIdentityProvider = "oidc";

  private readonly authorizationEndpoint: string;
  private readonly tokenEndpoint: string;
  private readonly userinfoEndpoint: string;

  constructor(
    private readonly config: OidcHttpClientConfig,
    private readonly fetchImpl: typeof fetch = fetch
  ) {
    const issuer = normalizeIssuer(config.issuer);
    this.authorizationEndpoint = config.authorizationEndpoint ?? `${issuer}/authorize`;
    this.tokenEndpoint = config.tokenEndpoint ?? `${issuer}/token`;
    this.userinfoEndpoint = config.userinfoEndpoint ?? `${issuer}/userinfo`;
  }

  async beginAuthorization(request: OidcAuthorizationRequest): Promise<OidcAuthorizationResult> {
    const url = new URL(this.authorizationEndpoint);
    url.searchParams.set("response_type", "code");
    url.searchParams.set("client_id", this.config.clientId);
    url.searchParams.set("redirect_uri", this.config.redirectUri);
    url.searchParams.set("scope", this.config.scopes.join(" "));
    url.searchParams.set("state", request.state);
    url.searchParams.set("nonce", request.nonce);

    if (request.codeVerifier) {
      url.searchParams.set("code_challenge_method", "S256");
      url.searchParams.set("code_challenge", toCodeChallenge(request.codeVerifier));
    }

    return {
      authorizationUrl: url.toString(),
      state: request.state,
      nonce: request.nonce,
      ...(request.codeVerifier ? { codeVerifier: request.codeVerifier } : {})
    };
  }

  async exchangeCodeForIdentity(payload: OidcCallbackPayload): Promise<OidcIdentity> {
    const body = new URLSearchParams({
      grant_type: "authorization_code",
      code: payload.code,
      redirect_uri: this.config.redirectUri,
      client_id: this.config.clientId,
      client_secret: this.config.clientSecret
    });

    if (payload.codeVerifier) {
      body.set("code_verifier", payload.codeVerifier);
    }

    const tokenResponse = await this.fetchImpl(this.tokenEndpoint, {
      method: "POST",
      headers: {
        "content-type": "application/x-www-form-urlencoded",
        accept: "application/json"
      },
      body: body.toString()
    });

    if (!tokenResponse.ok) {
      const detail = await tokenResponse.text();
      throw new Error(`OIDC token exchange failed (${tokenResponse.status}): ${detail}`);
    }

    const tokenBody = await parseJsonSafe(tokenResponse);
    const idTokenClaims = parseJwtPayload(asString(tokenBody.id_token));
    const accessToken = asString(tokenBody.access_token);

    let userInfo: Record<string, unknown> = {};
    if (accessToken) {
      const userInfoResponse = await this.fetchImpl(this.userinfoEndpoint, {
        method: "GET",
        headers: {
          authorization: `Bearer ${accessToken}`,
          accept: "application/json"
        }
      });

      if (userInfoResponse.ok) {
        userInfo = await parseJsonSafe(userInfoResponse);
      }
    }

    const mergedClaims = { ...idTokenClaims, ...userInfo };
    const subject = asString(mergedClaims.sub);
    const email = asString(mergedClaims.email) ?? (subject ? `${subject}@oidc.local` : undefined);
    const displayName =
      asString(mergedClaims.name) ??
      asString(mergedClaims.preferred_username) ??
      email ??
      subject;

    if (!subject || !email || !displayName) {
      throw new Error("OIDC identity response missing required fields (sub/email)");
    }

    return {
      subject,
      email,
      displayName,
      claims: mergedClaims
    };
  }
}

export class UnconfiguredExternalIdentityClient implements ExternalIdentityClient {
  provider: ExternalIdentityProvider = "oidc";

  async beginAuthorization(request: OidcAuthorizationRequest): Promise<OidcAuthorizationResult> {
    throw new Error(
      `External identity client is not configured. Unable to start authorization for state=${request.state}`
    );
  }

  async exchangeCodeForIdentity(payload: OidcCallbackPayload): Promise<OidcIdentity> {
    throw new Error(
      `External identity client is not configured. Unable to exchange code for state=${payload.state}`
    );
  }
}

export const createOidcClientFromEnv = (): ExternalIdentityClient => {
  const enabled = ["1", "true", "yes"].includes((process.env.AUTH_OIDC_ENABLED ?? "").trim().toLowerCase());
  if (!enabled) {
    return new UnconfiguredExternalIdentityClient();
  }

  const issuer = process.env.AUTH_OIDC_ISSUER?.trim();
  const clientId = process.env.AUTH_OIDC_CLIENT_ID?.trim();
  const secretRef = process.env.AUTH_OIDC_CLIENT_SECRET_REF?.trim();
  const redirectUri = process.env.AUTH_OIDC_REDIRECT_URI?.trim();
  const scopes =
    process.env.AUTH_OIDC_SCOPES?.split(",").map((value) => value.trim()).filter(Boolean) ?? ["openid", "profile", "email"];

  const clientSecret = secretRef ? resolveSecretFromRef(secretRef) : undefined;

  if (!issuer || !clientId || !redirectUri || !clientSecret) {
    return new UnconfiguredExternalIdentityClient();
  }

  return new OidcHttpClient({
    issuer,
    clientId,
    clientSecret,
    redirectUri,
    scopes,
    ...(process.env.AUTH_OIDC_AUTHORIZATION_ENDPOINT
      ? { authorizationEndpoint: process.env.AUTH_OIDC_AUTHORIZATION_ENDPOINT }
      : {}),
    ...(process.env.AUTH_OIDC_TOKEN_ENDPOINT ? { tokenEndpoint: process.env.AUTH_OIDC_TOKEN_ENDPOINT } : {}),
    ...(process.env.AUTH_OIDC_USERINFO_ENDPOINT ? { userinfoEndpoint: process.env.AUTH_OIDC_USERINFO_ENDPOINT } : {})
  });
};
