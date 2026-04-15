import Fastify from "fastify";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const getSchemaObservabilitySnapshot = vi.fn();

vi.mock("../services/schema-observability-service.js", () => ({
  getSchemaObservabilitySnapshot
}));

describe("Schema observability API contract", () => {
  beforeEach(() => {
    getSchemaObservabilitySnapshot.mockReset();
    getSchemaObservabilitySnapshot.mockResolvedValue({
      projectId: "proj-control-plane",
      projectName: "Control Plane",
      generatedAt: "2026-04-15T10:00:00.000Z",
      sections: [
        {
          id: "data-model",
          title: "ER Diagram",
          subtitle: "Tables, columns and keys extracted from schema docs.",
          nodes: [],
          edges: []
        }
      ]
    });
  });

  afterEach(async () => {
    vi.unstubAllGlobals();
  });

  it("returns a canonical snapshot for project scoped schema observability", async () => {
    const { schemaObservabilityRoutes } = await import("../routes/schema-observability.js");
    const app = Fastify({ logger: false });

    app.addHook("onRequest", async (request) => {
      const current = request as typeof request & {
        tenantId: string;
        tenantPermissions: Record<string, boolean>;
      };
      current.tenantId = "tenant_default";
      current.tenantPermissions = {
        canView: true,
        canEdit: true,
        canRunAgent: true,
        canManageUsers: true,
        canApprove: true
      };
    });

    await app.register(schemaObservabilityRoutes);

    const response = await app.inject({
      method: "GET",
      url: "/schema-observability?projectId=proj-control-plane"
    });

    expect(response.statusCode).toBe(200);
    const body = response.json() as {
      item?: { projectId?: string; sections?: Array<{ id: string }> };
    };
    expect(body.item?.projectId).toBe("proj-control-plane");
    expect(body.item?.sections).toHaveLength(1);
    expect(getSchemaObservabilitySnapshot).toHaveBeenCalledWith({
      tenantId: "tenant_default",
      projectId: "proj-control-plane"
    });

    await app.close();
  });
});
