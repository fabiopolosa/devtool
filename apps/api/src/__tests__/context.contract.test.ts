import type { FastifyInstance } from "fastify";

describe("Context API contract", () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    process.env.API_STORE_MODE = "in_memory";
    process.env.AUTH_ENABLED = "0";

    const { buildApp } = await import("../app.js");
    app = await buildApp();
  });

  afterAll(async () => {
    if (app) {
      await app.close();
    }
  });

  it("creates, lists, searches and deletes project context notes", async () => {
    const listBefore = await app.inject({
      method: "GET",
      url: "/context?projectId=proj_001"
    });
    expect(listBefore.statusCode).toBe(200);

    const created = await app.inject({
      method: "POST",
      url: "/context",
      payload: {
        projectId: "proj_001",
        path: "/projects/proj_001/context/strategy.md",
        title: "Strategy",
        content: "# Strategy\n\nUse structured notes for product direction.",
        tags: ["strategy", "direction"],
        linkRefs: ["/projects/proj_001/context/overview.md"],
        pinned: true
      }
    });
    expect(created.statusCode).toBe(200);
    const createdBody = created.json() as { item: { id: string; path: string; title: string } };
    expect(createdBody.item.path).toBe("/projects/proj_001/context/strategy.md");

    const detail = await app.inject({
      method: "GET",
      url: `/context/${createdBody.item.id}?projectId=proj_001`
    });
    expect(detail.statusCode).toBe(200);

    const search = await app.inject({
      method: "GET",
      url: "/context?projectId=proj_001&q=structured%20notes"
    });
    expect(search.statusCode).toBe(200);
    const searchBody = search.json() as { items: Array<{ id: string }>; hits?: Array<{ score: number }> };
    expect(searchBody.items.length).toBeGreaterThan(0);
    expect(Array.isArray(searchBody.hits)).toBe(true);

    const updated = await app.inject({
      method: "PATCH",
      url: `/context/${createdBody.item.id}?projectId=proj_001`,
      payload: {
        content: "# Strategy\n\nUpdate the project note workflow."
      }
    });
    expect(updated.statusCode).toBe(200);
    const updatedBody = updated.json() as { item: { content: string } };
    expect(updatedBody.item.content).toContain("workflow");

    const removed = await app.inject({
      method: "DELETE",
      url: `/context/${createdBody.item.id}?projectId=proj_001`
    });
    expect(removed.statusCode).toBe(200);
  });
});
