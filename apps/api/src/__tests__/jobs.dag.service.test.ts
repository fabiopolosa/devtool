import { validateDAG } from "../services/jobs-service.js";

describe("jobs DAG validation", () => {
  it("accepts an acyclic graph", () => {
    const result = validateDAG([
      { id: "a", dependencies: [] },
      { id: "b", dependencies: ["a"] },
      { id: "c", dependencies: ["a", "b"] }
    ]);

    expect(result.valid).toBe(true);
    expect(result.cycles).toHaveLength(0);
  });

  it("detects dependency cycles", () => {
    const result = validateDAG([
      { id: "a", dependencies: ["c"] },
      { id: "b", dependencies: ["a"] },
      { id: "c", dependencies: ["b"] }
    ]);

    expect(result.valid).toBe(false);
    expect(result.cycles.length).toBeGreaterThan(0);
  });
});
