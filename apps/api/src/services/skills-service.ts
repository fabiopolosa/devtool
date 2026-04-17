import type { Skill } from "@cp/domain";
import {
  DefaultSkillExecutor,
  ShellSkillInstaller,
  SkillsService,
  type SkillStore
} from "@cp/skills";
import { apiStore } from "./api-store.js";

class ApiSkillsStoreAdapter implements SkillStore {
  async listSkills(): Promise<Skill[]> {
    return apiStore.listSkills();
  }

  async getSkill(skillId: string): Promise<Skill | null> {
    return apiStore.getSkill(skillId);
  }

  async findSkillByNameAndRepository(name: string, repositoryUrl: string): Promise<Skill | null> {
    return apiStore.findSkillByNameAndRepository(name, repositoryUrl);
  }

  async saveSkill(skill: Skill): Promise<Skill> {
    const existing = await apiStore.getSkill(skill.id);
    if (existing) {
      return apiStore.updateSkill(skill.id, skill);
    }
    return apiStore.createSkill(skill);
  }

  async deleteSkill(skillId: string): Promise<void> {
    await apiStore.deleteSkill(skillId);
  }
}

const defaultMarketplace = "https://raw.githubusercontent.com/fabiopolosa/devtool/main/marketplace.json";

export const defaultMarketplaceUrl = process.env.SKILLS_MARKETPLACE_DEFAULT?.trim() || defaultMarketplace;

export const skillsService = new SkillsService({
  store: new ApiSkillsStoreAdapter(),
  installer: new ShellSkillInstaller(process.cwd()),
  executor: new DefaultSkillExecutor(process.cwd())
});
