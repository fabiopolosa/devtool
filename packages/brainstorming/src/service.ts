import { randomUUID } from "node:crypto";
import type {
  BrainstormPlan,
  BrainstormQuestion,
  BrainstormRoadmapTask,
  Subprompt
} from "@cp/domain";
import { PromptBuilderService } from "@cp/prompt-builder";

export interface BrainstormComposeInput {
  projectIntent: string;
  selectedSubpromptIds: string[];
  guidedAnswers?: Record<string, string>;
  actor?: string;
}

export interface BrainstormPlanDraft {
  title: string;
  executiveSummary: string;
  plan: BrainstormPlan["plan"];
}

export interface BrainstormSubpromptCatalog {
  list(filters?: { category?: Subprompt["category"]; enabled?: boolean; tag?: string }): Promise<Subprompt[]>;
  get(id: string): Promise<Subprompt | null>;
}

export interface BrainstormingServiceOptions {
  subpromptCatalog: BrainstormSubpromptCatalog;
  rolesDir?: string;
  now?: () => Date;
  idGenerator?: () => string;
}

const normalize = (value: string): string => value.trim().toLowerCase();

const toRepoTaskId = (title: string): string =>
  title
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 48) || "task";

const inferStack = (
  selected: Subprompt[],
  intent: string
): BrainstormPlan["plan"]["recommendedStack"] => {
  const corpus = `${intent} ${selected.map((item) => `${item.title} ${item.prompt} ${item.tags.join(" ")}`).join(" ")}`.toLowerCase();

  if (corpus.includes("supabase")) {
    return {
      database: "Supabase PostgreSQL",
      backend: "Node.js + Fastify",
      frontend: "React + TypeScript",
      llmProviders: ["openai", "gemini"],
      vectorStore: "pgvector"
    };
  }

  return {
    database: "PostgreSQL",
    backend: "Node.js + Fastify + Zod",
    frontend: "React + TypeScript + Tailwind",
    llmProviders: ["openai", "anthropic", "gemini"],
    vectorStore: "pgvector"
  };
};

const inferArchitecture = (
  selected: Subprompt[],
  intent: string
): BrainstormPlan["plan"]["architecture"] => {
  const corpus = `${intent} ${selected.map((item) => item.prompt).join(" ")}`.toLowerCase();
  if (corpus.includes("microrepo") || corpus.includes("micro-repo") || corpus.includes("polyrepo")) {
    return {
      repositoryStrategy: "microrepo",
      packageLayout: ["control-plane-core", "dashboard-ui", "workers"],
      rationale: "Split repositories for independent release cadence and stricter change boundaries."
    };
  }

  if (corpus.includes("hybrid")) {
    return {
      repositoryStrategy: "hybrid",
      packageLayout: ["apps/api", "apps/web", "apps/worker", "packages/*", "external-adapters/*"],
      rationale: "Keep control-plane core in monorepo and isolate high-volatility adapters."
    };
  }

  return {
    repositoryStrategy: "monorepo",
    packageLayout: ["apps/api", "apps/web", "apps/worker", "packages/*", "configs/*"],
    rationale: "Single source-of-truth for contracts, migrations, and agent workflows."
  };
};

const inferSuggestedSkills = (
  selected: Subprompt[],
  intent: string
): BrainstormPlan["plan"]["suggestedSkills"] => {
  const corpus = `${intent} ${selected.map((entry) => `${entry.prompt} ${entry.tags.join(" ")}`).join(" ")}`.toLowerCase();
  const skills: BrainstormPlan["plan"]["suggestedSkills"] = [
    {
      name: "checks",
      repositoryUrl: "https://github.com/example/skills-checks",
      reason: "Enforce deterministic lint/test/build summaries."
    }
  ];
  if (corpus.includes("release")) {
    skills.push({
      name: "release-notes",
      repositoryUrl: "https://github.com/example/skills-release-notes",
      reason: "Automate changelog summaries during roadmap completion."
    });
  }
  return skills;
};

