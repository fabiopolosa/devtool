import { z } from "zod";

export const repositoryConfigSchema = z.object({
  repositoryId: z.string().min(1),
  projectId: z.string().min(1),
  displayName: z.string().min(1),
  localPath: z.string().min(1),
  defaultBranch: z.string().min(1),
  codingStandardsRefs: z.array(z.string().min(1)).default([]),
  allowedWritePaths: z.array(z.string().min(1)).default([]),
  blockedWritePaths: z.array(z.string().min(1)).default([]),
  verificationCommands: z.array(
    z.object({
      stepType: z.enum(["lint", "test", "build", "smoke", "visual", "performance"]),
      command: z.string().min(1)
    })
  ),
  contextFiles: z.array(z.string().min(1)).default([])
});

export type RepositoryConfig = z.infer<typeof repositoryConfigSchema>;
