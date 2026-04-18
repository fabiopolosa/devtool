import { describe, expect, it } from "vitest";
import { toBullMqSafeJobId, toBullMqSafeQueueName } from "../queue.js";

describe("BullMQ queue key safety", () => {
  it("sanitizes queue names that include colon separators", () => {
    const queueName = toBullMqSafeQueueName("dag-job-execution:tenant:default");

    expect(queueName).not.toContain(":");
    expect(queueName).toBe("ZGFnLWpvYi1leGVjdXRpb24__dGVuYW50__ZGVmYXVsdA");
  });

  it("sanitizes composite custom job ids", () => {
    const jobId = toBullMqSafeJobId({
      tenantId: "tenant:default",
      jobId: "job:123"
    });

    expect(jobId).not.toContain(":");
    expect(jobId).toBe("dGVuYW50OmRlZmF1bHQ__am9iOjEyMw");
  });
});