const defaultAgents = (): BrainstormPlan["plan"]["suggestedAgents"] => [
  {
    role: "planner",
    purpose: "Translate user intent into structured roadmap/task specs",
    capabilities: ["chat_reasoning"]
  },
  {
    role: "codex_builder",
    purpose: "Implement approved feature tasks",
    capabilities: ["coding"]
  },
  {
    role: "claude_debugger",
    purpose: "Handle verification failures with evidence-first fixes",
    capabilities: ["coding", "chat_reasoning"]
  }
];

const defaultBindings = (
  stack: BrainstormPlan["plan"]["recommendedStack"]
): BrainstormPlan["plan"]["providerBindings"] => [
  {
    capabilityClass: "chat_reasoning",
    primaryProvider: stack.llmProviders[0] ?? "openai",
    fallbackProviders: stack.llmProviders.slice(1),
    primaryModelHint: "latest-general"
  },
  {
    capabilityClass: "coding",
    primaryProvider: stack.llmProviders[0] ?? "openai",
    fallbackProviders: stack.llmProviders.slice(1),
    primaryModelHint: "latest-coding"
  },
  {
    capabilityClass: "embedding",
    primaryProvider: stack.llmProviders.includes("openai") ? "openai" : stack.llmProviders[0] ?? "openai",
    fallbackProviders: stack.llmProviders.filter((provider) => provider !== "openai")
  }
];

const roadmapFromIntent = (intent: string, selectedSkills: string[]): BrainstormRoadmapTask[] => {
  const normalizedIntent = normalize(intent);
  const base: BrainstormRoadmapTask[] = [
    {
      id: toRepoTaskId("Define contracts and migrations"),
      title: "Define contracts and migrations",
      description: "Freeze additive domain contracts and database migrations for planned modules.",
      dependencies: [],
      targetRepos: ["control-plane"],
      suggestedAgentRole: "planner",
      suggestedSkills: selectedSkills
    },
    {
      id: toRepoTaskId("Implement API and orchestration wiring"),
      title: "Implement API and orchestration wiring",
      description: "Add additive routes/services and connect workflows, verification and provider routing.",
      dependencies: [toRepoTaskId("Define contracts and migrations")],
      targetRepos: ["control-plane"],
      suggestedAgentRole: "codex_builder",
      suggestedSkills: selectedSkills
    },
    {
      id: toRepoTaskId("Build dashboard command surfaces"),
      title: "Build dashboard command surfaces",
      description: "Deliver inspectable UI panels for approvals, runtime, providers, and brainstorming.",
      dependencies: [toRepoTaskId("Implement API and orchestration wiring")],
      targetRepos: ["control-plane", "web"],
      suggestedAgentRole: "codex_builder",
      suggestedSkills: selectedSkills
    }
  ];

  if (normalizedIntent.includes("mcp")) {
    base.push({
      id: toRepoTaskId("Integrate MCP external runtimes"),
      title: "Integrate MCP external runtimes",
      description: "Add MCP connection health checks and delegation in runtime operations.",
      dependencies: [toRepoTaskId("Implement API and orchestration wiring")],
      targetRepos: ["control-plane"],
      suggestedAgentRole: "codex_builder",
      suggestedSkills: selectedSkills
    });
  }

  return base;
};

export class BrainstormingService {
  private readonly now: () => Date;
  private readonly idGenerator: () => string;
  private readonly subpromptCatalog: BrainstormSubpromptCatalog;
  private readonly promptBuilderService: PromptBuilderService;

  constructor(private readonly options: BrainstormingServiceOptions) {
    this.now = options.now ?? (() => new Date());
    this.idGenerator = options.idGenerator ?? (() => randomUUID());
    this.subpromptCatalog = options.subpromptCatalog;
    this.promptBuilderService = new PromptBuilderService({
      ...(options.rolesDir ? { rolesDir: options.rolesDir } : {})
    });
  }

  async listSubprompts(filters?: { category?: Subprompt["category"]; enabled?: boolean }): Promise<Subprompt[]> {
    return this.subpromptCatalog.list(filters);
  }

