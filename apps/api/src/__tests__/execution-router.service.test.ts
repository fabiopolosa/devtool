import { describe, expect, it } from "vitest";
import { resolveExecutionRoute } from "../services/execution-router-service.js";

describe("execution router service", () => {
  it("uses payload mode and adapter when provided", async () => {
    const resolved = await resolveExecutionRoute({
      tenantId: "tenant_default",
      type: "system",
      title: "Local workflow",
      payload: {
        execution: {
          mode: "local",
          adapter: "shell",
          requiredCapabilities: ["shell"]
        }
      }
    });

    expect(resolved.mode).toBe("local");
    expect(resolved.dispatchTarget).toBe("local_worker");
    expect(resolved.adapter).toBe("shell");
    expect(resolved.requiredCapabilities).toEqual(["shell"]);
    expect(resolved.source).toBe("payload");
  });

  it("falls back to remote system defaults deterministically", async () => {
    const resolved = await resolveExecutionRoute({
      tenantId: "tenant_default",
      type: "generation",
      title: "Default route",
      payload: {}
    });

    expect(resolved.mode).toBe("remote");
    expect(resolved.dispatchTarget).toBe("remote_worker");
    expect(resolved.adapter).toBe("internal_runner");
    expect(resolved.source).toBe("system");
  });
});
