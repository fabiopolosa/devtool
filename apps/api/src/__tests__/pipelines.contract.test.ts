import type { FastifyInstance, InjectOptions, LightMyRequestResponse } from "fastify";
import type { Job } from "@cp/domain";
import { getRunnerJobOutput } from "../services/job-dispatch-service.js";
import {
  startTestExecutionWorkerHarness,
  type TestExecutionWorkerHarness
} from "./helpers/execution-worker-harness.js";

describe("Pipelines API contract", () => {
  type InjectRequestOptions = InjectOptions;
  type InjectResponse = LightMyRequestResponse;

  let app: FastifyInstance;
  let projectId: string;
  let workerHarness: TestExecutionWorkerHarness;
  let adminHeaders: Record<string, string>;

  beforeAll(async () => {
    process.env.API_STORE_MODE = "in_memory";
    process.env.REDIS_URL = "";
    process.env.AUTH_ENABLED = "1";

    const { buildApp } = await import("../app.js");
    app = await buildApp();
    workerHarness = await startTestExecutionWorkerHarness();

    const login = await app.inject({
      method: "POST",
      url: "/auth/login",
      payload: { email: "admin@control-plane.local", password: "admin123!" }
    });
    expect(login.statusCode).toBe(200);
    const token = (login.json() as { item: { token: string } }).item.token;
    adminHeaders = { authorization: `Bearer ${token}` };

    const projects = await app.inject({ method: "GET", url: "/projects", headers: adminHeaders });
    const projectsBody = projects.json() as { items?: Array<{ id: string }> };
    projectId = projectsBody.items?.[0]?.id ?? "proj_001";
  });

  afterAll(async () => {
    if (workerHarness) {
      await workerHarness.stop();
    }
    if (app) {
      await app.close();
    }
    delete process.env.AUTH_ENABLED;
  });

  const inject = (options: InjectRequestOptions): Promise<InjectResponse> =>
    app.inject({
      ...options,
      headers: {
        ...adminHeaders,
        ...(options.headers ?? {})
      }
    });

  const waitForJob = async (jobId: string): Promise<Job> => {
    const startedAt = Date.now();
    while (Date.now() - startedAt < 20_000) {
      const response = await inject({
        method: "GET",
        url: `/jobs/${jobId}`
      });
      expect(response.statusCode).toBe(200);
      const body = response.json() as {
        item?: Job;
      };
      const item = body.item;
      if (!item) {
        throw new Error(`Job ${jobId} not found`);
      }
      if (item.status === "done" || item.status === "waiting_user") {
        return item;
      }
      if (item.status === "error") {
        const payload = item.payload as Record<string, unknown> | undefined;
        const lastError =
          payload && typeof payload.lastError === "object" && payload.lastError !== null
            ? (payload.lastError as Record<string, unknown>)
            : undefined;
        const message =
          typeof lastError?.message === "string" ? lastError.message : `Pipeline job ${jobId} failed`;
        throw new Error(message);
      }
      await new Promise((resolve) => setTimeout(resolve, 40));
    }
    throw new Error(`Timed out waiting for pipeline job ${jobId}`);
  };

  it("runs research pipeline with structured output", async () => {
    const response = await inject({
      method: "POST",
      url: `/projects/${projectId}/pipelines/research`,
      payload: {
        query: "best practices for data ingestion pipeline observability",
        mode: "local"
      }
    });

    expect(response.statusCode).toBe(200);
    const body = response.json() as {
      jobId?: string;
      status?: string;
    };
    expect(typeof body.jobId).toBe("string");
    expect(body.status).toBe("pending");
    const job = await waitForJob(body.jobId!);
    const output = getRunnerJobOutput<{ result?: {
      query?: string;
      plannedQueries?: string[];
      summaries?: string[];
      confidence?: number;
      sources?: unknown[];
    } }>(job);
    const result = output?.result;
    expect(result?.query).toContain("data ingestion pipeline observability");
    expect(Array.isArray(result?.plannedQueries)).toBe(true);
    expect(Array.isArray(result?.summaries)).toBe(true);
    expect(typeof result?.confidence).toBe("number");
    expect(Array.isArray(result?.sources)).toBe(true);
  });

  it("runs content pipeline with multi-step artifacts", async () => {
    const response = await inject({
      method: "POST",
      url: `/projects/${projectId}/pipelines/content`,
      payload: {
        topic: "How to design resilient pizza price monitoring in Italy",
        objective: "Deliver practical architecture guidance"
      }
    });

    expect(response.statusCode).toBe(200);
    const body = response.json() as {
      jobId?: string;
      status?: string;
    };
    expect(typeof body.jobId).toBe("string");
    expect(body.status).toBe("pending");
    const job = await waitForJob(body.jobId!);
    const output = getRunnerJobOutput<{ result?: {
      topic?: string;
      outline?: unknown[];
      sections?: unknown[];
      refinedDraft?: string;
      summary?: string;
      research?: { query?: string };
    } }>(job);
    const result = output?.result;
    expect(result?.topic).toContain("pizza price monitoring");
    expect(Array.isArray(result?.outline)).toBe(true);
    expect(Array.isArray(result?.sections)).toBe(true);
    expect(typeof result?.refinedDraft).toBe("string");
    expect(typeof result?.summary).toBe("string");
    expect(typeof result?.research?.query).toBe("string");
  });

  it("runs visual and multimodal pipelines", async () => {
    const visualResponse = await inject({
      method: "POST",
      url: `/projects/${projectId}/pipelines/visual`,
      payload: {
        concept: "Editorial storyboard for pizza pricing dashboard launch"
      }
    });
    expect(visualResponse.statusCode).toBe(200);
    const visualBody = visualResponse.json() as {
      jobId?: string;
      status?: string;
    };
    expect(typeof visualBody.jobId).toBe("string");
    expect(visualBody.status).toBe("pending");
    const visualJob = await waitForJob(visualBody.jobId!);
    const visualOutput = getRunnerJobOutput<{ result?: {
      concept?: string;
      scenes?: Array<{ id?: string; prompt?: string }>;
    } }>(visualJob);
    const visualResult = visualOutput?.result;
    expect(visualResult?.concept).toContain("pizza pricing dashboard");
    expect(Array.isArray(visualResult?.scenes)).toBe(true);
    expect(typeof visualResult?.scenes?.[0]?.prompt).toBe("string");

    const multimodalResponse = await inject({
      method: "POST",
      url: `/projects/${projectId}/pipelines/multimodal`,
      payload: {
        topic: "Launch plan for Prezzopizza editorial platform",
        generateImages: false
      }
    });
    expect(multimodalResponse.statusCode).toBe(200);
    const multimodalBody = multimodalResponse.json() as {
      jobId?: string;
      status?: string;
    };
    expect(typeof multimodalBody.jobId).toBe("string");
    expect(multimodalBody.status).toBe("pending");
    const multimodalJob = await waitForJob(multimodalBody.jobId!);
    const multimodalOutput = getRunnerJobOutput<{ result?: {
      topic?: string;
      research?: { confidence?: number };
      content?: { summary?: string };
      visual?: { scenes?: unknown[] };
      assets?: { videoSegments?: unknown[] };
    } }>(multimodalJob);
    const multimodalResult = multimodalOutput?.result;
    expect(multimodalResult?.topic).toContain("Prezzopizza");
    expect(typeof multimodalResult?.research?.confidence).toBe("number");
    expect(typeof multimodalResult?.content?.summary).toBe("string");
    expect(Array.isArray(multimodalResult?.visual?.scenes)).toBe(true);
    expect(Array.isArray(multimodalResult?.assets?.videoSegments)).toBe(true);
  });
});