  async getSubprompt(id: string): Promise<Subprompt | null> {
    return this.subpromptCatalog.get(id);
  }

  defaultGuidedQuestions(intent: string): BrainstormQuestion[] {
    const normalizedIntent = normalize(intent);
    const questions: BrainstormQuestion[] = [
      {
        id: "scope",
        question: "Quali sono i confini del progetto (MVP vs enterprise) e cosa vuoi escludere?",
        rationale: "Riduce scope drift e definisce priorita'."
      },
      {
        id: "repos",
        question: "Quali repository vanno toccati subito e quali dopo?",
        rationale: "Definisce dipendenze cross-repo e ordine esecutivo."
      },
      {
        id: "gates",
        question: "Quali gate di verifica sono obbligatori prima del deploy?",
        rationale: "Rende deterministica la completion policy."
      }
    ];

    if (normalizedIntent.includes("team") || normalizedIntent.includes("stakeholder")) {
      questions.push({
        id: "roles",
        question: "Chi approva roadmap/task e chi puo' eseguire run autonomi?",
        rationale: "Imposta approvazioni e policy RBAC iniziali."
      });
    }

    if (normalizedIntent.includes("provider")) {
      questions.push({
        id: "providers",
        question: "Hai vincoli su provider/modelli (compliance, costo, latenza)?",
        rationale: "Ottimizza routing policy e fallback chain."
      });
    }

    return questions;
  }

  async composePlanDraft(input: BrainstormComposeInput): Promise<BrainstormPlanDraft> {
    const allSubprompts = await this.listSubprompts({ enabled: true });
    const selectedSubprompts =
      input.selectedSubpromptIds.length > 0
        ? allSubprompts.filter((item) => input.selectedSubpromptIds.includes(item.id))
        : allSubprompts.filter((item) => item.category === "stack" || item.category === "architecture");

    const stack = inferStack(selectedSubprompts, input.projectIntent);
    const architecture = inferArchitecture(selectedSubprompts, input.projectIntent);
    const suggestedSkills = inferSuggestedSkills(selectedSubprompts, input.projectIntent);
    const roadmap = roadmapFromIntent(
      input.projectIntent,
      suggestedSkills.map((skill) => skill.name)
    );

    const draftPlan = {
      recommendedStack: stack,
      architecture,
      suggestedAgents: defaultAgents(),
      suggestedSkills,
      providerBindings: defaultBindings(stack),
      roadmap,
      assumptions: [
        "Contracts remain additive and backward-compatible.",
        "Provider credentials are configured externally via secrets/env refs."
      ],
      risks: [
        "Discovery may require network access; fallback provider set must remain valid.",
        "Cross-repo tasks need explicit ordering to avoid conflicting writes."
      ],
      composedPrompt: "",
      selectedSubprompts
    } satisfies BrainstormPlan["plan"];

    const composedPrompt = await this.promptBuilderService.buildPrompt({
      role: "planner",
      subprompts: selectedSubprompts,
      plan: draftPlan,
      context: {
        projectIntent: input.projectIntent,
        guidedAnswers: input.guidedAnswers ?? {},
        outputRequirements: [
          "stack recommendation",
          "architecture strategy",
          "suggested agents/skills",
          "roadmap with dependencies"
        ]
      }
    });

    return {
      title: "Brainstormed control-plane plan",
      executiveSummary:
        "Structured initial plan generated from guided questions plus reusable subprompt library.",
      plan: {
        ...draftPlan,
        composedPrompt,
        selectedSubprompts
      }
    };
  }

  makePlanEntity(sessionId: string, draft: BrainstormPlanDraft, actor = "brainstorming_service"): BrainstormPlan {
    const nowIso = this.now().toISOString();
    return {
      id: this.idGenerator(),
      sessionId,
      title: draft.title,
      executiveSummary: draft.executiveSummary,
      plan: draft.plan,
      createdAt: nowIso,
      createdBy: actor,
      updatedAt: nowIso,
      updatedBy: actor
    };
  }
}
