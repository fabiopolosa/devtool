import type { FastifyPluginAsync } from "fastify";
import { apiStore } from "../services/api-store.js";

export const approvalsRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.get("/approvals", { schema: { tags: ["approvals"], summary: "List approvals" } }, async () => ({ items: await apiStore.listApprovals() }));
};
