import type { Skill } from "@cp/domain";
import {
  DefaultSkillExecutor,
  GithubRepositoryMarketplaceAdapter,
  SkillsService,
  type MarketplaceAdapter,
  type SkillExecutionResult,
  type SkillExecutor,
  type SkillInstaller,
  type SkillStore
} from "./service.js";

class InMemorySkillStore implements SkillStore {
  private readonly rows = new Map<string, Skill>();

  constructor(initial: Skill[] = []) {
    for (const skill of initial) {
      this.rows.set(skill.id, skill);
    }
  }

  async listSkills(): Promise<Skill[]> {
    return [...this.rows.values()];
  }

  async getSkill(skillId: string): Promise<Skill | null> {
    return this.rows.get(skillId) ?? null;
  }

  async findSkillByNameAndRepository(name: string, repositoryUrl: string): Promise<Skill | null> {
    const normalizedName = name.trim().toLowerCase();
    return (
      [...this.rows.values()].find(
        (skill) =>
          skill.name.trim().toLowerCase() === normalizedName &&
          skill.repositoryUrl.trim() === repositoryUrl.trim()
      ) ?? null
    );
  }

  async saveSkill(skill: Skill): Promise<Skill> {
    this.rows.set(skill.id, skill);
    return skill;
  }

  async deleteSkill(skillId: string): Promise<void> {
    this.rows.delete(skillId);
  }
}

class StubInstaller implements SkillInstaller {
  constructor(private readonly shouldFail = false) {}

  async install(): Promise<void> {
    if (this.shouldFail) {
      throw new Error("installer failed");
    }
  }
}

class StubExecutor implements SkillExecutor {
  constructor(private readonly result: SkillExecutionResult) {}

  async execute(): Promise<SkillExecutionResult> {
    return this.result;
  }
}

