import type { Skill } from "@cp/domain";
import {
  GithubRepositoryMarketplaceAdapter,
  SkillsService,
  type MarketplaceAdapter,
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
}

class StubInstaller implements SkillInstaller {
  constructor(private readonly shouldFail = false) {}

  async install(): Promise<void> {
    if (this.shouldFail) {
      throw new Error("installer failed");
    }
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

  it("installs a skill and marks it as installed", async () => {
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
      instructions: "Generate changelog from merged PRs."
    });

    expect(result.installed).toBe(true);
    expect(result.item.installed).toBe(true);
    expect(result.error).toBeUndefined();
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
      repositoryUrl: "https://github.com/acme/skills-failing"
    });

    expect(result.installed).toBe(false);
    expect(result.item.installed).toBe(false);
    expect(result.error).toContain("installer failed");
  });

  it("supports github repository adapter manifest resolution", () => {
    const adapter: MarketplaceAdapter = new GithubRepositoryMarketplaceAdapter();
    expect(adapter.canHandle("https://github.com/acme/skills-marketplace")).toBe(true);
    expect(adapter.resolveManifestUrl("https://github.com/acme/skills-marketplace")).toBe(
      "https://raw.githubusercontent.com/acme/skills-marketplace/main/marketplace.json"
    );
  });
});
