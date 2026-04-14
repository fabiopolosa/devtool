import type { LocalRepository } from "@cp/domain";
import {
  BullmqLocalRepoJobScheduler,
  InMemoryLocalRepoJobScheduler,
  LocalRepositoriesService,
  type LocalRepositoryStore
} from "@cp/local-repos";
import { apiStore } from "./api-store.js";

class ApiLocalRepositoryStoreAdapter implements LocalRepositoryStore {
  async listLocalRepositories(): Promise<LocalRepository[]> {
    return apiStore.listLocalRepositories();
  }

  async getLocalRepositoryById(localRepositoryId: string): Promise<LocalRepository | null> {
    return apiStore.getLocalRepository(localRepositoryId);
  }

  async createLocalRepository(localRepository: LocalRepository): Promise<LocalRepository> {
    return apiStore.createLocalRepository(localRepository);
  }

  async updateLocalRepository(
    localRepositoryId: string,
    patch: Partial<LocalRepository>
  ): Promise<LocalRepository> {
    return apiStore.updateLocalRepository(localRepositoryId, patch);
  }

  async deleteLocalRepository(localRepositoryId: string): Promise<void> {
    await apiStore.deleteLocalRepository(localRepositoryId);
  }
}

const createScheduler = () => {
  const redisUrl = process.env.REDIS_URL?.trim();
  if (!redisUrl) {
    return new InMemoryLocalRepoJobScheduler();
  }
  return new BullmqLocalRepoJobScheduler(redisUrl);
};

export const localRepositoriesService = new LocalRepositoriesService({
  store: new ApiLocalRepositoryStoreAdapter(),
  scheduler: createScheduler()
});