describe("@cp/skills SkillsService", () => {
  it("fetches marketplace and preserves installed state for existing skills", async () => {
    const existing: Skill = {
      id: "skill_existing",
      name: "checks",
      description: "old",
      repositoryUrl: "https://github.com/acme/skills-checks",
      version: "0.1.0",
      installed: true,
      categories: ["quality"],
      instructions: "old instructions",
      createdAt: "2026-01-01T00:00:00.000Z",
      createdBy: "test",
      updatedAt: "2026-01-01T00:00:00.000Z",
      updatedBy: "test"
    };
    const store = new InMemorySkillStore([existing]);

    const service = new SkillsService({
      store,
      fetchImpl: async () =>
        ({
          ok: true,
          json: async () => ({
            skills: [
              {
                name: "checks",
                description: "new description",
                repositoryUrl: "https://github.com/acme/skills-checks",
                version: "1.2.0",
                categories: ["quality", "verification"],
                instructions: "Run checks before final output."
              }
            ]
          })
        }) as Response
    });

    const rows = await service.fetchMarketplace("https://example.com/marketplace.json");
    expect(rows).toHaveLength(1);
    expect(rows[0]?.installed).toBe(true);
    expect(rows[0]?.version).toBe("1.2.0");
    expect(rows[0]?.description).toBe("new description");
  });

  it("installs a github skill and marks it as installed with validation", async () => {
    const store = new InMemorySkillStore();
    const service = new SkillsService({
      store,
      installer: new StubInstaller(false),
      now: () => new Date("2026-04-14T12:00:00.000Z"),
      idGenerator: () => "skill_new"
    });

    const result = await service.installSkill({
      name: "release-notes",
      repositoryUrl: "https://github.com/acme/skills-release-notes",
      description: "Release notes helper",
      instructions: "Generate changelog from merged pull requests and grouped scope sections."
    });

    expect(result.installed).toBe(true);
    expect(result.item.installed).toBe(true);
    expect(result.validation.status).toBe("valid");
    expect(result.error).toBeUndefined();
  });

  it("rejects invalid zip payload during install", async () => {
    const store = new InMemorySkillStore();
    const service = new SkillsService({
      store,
      installer: new StubInstaller(false),
      idGenerator: () => "skill_zip"
    });

    const result = await service.installSkill({
      name: "zip-tool",
      repositoryUrl: "upload://zip/zip-tool.zip",
      sourceType: "zip",
      sourcePayloadBase64: Buffer.from("not-a-zip").toString("base64"),
      instructions: "Execute zip tool logic"
    });

    expect(result.installed).toBe(false);
    expect(result.validation.status).toBe("invalid");
    expect(result.error).toContain("validation failed");
  });

  it("supports validate + update + rollback version lifecycle", async () => {
    const store = new InMemorySkillStore();
    const service = new SkillsService({
      store,
      installer: new StubInstaller(false),
      idGenerator: () => "skill_versions",
      now: () => new Date("2026-04-15T10:00:00.000Z")
    });

    const installed = await service.installSkill({
      name: "planner",
      repositoryUrl: "https://github.com/acme/skills-planner",
      instructions: "Plan coding workflow with explicit phases and checkpoints."
    });

    const validated = await service.validateSkill(installed.item.id, "tester");
    expect(validated.validation.status).toBe("valid");

    const updated = await service.updateSkillVersion({
      skillId: installed.item.id,
      version: "2.0.0",
      actor: "tester"
    });
    expect(updated.currentVersion).toBe("2.0.0");

    const rolledBack = await service.rollbackSkillVersion({
      skillId: installed.item.id,
      actor: "tester"
    });
    expect(rolledBack.currentVersion).toBe("0.0.0");
    expect((rolledBack.versionHistory ?? []).length).toBeGreaterThan(1);
  });

  it("supports enable/disable/uninstall lifecycle", async () => {
    const store = new InMemorySkillStore();
    const service = new SkillsService({
      store,
      installer: new StubInstaller(false),
      idGenerator: () => "skill_lifecycle"
    });

    const installed = await service.installSkill({
      name: "lifecycle",
      repositoryUrl: "https://github.com/acme/skills-lifecycle",
      instructions: "Lifecycle test skill for enable disable uninstall transitions."
    });

    const disabled = await service.setSkillEnabled({
      skillId: installed.item.id,
      enabled: false,
      actor: "tester"
    });
    expect(disabled.installed).toBe(false);

    const enabled = await service.setSkillEnabled({
      skillId: installed.item.id,
      enabled: true,
      actor: "tester"
    });
    expect(enabled.installed).toBe(true);

    await service.uninstallSkill({
      skillId: installed.item.id,
      actor: "tester",
      hardDelete: true
    });

    const deleted = await service.getSkill(installed.item.id);
    expect(deleted).toBeNull();
  });

  it("executes skill using configured executor and persists metadata", async () => {
    const store = new InMemorySkillStore();
    const service = new SkillsService({
      store,
      installer: new StubInstaller(false),
      executor: new StubExecutor({
        success: true,
        skillId: "skill_exec",
        logs: ["ok"],
        output: { message: "done" }
      }),
      idGenerator: () => "skill_exec"
    });

    const installed = await service.installSkill({
      name: "executor",
      repositoryUrl: "https://github.com/acme/skills-executor",
      instructions: "Run executor skill with deterministic output for verification checks."
    });

    const result = await service.executeSkill({
      skillId: installed.item.id,
      actor: "tester"
    });

    expect(result.success).toBe(true);
    const reloaded = await service.getSkill(installed.item.id);
    expect(reloaded?.metadata).toBeDefined();
  });

  it("supports github repository adapter manifest resolution", () => {
    const adapter: MarketplaceAdapter = new GithubRepositoryMarketplaceAdapter();
    expect(adapter.canHandle("https://github.com/acme/skills-marketplace")).toBe(true);
    expect(adapter.resolveManifestUrl("https://github.com/acme/skills-marketplace")).toBe(
      "https://raw.githubusercontent.com/acme/skills-marketplace/main/marketplace.json"
    );
  });

  it("default executor runs declarative mode when no command configured", async () => {
    const executor = new DefaultSkillExecutor();
    const result = await executor.execute({
      actor: "tester",
      skill: {
        id: "skill_decl",
        name: "declarative",
        description: "declarative",
        repositoryUrl: "https://example.com",
        version: "1.0.0",
        installed: true,
        categories: [],
        instructions: "Explain what to do",
        createdAt: "2026-01-01T00:00:00.000Z",
        createdBy: "tester",
        updatedAt: "2026-01-01T00:00:00.000Z",
        updatedBy: "tester"
      }
    });
    expect(result.success).toBe(true);
    expect(result.logs.some((line) => line.includes("declarative"))).toBe(true);
  });

  it("returns a non-blocking warning when install command fails", async () => {
    const store = new InMemorySkillStore();
    const service = new SkillsService({
      store,
      installer: new StubInstaller(true),
      idGenerator: () => "skill_failed"
    });

    const result = await service.installSkill({
      name: "failing-skill",
      repositoryUrl: "https://github.com/acme/skills-failing",
      instructions: "Failing install skill with enough instructions for validation"
    });

    expect(result.installed).toBe(false);
    expect(result.item.installed).toBe(false);
    expect(result.error).toContain("installer failed");
  });

  it("blocks dangerous shell commands even when explicitly allowlisted", async () => {
    const store = new InMemorySkillStore();
    const service = new SkillsService({
      store,
      installer: new StubInstaller(false),
      idGenerator: () => "skill_unsafe_shell"
    });

    const installed = await service.installSkill({
      name: "unsafe-shell",
      repositoryUrl: "upload://file/unsafe-shell.skill.md",
      sourceType: "file",
      sourcePayloadBase64: Buffer.from("skill: unsafe shell").toString("base64"),
      instructions: "Attempt to execute shell command with restricted profile for safety testing.",
      executionConfig: {
        commandAllowlist: ["bash"],
        entryCommand: "bash",
        entryArgs: ["-lc", "echo hacked"],
        requireConfirmation: false
      },
      sandboxProfile: {
        filesystem: "workspace_only",
        network: false,
        process: true
      }
    });

    const result = await service.executeSkill({
      skillId: installed.item.id,
      actor: "tester"
    });

    expect(result.success).toBe(false);
    expect(result.error).toContain("blocked for security reasons");
  });

  it("rejects non-serializable executor output", async () => {
    const store = new InMemorySkillStore();
    const service = new SkillsService({
      store,
      installer: new StubInstaller(false),
      executor: new StubExecutor({
        success: true,
        skillId: "skill_invalid_output",
        logs: ["ok"],
        output: (() => "not serializable") as unknown
      }),
      idGenerator: () => "skill_invalid_output"
    });

    const installed = await service.installSkill({
      name: "invalid-output",
      repositoryUrl: "https://github.com/acme/skills-invalid-output",
      instructions: "Return deterministic payload for contract validation."
    });

    await expect(
      service.executeSkill({
        skillId: installed.item.id,
        actor: "tester"
      })
    ).rejects.toThrow("JSON-serializable");
  });

  it("enforces user scope isolation by actor identity", async () => {
    const store = new InMemorySkillStore();
    const service = new SkillsService({
      store,
      installer: new StubInstaller(false),
      idGenerator: () => "skill_user_scope"
    });

    const installed = await service.installSkill({
      name: "personal-skill",
      repositoryUrl: "https://github.com/acme/skills-personal",
      instructions: "Execute personal helper logic with deterministic output and strict contract.",
      scope: "user",
      actor: "user_alice"
    });

    await expect(
      service.executeSkill({
        skillId: installed.item.id,
        actor: "user_bob"
      })
    ).rejects.toThrow("cannot access user scoped skill");
  });

  it("blocks execution when the tenant does not match the stored skill tenant", async () => {
    const store = new InMemorySkillStore();
    const service = new SkillsService({
      store,
      installer: new StubInstaller(false),
      idGenerator: () => "skill_tenant_isolation"
    });

    const installed = await service.installSkill({
      name: "tenant-isolated-skill",
      repositoryUrl: "upload://file/tenant-isolated-skill.skill.md",
      sourceType: "file",
      sourcePayloadBase64: Buffer.from("skill: tenant isolation").toString("base64"),
      instructions: "Tenant isolated skill for execution policy validation.",
      tenantId: "tenant_default"
    });

    expect((installed.item as Skill & { tenantId?: string }).tenantId).toBe("tenant_default");

    await expect(
      service.executeSkill({
        skillId: installed.item.id,
        actor: "tester",
        tenantId: "tenant_other"
      })
    ).rejects.toThrow("cannot access");
  });

  it("blocks network-target arguments when sandbox network is disabled", async () => {
    const store = new InMemorySkillStore();
    const service = new SkillsService({
      store,
      installer: new StubInstaller(false),
      idGenerator: () => "skill_network_blocked"
    });

    const installed = await service.installSkill({
      name: "network-blocked",
      repositoryUrl: "upload://file/network-blocked.skill.md",
      sourceType: "file",
      sourcePayloadBase64: Buffer.from("skill: network blocked").toString("base64"),
      instructions: "Attempt outbound network operation with deterministic arguments.",
      executionConfig: {
        commandAllowlist: ["echo"],
        entryCommand: "echo",
        entryArgs: ["https://example.com"],
        requireConfirmation: false
      },
      sandboxProfile: {
        filesystem: "workspace_only",
        network: false,
        process: true
      }
    });

    const result = await service.executeSkill({
      skillId: installed.item.id,
      actor: "tester"
    });
    expect(result.success).toBe(false);
    expect(result.error).toContain("Network access is disabled");
  });

  it("enforces sandbox network allowlist", async () => {
    const store = new InMemorySkillStore();
    const service = new SkillsService({
      store,
      installer: new StubInstaller(false),
      idGenerator: () => "skill_network_allowlist"
    });

    const installed = await service.installSkill({
      name: "network-allowlist",
      repositoryUrl: "upload://file/network-allowlist.skill.md",
      sourceType: "file",
      sourcePayloadBase64: Buffer.from("skill: network allowlist").toString("base64"),
      instructions: "Restrict outbound network requests to approved domains only.",
      executionConfig: {
        commandAllowlist: ["echo"],
        entryCommand: "echo",
        entryArgs: ["https://forbidden.example.net/resource"],
        requireConfirmation: false
      },
      sandboxProfile: {
        filesystem: "workspace_only",
        network: true,
        networkAllowlist: ["api.example.com"],
        process: true
      }
    });

    const result = await service.executeSkill({
      skillId: installed.item.id,
      actor: "tester"
    });
    expect(result.success).toBe(false);
    expect(result.error).toContain("not allowed by sandbox policy");
  });

  it("force-kills skills that exceed timeout", async () => {
    const store = new InMemorySkillStore();
    const service = new SkillsService({
      store,
      installer: new StubInstaller(false),
      idGenerator: () => "skill_timeout_guard"
    });

    const installed = await service.installSkill({
      name: "timeout-guard",
      repositoryUrl: "upload://file/timeout-guard.skill.md",
      sourceType: "file",
      sourcePayloadBase64: Buffer.from("skill: timeout guard").toString("base64"),
      instructions: "Run a long command to validate timeout-based force kill behavior.",
      executionConfig: {
        commandAllowlist: ["sleep"],
        entryCommand: "sleep",
        entryArgs: ["2"],
        requireConfirmation: false,
        timeoutMs: 1_000
      },
      sandboxProfile: {
        filesystem: "workspace_only",
        network: false,
        process: true
      }
    });

    const result = await service.executeSkill({
      skillId: installed.item.id,
      actor: "tester"
    });
    expect(result.success).toBe(false);
    expect(result.error).toContain("timed out");
  });
});
