import { describe, expect, it } from "vitest";
import type { ContextNote } from "@cp/domain";
import { ContextService, type ContextNoteStore } from "./service.js";

class InMemoryContextStore implements ContextNoteStore {
  private readonly rows = new Map<string, ContextNote>();

  async listContextNotes(filters?: { tenantId?: string; projectId?: string; path?: string }): Promise<ContextNote[]> {
    return [...this.rows.values()].filter((item) => {
      if (filters?.tenantId && item.tenantId !== filters.tenantId) return false;
      if (filters?.projectId && item.projectId !== filters.projectId) return false;
      if (filters?.path && item.path !== filters.path) return false;
      return true;
    });
  }

  async getContextNoteById(contextNoteId: string): Promise<ContextNote | null> {
    return this.rows.get(contextNoteId) ?? null;
  }

  async findContextNoteByProjectPath(
    tenantId: string,
    projectId: string,
    notePath: string
  ): Promise<ContextNote | null> {
    return (
      [...this.rows.values()].find(
        (item) => item.tenantId === tenantId && item.projectId === projectId && item.path === notePath
      ) ?? null
    );
  }

  async createContextNote(note: ContextNote): Promise<ContextNote> {
    this.rows.set(note.id, note);
    return note;
  }

  async updateContextNote(contextNoteId: string, patch: Partial<ContextNote>): Promise<ContextNote> {
    const existing = this.rows.get(contextNoteId);
    if (!existing) throw new Error("not found");
    const next = { ...existing, ...patch };
    this.rows.set(contextNoteId, next);
    return next;
  }

  async deleteContextNote(contextNoteId: string): Promise<void> {
    this.rows.delete(contextNoteId);
  }
}

describe("ContextService", () => {
  const store = new InMemoryContextStore();
  const service = new ContextService({
    store,
    now: () => new Date("2026-04-15T00:00:00.000Z"),
    idGenerator: () => "ctx_001"
  });

  it("creates, searches and scopes notes", async () => {
    await service.createContextNote(
      {
        tenantId: "tenant_default",
        projectId: "proj_001",
        path: "/projects/proj_001/context/strategy.md",
        title: "Strategy",
        content: "# Strategy\n\nFocus on launcher, operations, and context.",
        tags: ["strategy", "planning"],
        linkRefs: ["./system-overview"]
      },
      "tester"
    );

    const hits = await service.searchContextNotes({
      tenantId: "tenant_default",
      projectId: "proj_001",
      query: "launcher operations"
    });
    expect(hits.length).toBeGreaterThan(0);
    expect(hits[0]?.item.title).toBe("Strategy");

    const scoped = await service.listOrSearch({
      tenantId: "tenant_default",
      projectId: "proj_001"
    });
    expect(scoped.items).toHaveLength(1);
  });

  it("updates and deletes notes safely", async () => {
    const created = await service.createContextNote(
      {
        tenantId: "tenant_default",
        projectId: "proj_001",
        path: "/projects/proj_001/context/decisions.md",
        title: "Decisions",
        content: "Initial"
      },
      "tester"
    );

    const updated = await service.updateContextNote(
      created.id,
      {
        content: "Updated decision log",
        tags: ["decisions"]
      },
      "tester",
      "tenant_default",
      "proj_001"
    );
    expect(updated.content).toContain("Updated");
    expect(updated.tags).toContain("decisions");

    await service.deleteContextNote(created.id, "tenant_default", "proj_001");
    const afterDelete = await service.getContextNote(created.id, "tenant_default", "proj_001");
    expect(afterDelete).toBeNull();
  });
});
