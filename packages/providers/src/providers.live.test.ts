import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import {
  AnthropicChatProvider,
  GeminiChatProvider,
  KieAIImageGenerationProvider,
  OpenAIChatProvider,
  OpenRouterChatProvider
} from "./adapters/index.js";

const liveEnabled = process.env.PROVIDER_E2E === "1";
const providerMode = process.env.PROVIDER_E2E_MODE ?? "real";
const sandboxMode = liveEnabled && providerMode === "sandbox";

let sandboxServer: ReturnType<typeof createServer> | null = null;
let sandboxBaseUrl: string | null = null;

const jsonResponse = (res: ServerResponse, payload: unknown, statusCode = 200) => {
  res.statusCode = statusCode;
  res.setHeader("Content-Type", "application/json");
  res.end(JSON.stringify(payload));
};

const handleSandboxRequest = (req: IncomingMessage, res: ServerResponse) => {
  const url = new URL(req.url ?? "/", "http://127.0.0.1");
  const path = url.pathname;

  if (req.method === "GET" && path === "/openai/models") {
    return jsonResponse(res, { data: [{ id: "gpt-5.1" }] });
  }
  if (req.method === "POST" && path === "/openai/chat/completions") {
    return jsonResponse(res, {
      model: "gpt-5.1",
      choices: [{ message: { content: "OK" } }],
      usage: { prompt_tokens: 3, completion_tokens: 1 }
    });
  }
  if (req.method === "GET" && path === "/anthropic/models") {
    return jsonResponse(res, { data: [{ id: "claude-opus-4.1" }] });
  }
  if (req.method === "GET" && path === "/gemini/models") {
    return jsonResponse(res, { models: [{ name: "gemini-2.5-pro" }] });
  }
  if (req.method === "GET" && path === "/openrouter/models") {
    return jsonResponse(res, { data: [{ id: "openrouter-chat-default" }] });
  }
  if (req.method === "GET" && path === "/kie/health") {
    return jsonResponse(res, { ok: true });
  }

  return jsonResponse(
    res,
    { error: "sandbox_route_not_found", method: req.method, path },
    404
  );
};

const setSandboxEnv = (baseUrl: string) => {
  process.env.OPENAI_BASE_URL = `${baseUrl}/openai`;
  process.env.ANTHROPIC_BASE_URL = `${baseUrl}/anthropic`;
  process.env.GEMINI_BASE_URL = `${baseUrl}/gemini`;
  process.env.OPENROUTER_BASE_URL = `${baseUrl}/openrouter`;
  process.env.KIE_AI_BASE_URL = `${baseUrl}/kie`;
  process.env.OPENAI_API_KEY = process.env.OPENAI_API_KEY ?? "sandbox-openai-key";
  process.env.ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY ?? "sandbox-anthropic-key";
  process.env.GEMINI_API_KEY = process.env.GEMINI_API_KEY ?? "sandbox-gemini-key";
  process.env.OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY ?? "sandbox-openrouter-key";
  process.env.KIE_AI_API_KEY = process.env.KIE_AI_API_KEY ?? "sandbox-kie-key";
};

const providerChecks: Array<{
  name: string;
  envKey: string;
  build: () => { healthcheck: () => Promise<{ status: string; checkedAt: string }> };
}> = [
  {
    name: "openai",
    envKey: "OPENAI_API_KEY",
    build: () => new OpenAIChatProvider()
  },
  {
    name: "anthropic",
    envKey: "ANTHROPIC_API_KEY",
    build: () => new AnthropicChatProvider()
  },
  {
    name: "gemini",
    envKey: "GEMINI_API_KEY",
    build: () => new GeminiChatProvider()
  },
  {
    name: "openrouter",
    envKey: "OPENROUTER_API_KEY",
    build: () => new OpenRouterChatProvider()
  },
  {
    name: "kie_ai",
    envKey: "KIE_AI_API_KEY",
    build: () => new KieAIImageGenerationProvider()
  }
];

describe("providers live e2e", () => {
  beforeAll(async () => {
    if (!sandboxMode) {
      return;
    }

    sandboxServer = createServer(handleSandboxRequest);
    await new Promise<void>((resolve) => {
      sandboxServer!.listen(0, "127.0.0.1", () => resolve());
    });
    const address = sandboxServer.address();
    if (!address || typeof address === "string") {
      throw new Error("Unable to determine sandbox server address");
    }

    sandboxBaseUrl = `http://127.0.0.1:${address.port}`;
    setSandboxEnv(sandboxBaseUrl);
  });

  afterAll(async () => {
    if (!sandboxServer) return;
    await new Promise<void>((resolve, reject) => {
      sandboxServer!.close((error) => {
        if (error) reject(error);
        else resolve();
      });
    });
    sandboxServer = null;
    sandboxBaseUrl = null;
  });

  for (const check of providerChecks) {
    it(
      `healthcheck: ${check.name}`,
      async () => {
        if (!liveEnabled) {
          return;
        }

        if (!sandboxMode && !process.env[check.envKey]) {
          return;
        }

        const runtime = check.build();
        const status = await runtime.healthcheck();

        expect(["healthy", "degraded", "down"]).toContain(status.status);
        expect(typeof status.checkedAt).toBe("string");
      },
      60_000
    );
  }

  it(
    "chat smoke request with OpenAI when deep live mode is enabled",
    async () => {
      const deepLiveEnabled = process.env.PROVIDER_E2E_DEEP === "1";
      if (!liveEnabled || !deepLiveEnabled || (!sandboxMode && !process.env.OPENAI_API_KEY)) {
        return;
      }

      const provider = new OpenAIChatProvider();
      const response = await provider.run(
        {
          prompt: "Reply with a single word: OK",
          maxTokens: 16,
          temperature: 0
        },
        {
          projectId: "proj_live_test"
        }
      );

      expect(response.modelId.length).toBeGreaterThan(0);
      expect(typeof response.outputText).toBe("string");
    },
    60_000
  );
});
