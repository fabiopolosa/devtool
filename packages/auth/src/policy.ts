import type { Role } from "@cp/domain";

export interface RoleTemplate {
  name: Role["name"];
  description: string;
  permissions: string[];
  isSystem: boolean;
}

export const roleTemplates: RoleTemplate[] = [
  {
    name: "admin",
    description: "Full control over control-plane settings, users, providers, and approvals.",
    permissions: ["*"],
    isSystem: true
  },
  {
    name: "editor",
    description: "Can edit projects, roadmap, tasks, and chat but cannot manage identities/providers.",
    permissions: [
      "project.read",
      "project.write",
      "repository.read",
      "roadmap.read",
      "roadmap.write",
      "task.read",
      "task.write",
      "approval.read",
      "memory.read",
      "memory.write",
      "experiment.read",
      "chat.read",
      "chat.write"
    ],
    isSystem: true
  },
  {
    name: "operator",
    description: "Can operate projects/tasks/runs and approval workflows, but cannot manage identities.",
    permissions: [
      "project.read",
      "project.write",
      "repository.read",
      "repository.write",
      "roadmap.read",
      "roadmap.write",
      "roadmap.approve",
      "task.read",
      "task.write",
      "run.execute",
      "run.cancel",
      "approval.read",
      "approval.decide",
      "memory.read",
      "memory.write",
      "provider.read",
      "experiment.read",
      "experiment.write",
      "chat.read",
      "chat.write"
    ],
    isSystem: true
  },
  {
    name: "viewer",
    description: "Read-only access to inspect execution, memory, logs, and experiments.",
    permissions: [
      "project.read",
      "repository.read",
      "roadmap.read",
      "task.read",
      "approval.read",
      "memory.read",
      "provider.read",
      "experiment.read",
      "chat.read"
    ],
    isSystem: true
  }
];

export const hasPermission = (permissions: string[], permission: string): boolean =>
  permissions.includes("*") || permissions.includes(permission);
