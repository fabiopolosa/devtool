import type { FastifyInstance } from "fastify";
import { vi } from "vitest";
import type { Skill } from "@cp/domain";

describe("Skills API contract", () => {
  let app: FastifyInstance;
  let installSpy: any;

  beforeAll(async () => {
    process.env.API_STORE_MODE = "in_memory";

    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response(
          JSON.stringify({
            skills: [
              {
                name: "release-notes",
                description: "Generate release notes from merged work.",
                repositoryUrl: "https://github.com/example/skills-release-notes",
                version: "1.0.0",
                categories: ["ops", "delivery"],
                instructions: "Summarize merged pull requests grouped by scope."
              }
            ]
          }),
          {
            status: 200,
            headers: { "content-type": "application/json" }
          }
        )
      )
    );

    const serviceModule = await import("../services/skills-service.js");
    installSpy = vi.spyOn(serviceModule.skillsService, "installSkill").mockImplementation(async ({ name, repositoryUrl }) => {
      const now = new Date().toISOString();
      const item: Skill = {
        id: "skill_installed_contract",
        name,
        description: "Installed from API contract test",
        repositoryUrl,
        version: "1.0.0",
        installed: true,
        categories: ["quality"],
        instructions: "Use in task preparation and verification.",
        createdAt: now,
        createdBy: "test",
        updatedAt: now,
        updatedBy: "test"
      };
      return { item, installed: true };
    });

    const { buildApp } = await import("../app.js");
    app = await buildApp();
  });

  afterAll(async () => {
    if (app) {
      await app.close();
    }
    installSpy.mockRestore();
    vi.unstubAllGlobals();
  });

  it("lists marketplace catalog via /skills/catalog", async () => {
    const response = await app.inject({
      method: "GET",
      url: "/skills/catalog?marketplace=https%3A%2F%2Fexample.com%2Fmarketplace.json"
    });

    expect(response.statusCode).toBe(200);
    const body = response.json() as { items: Array<{ name: string }> };
    expect(Array.isArray(body.items)).toBe(true);
    expect(body.items.some((skill) => skill.name === "release-notes")).toBe(true);
  });

  it("lists installed skills via /skills/installed", async () => {
    const response = await app.inject({ method: "GET", url: "/skills/installed" });

    expect(response.statusCode).toBe(200);
    const body = response.json() as { items: Array<{ installed: boolean }> };
    expect(Array.isArray(body.items)).toBe(true);
    expect(body.items.every((item) => item.installed)).toBe(true);
  });

  it("installs a skill via /skills/install", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/skills/install",
      payload: {
        name: "checks",
        repositoryUrl: "https://github.com/example/skills-checks"
      }
    });

    expect(response.statusCode).toBe(200);
    const body = response.json() as { installed: boolean; item: { name: string } };
    expect(body.installed).toBe(true);
    expect(body.item.name).toBe("checks");
    expect(installSpy).toHaveBeenCalledTimes(1);
  });
});
