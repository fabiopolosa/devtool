import type { FastifyPluginAsync, FastifyRequest } from "fastify";
import type { SecretConfig, SecretScope } from "@cp/domain";
import { requireRole } from "../auth/runtime.js";
import { secretsService } from "../services/secrets-service.js";

interface CreateSecretBody {
  name: string;
  description: string;
  value: string;
  scope: SecretScope;
}

interface UpdateSecretBody {
  name?: string;
  description?: string;
  value?: string;
  scope?: SecretScope;
}

const actorFromRequest = (request: FastifyRequest): string =>
  request.authPrincipal?.userId ?? "system";

export const secretsRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.get<{ Querystring: { scope?: SecretScope; reveal?: "1" | "0" } }>(
    "/secrets",
    {
      schema: {
        tags: ["secrets"],
        summary: "List secret definitions (encrypted values are redacted by default)"
      }
    },
    async (request, reply) => {
      const principal = requireRole(request, reply, "admin");
      if (!principal) return;

      const items = await secretsService.listSecrets(
        request.query.scope ? { scope: request.query.scope } : undefined
      );
      if (request.query.reveal === "1") {
        return { items };
      }
      return { items: items.map((item: SecretConfig) => secretsService.redact(item)) };
    }
  );

  fastify.get<{ Params: { secretId: string } }>(
    "/secrets/:secretId",
    {
      schema: { tags: ["secrets"], summary: "Get a single secret record" }
    },
    async (request, reply) => {
      const principal = requireRole(request, reply, "admin");
      if (!principal) return;
      const item = await secretsService.getSecret(request.params.secretId);
      if (!item) {
        return reply.code(404).send({ error: "not_found", message: "Secret not found" });
      }
      return { item: secretsService.redact(item) };
    }
  );

  fastify.get<{ Params: { secretId: string } }>(
    "/secrets/:secretId/reveal",
    {
      schema: { tags: ["secrets"], summary: "Resolve decrypted secret value" }
    },
    async (request, reply) => {
      const principal = requireRole(request, reply, "admin");
      if (!principal) return;
      const item = await secretsService.getSecret(request.params.secretId);
      if (!item) {
        return reply.code(404).send({ error: "not_found", message: "Secret not found" });
      }
      const value = await secretsService.resolveSecretValueById(item.id);
      return {
        item: secretsService.redact(item),
        value
      };
    }
  );

  fastify.post<{ Body: CreateSecretBody }>(
    "/secrets",
    {
      schema: { tags: ["secrets"], summary: "Create and encrypt a secret" }
    },
    async (request, reply) => {
      const principal = requireRole(request, reply, "admin");
      if (!principal) return;
      if (!request.body?.name || !request.body?.description || !request.body?.value || !request.body?.scope) {
        return reply.code(400).send({ error: "invalid_request", message: "name, description, value, scope are required" });
      }
      const item = await secretsService.createSecret(request.body, actorFromRequest(request));
      return { item: secretsService.redact(item) };
    }
  );

  fastify.put<{ Params: { secretId: string }; Body: UpdateSecretBody }>(
    "/secrets/:secretId",
    {
      schema: { tags: ["secrets"], summary: "Update secret metadata and/or rotate value" }
    },
    async (request, reply) => {
      const principal = requireRole(request, reply, "admin");
      if (!principal) return;
      const item = await secretsService.updateSecret(
        request.params.secretId,
        request.body ?? {},
        actorFromRequest(request)
      );
      return { item: secretsService.redact(item) };
    }
  );

  fastify.delete<{ Params: { secretId: string } }>(
    "/secrets/:secretId",
    {
      schema: { tags: ["secrets"], summary: "Delete a secret" }
    },
    async (request, reply) => {
      const principal = requireRole(request, reply, "admin");
      if (!principal) return;
      await secretsService.deleteSecret(request.params.secretId);
      return { ok: true as const };
    }
  );
};
