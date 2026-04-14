import type { Skill } from "@cp/domain";
import { ShellSkillInstaller, SkillsService, type SkillStore } from "@cp/skills";
import { apiStore } from "./api-store.js";

class ApiSkillsStoreAdapter implements SkillStore {
  async listSkills(): Promise<Skill[]> {
    return apiStore.listSkills();
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
}

const defaultMarketplace = "https://raw.githubusercontent.com/fabiopolosa/devtool/main/marketplace.json";

export const defaultMarketplaceUrl = process.env.SKILLS_MARKETPLACE_DEFAULT?.trim() || defaultMarketplace;

export const skillsService = new SkillsService({
  store: new ApiSkillsStoreAdapter(),
  installer: new ShellSkillInstaller(process.cwd())
});
