import { useCallback, useEffect, useMemo, useState } from "react";
import type { Skill } from "@cp/domain";
import { Button, Input, Panel, Pill, SectionHeading } from "@/components/common";
import { useAppStore } from "@/store/app-store";

const defaultMarketplaceUrl =
  (import.meta.env.VITE_SKILLS_MARKETPLACE_DEFAULT as string | undefined)?.trim() ||
  "https://raw.githubusercontent.com/fabiopolosa/devtool/main/marketplace.json";

type SkillScope = "system" | "tenant" | "user";
type SkillSourceType = "github" | "file" | "zip";
type SkillsTab = "installed" | "marketplace" | "install";

type SkillVersionRecord = {
  version: string;
  sourceRef?: string;
  installedAt: string;
  installedBy: string;
  notes?: string;
};

const normalize = (value: string): string => value.trim().toLowerCase();

const toTone = (status: string | undefined): "good" | "warn" | "bad" | "default" => {
  if (status === "valid") return "good";
  if (status === "pending") return "warn";
  if (status === "invalid") return "bad";
  return "default";
};

const resolveSkillScope = (skill: Skill, userId?: string): SkillScope => {
  if (skill.scope === "system" || skill.scope === "tenant" || skill.scope === "user") {
    return skill.scope;
  }
  if (skill.categories.includes("scope:system")) return "system";
  if (skill.categories.includes("scope:user")) return "user";
  if (skill.categories.includes("scope:tenant")) return "tenant";
  if (skill.createdBy === "system" || skill.createdBy === "skills_service") return "system";
  if (userId && skill.createdBy === userId) return "user";
  if (skill.createdBy.startsWith("user:")) return "user";
  return "tenant";
};

const isVerified = (skill: Skill): boolean => {
  const metadata = skill.metadata as { marketplace?: boolean; verified?: boolean } | undefined;
  return metadata?.verified === true || metadata?.marketplace === true || skill.categories.includes("verified");
};

const readFileAsBase64 = async (file: File): Promise<string> => {
  const content = await file.arrayBuffer();
  const bytes = new Uint8Array(content);
  let binary = "";
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary);
};

const toHostLabel = (url: string): string => {
  try {
    const parsed = new URL(url);
    return parsed.hostname;
  } catch {
    return url;
  }
};

export function SkillsPage() {
  const { auth, authActions } = useAppStore();
  const [activeTab, setActiveTab] = useState<SkillsTab>("installed");

  const [marketplaceUrl, setMarketplaceUrl] = useState(defaultMarketplaceUrl);
  const [marketplaceSearch, setMarketplaceSearch] = useState("");
  const [marketplaceCategory, setMarketplaceCategory] = useState("all");
  const [marketplaceScope, setMarketplaceScope] = useState<SkillScope>("tenant");

  const [installedSearch, setInstalledSearch] = useState("");
  const [installedScope, setInstalledScope] = useState<"all" | SkillScope>("all");

  const [catalog, setCatalog] = useState<Skill[]>([]);
  const [installed, setInstalled] = useState<Skill[]>([]);
  const [historyBySkillId, setHistoryBySkillId] = useState<Record<string, SkillVersionRecord[]>>({});

  const [loadingCatalog, setLoadingCatalog] = useState(false);
  const [loadingInstalled, setLoadingInstalled] = useState(false);
  const [actionKey, setActionKey] = useState<string | undefined>();
  const [error, setError] = useState<string | undefined>();
  const [warning, setWarning] = useState<string | undefined>();
  const [message, setMessage] = useState<string | undefined>();

  const [customName, setCustomName] = useState("");
  const [customDescription, setCustomDescription] = useState("");
  const [customInstructions, setCustomInstructions] = useState("");
  const [customVersion, setCustomVersion] = useState("0.0.0");
  const [customRepositoryUrl, setCustomRepositoryUrl] = useState("");
  const [customSourceType, setCustomSourceType] = useState<SkillSourceType>("github");
  const [customFile, setCustomFile] = useState<File | null>(null);

  const setAction = (skillId: string, action: string): void => {
    setActionKey(`${skillId}:${action}`);
  };
  const clearAction = (): void => setActionKey(undefined);
  const actionBusy = (skillId: string, action: string): boolean => actionKey === `${skillId}:${action}`;

  const loadInstalled = useCallback(async () => {
    setLoadingInstalled(true);
    try {
      const response = await authActions.apiFetch("/skills/installed?includeDisabled=1");
      const body = (await response.json()) as { items?: Skill[]; message?: string };
      if (!response.ok) {
        throw new Error(body.message ?? `Unable to load installed skills (HTTP ${response.status})`);
      }
      setInstalled(body.items ?? []);
    } finally {
      setLoadingInstalled(false);
    }
  }, [authActions]);

  const loadCatalog = useCallback(async () => {
    setLoadingCatalog(true);
    try {
      const response = await authActions.apiFetch(
        `/skills/catalog?marketplace=${encodeURIComponent(marketplaceUrl)}`
      );
      const body = (await response.json()) as { items?: Skill[]; message?: string };
      if (!response.ok) {
        throw new Error(body.message ?? `Unable to load marketplace catalog (HTTP ${response.status})`);
      }
      setCatalog(body.items ?? []);
    } finally {
      setLoadingCatalog(false);
    }
  }, [authActions, marketplaceUrl]);

  const loadAll = useCallback(async () => {
    setError(undefined);
    setWarning(undefined);
    await Promise.all([loadInstalled(), loadCatalog()]);
  }, [loadCatalog, loadInstalled]);

  useEffect(() => {
    if (!auth.enabled) return;
    void loadAll().catch((loadError) => {
      setError(loadError instanceof Error ? loadError.message : "Unable to load skills");
    });
  }, [auth.enabled, loadAll]);

  const runPostInstallFlow = useCallback(
    async (skill: Skill, sourceLabel: string) => {
      const validateResponse = await authActions.apiFetch(`/skills/${skill.id}/validate`, {
        method: "POST"
      });
      const validateBody = (await validateResponse.json()) as {
        item?: Skill;
        validation?: { status?: string };
        message?: string;
      };
      if (!validateResponse.ok || !validateBody.item) {
        throw new Error(validateBody.message ?? `Unable to validate skill (HTTP ${validateResponse.status})`);
      }

      const status = validateBody.validation?.status ?? validateBody.item.validationStatus;
      if (status !== "valid") {
        setWarning(`Skill '${skill.name}' installed from ${sourceLabel} but validation is '${status ?? "unknown"}'.`);
        await loadInstalled();
        return;
      }

      const enableResponse = await authActions.apiFetch(`/skills/${skill.id}/enable`, {
        method: "POST"
      });
      const enableBody = (await enableResponse.json()) as { message?: string };
      if (!enableResponse.ok) {
        throw new Error(enableBody.message ?? `Unable to enable skill (HTTP ${enableResponse.status})`);
      }

      await loadInstalled();
      setMessage(`Skill '${skill.name}' installed, validated and enabled.`);
    },
    [authActions, loadInstalled]
  );

  const installFromMarketplace = useCallback(
    async (skill: Skill) => {
      setError(undefined);
      setWarning(undefined);
      setMessage(undefined);
      setAction(skill.id, "install");
      try {
        const response = await authActions.apiFetch("/skills/install", {
          method: "POST",
          body: JSON.stringify({
            name: skill.name,
            repositoryUrl: skill.repositoryUrl,
            scope: marketplaceScope,
            description: skill.description,
            instructions: skill.instructions,
            version: skill.version,
            sourceType: skill.sourceType ?? "github",
            sourceRef: skill.sourceRef ?? skill.repositoryUrl
          })
        });
        const body = (await response.json()) as {
          item?: Skill;
          warning?: string;
          message?: string;
        };
        if (!response.ok || !body.item) {
          throw new Error(body.message ?? `Unable to install skill (HTTP ${response.status})`);
        }
        if (body.warning) {
          setWarning(body.warning);
        }
        await runPostInstallFlow(body.item, "marketplace");
        await loadCatalog();
      } catch (installError) {
        setError(installError instanceof Error ? installError.message : "Unable to install skill");
      } finally {
        clearAction();
      }
    },
    [authActions, loadCatalog, marketplaceScope, runPostInstallFlow]
  );

  const installCustomSkill = useCallback(async () => {
    if (!customName.trim()) {
      setError("Skill name is required.");
      return;
    }

    setError(undefined);
    setWarning(undefined);
    setMessage(undefined);
    setAction("custom", "install");
    try {
      let item: Skill | undefined;
      if (customSourceType === "github") {
        if (!customRepositoryUrl.trim()) {
          throw new Error("GitHub URL is required.");
        }
        const response = await authActions.apiFetch("/skills/install", {
          method: "POST",
          body: JSON.stringify({
            name: customName.trim(),
            repositoryUrl: customRepositoryUrl.trim(),
            scope: marketplaceScope,
            version: customVersion.trim() || "0.0.0",
            description: customDescription.trim() || undefined,
            instructions: customInstructions.trim() || undefined,
            sourceType: "github"
          })
        });
        const body = (await response.json()) as { item?: Skill; warning?: string; message?: string };
        if (!response.ok || !body.item) {
          throw new Error(body.message ?? `Unable to install custom skill (HTTP ${response.status})`);
        }
        item = body.item;
        if (body.warning) setWarning(body.warning);
      } else {
        if (!customFile) {
          throw new Error("Select a file to upload.");
        }
        const contentBase64 = await readFileAsBase64(customFile);
        const response = await authActions.apiFetch("/skills/install-upload", {
          method: "POST",
          body: JSON.stringify({
            name: customName.trim(),
            sourceType: customSourceType,
            fileName: customFile.name,
            contentBase64,
            scope: marketplaceScope,
            version: customVersion.trim() || "0.0.0",
            description: customDescription.trim() || undefined,
            instructions: customInstructions.trim() || undefined
          })
        });
        const body = (await response.json()) as { item?: Skill; warning?: string; message?: string };
        if (!response.ok || !body.item) {
          throw new Error(body.message ?? `Unable to install uploaded skill (HTTP ${response.status})`);
        }
        item = body.item;
        if (body.warning) setWarning(body.warning);
      }

      if (!item) {
        throw new Error("Install succeeded but no skill item was returned.");
      }

      await runPostInstallFlow(item, "manual install");
      setCustomName("");
      setCustomDescription("");
      setCustomInstructions("");
      setCustomVersion("0.0.0");
      setCustomRepositoryUrl("");
      setCustomFile(null);
      await loadCatalog();
      setActiveTab("installed");
    } catch (installError) {
      setError(installError instanceof Error ? installError.message : "Unable to install custom skill");
    } finally {
      clearAction();
    }
  }, [
    authActions,
    customDescription,
    customFile,
    customInstructions,
    customName,
    customRepositoryUrl,
    customSourceType,
    customVersion,
    loadCatalog,
    marketplaceScope,
    runPostInstallFlow
  ]);

  const withSkillAction = useCallback(
    async (skill: Skill, action: string, handler: () => Promise<void>) => {
      setError(undefined);
      setWarning(undefined);
      setMessage(undefined);
      setAction(skill.id, action);
      try {
        await handler();
      } catch (actionError) {
        setError(actionError instanceof Error ? actionError.message : `Unable to ${action} skill`);
      } finally {
        clearAction();
      }
    },
    []
  );

  const disableSkill = useCallback(
    async (skill: Skill) =>
      withSkillAction(skill, "disable", async () => {
        const response = await authActions.apiFetch(`/skills/${skill.id}/disable`, { method: "POST" });
        const body = (await response.json()) as { message?: string };
        if (!response.ok) {
          throw new Error(body.message ?? `Unable to disable skill (HTTP ${response.status})`);
        }
        setMessage(`Skill '${skill.name}' disabled.`);
        await loadInstalled();
      }),
    [authActions, loadInstalled, withSkillAction]
  );

  const enableSkill = useCallback(
    async (skill: Skill) =>
      withSkillAction(skill, "enable", async () => {
        const response = await authActions.apiFetch(`/skills/${skill.id}/enable`, { method: "POST" });
        const body = (await response.json()) as { message?: string };
        if (!response.ok) {
          throw new Error(body.message ?? `Unable to enable skill (HTTP ${response.status})`);
        }
        setMessage(`Skill '${skill.name}' enabled.`);
        await loadInstalled();
      }),
    [authActions, loadInstalled, withSkillAction]
  );

  const uninstallSkill = useCallback(
    async (skill: Skill) =>
      withSkillAction(skill, "uninstall", async () => {
        const response = await authActions.apiFetch(`/skills/${skill.id}`, { method: "DELETE" });
        const body = (await response.json()) as { message?: string };
        if (!response.ok) {
          throw new Error(body.message ?? `Unable to uninstall skill (HTTP ${response.status})`);
        }
        setMessage(`Skill '${skill.name}' uninstalled.`);
        setHistoryBySkillId((current) => {
          const next = { ...current };
          delete next[skill.id];
          return next;
        });
        await loadInstalled();
      }),
    [authActions, loadInstalled, withSkillAction]
  );

  const validateSkill = useCallback(
    async (skill: Skill) =>
      withSkillAction(skill, "validate", async () => {
        const response = await authActions.apiFetch(`/skills/${skill.id}/validate`, { method: "POST" });
        const body = (await response.json()) as { message?: string };
        if (!response.ok) {
          throw new Error(body.message ?? `Unable to validate skill (HTTP ${response.status})`);
        }
        setMessage(`Skill '${skill.name}' validated.`);
        await loadInstalled();
      }),
    [authActions, loadInstalled, withSkillAction]
  );

  const loadHistory = useCallback(
    async (skill: Skill) =>
      withSkillAction(skill, "history", async () => {
        const response = await authActions.apiFetch(`/skills/${skill.id}/history`);
        const body = (await response.json()) as { items?: SkillVersionRecord[]; message?: string };
        if (!response.ok) {
          throw new Error(body.message ?? `Unable to load history (HTTP ${response.status})`);
        }
        setHistoryBySkillId((current) => ({ ...current, [skill.id]: body.items ?? [] }));
      }),
    [authActions, withSkillAction]
  );

  const marketplaceCategories = useMemo(() => {
    const set = new Set<string>();
    for (const skill of catalog) {
      for (const category of skill.categories) set.add(category);
    }
    return ["all", ...[...set].sort((left, right) => left.localeCompare(right))];
  }, [catalog]);

  const marketplaceRows = useMemo(() => {
    const query = normalize(marketplaceSearch);
    return catalog.filter((skill) => {
      if (marketplaceCategory !== "all" && !skill.categories.includes(marketplaceCategory)) return false;
      if (!query) return true;
      return (
        normalize(skill.name).includes(query) ||
        normalize(skill.description).includes(query) ||
        normalize(skill.repositoryUrl).includes(query) ||
        skill.categories.some((category) => normalize(category).includes(query))
      );
    });
  }, [catalog, marketplaceCategory, marketplaceSearch]);

  const installedRows = useMemo(() => {
    const query = normalize(installedSearch);
    return installed.filter((skill) => {
      if (installedScope !== "all" && resolveSkillScope(skill, auth.principal?.userId) !== installedScope) return false;
      if (!query) return true;
      return (
        normalize(skill.name).includes(query) ||
        normalize(skill.description).includes(query) ||
        normalize(skill.repositoryUrl).includes(query)
      );
    });
  }, [auth.principal?.userId, installed, installedScope, installedSearch]);

  if (!auth.enabled) {
    return (
      <Panel>
        <SectionHeading title="Skills" subtitle="Settings" />
        <p className="text-sm text-slate-300">Skills management is available only when authentication is enabled.</p>
      </Panel>
    );
  }

  return (
    <div className="space-y-5">
      <Panel>
        <SectionHeading title="Skills" subtitle="Marketplace, install and management" />
        <div className="flex flex-wrap gap-2">
          <Button variant={activeTab === "installed" ? "primary" : "ghost"} onClick={() => setActiveTab("installed")}>
            Installed ({installed.length})
          </Button>
          <Button variant={activeTab === "marketplace" ? "primary" : "ghost"} onClick={() => setActiveTab("marketplace")}>
            Marketplace ({catalog.length})
          </Button>
          <Button variant={activeTab === "install" ? "primary" : "ghost"} onClick={() => setActiveTab("install")}>
            Install
          </Button>
          <Button variant="secondary" onClick={() => void loadAll()}>
            {(loadingCatalog || loadingInstalled) ? "Refreshing..." : "Refresh"}
          </Button>
        </div>
        {error ? <p className="mt-3 text-sm text-rose-300">{error}</p> : null}
        {warning ? <p className="mt-2 text-sm text-amber-300">{warning}</p> : null}
        {message ? <p className="mt-2 text-sm text-cyan-200">{message}</p> : null}
      </Panel>

      {activeTab === "marketplace" ? (
        <Panel>
          <SectionHeading title="Marketplace" subtitle="Discover and install verified skills" />
          <div className="grid gap-2 lg:grid-cols-[1fr_220px_220px]">
            <Input value={marketplaceSearch} onChange={setMarketplaceSearch} placeholder="Search skills..." />
            <select
              value={marketplaceCategory}
              onChange={(event) => setMarketplaceCategory(event.target.value)}
              className="rounded-xl border border-white/10 bg-slate-950/40 px-3 py-2 text-sm text-white outline-none focus:border-cyan-400/40"
            >
              {marketplaceCategories.map((category) => (
                <option key={category} value={category}>
                  {category}
                </option>
              ))}
            </select>
            <select
              value={marketplaceScope}
              onChange={(event) => setMarketplaceScope(event.target.value as SkillScope)}
              className="rounded-xl border border-white/10 bg-slate-950/40 px-3 py-2 text-sm text-white outline-none focus:border-cyan-400/40"
            >
              <option value="tenant">Install as tenant skill</option>
              <option value="user">Install as user skill</option>
              <option value="system">Install as system skill</option>
            </select>
          </div>
          <div className="mt-3">
            <Input value={marketplaceUrl} onChange={setMarketplaceUrl} placeholder="Marketplace URL" />
          </div>
          <div className="mt-3 space-y-3">
            {marketplaceRows.map((skill) => (
              <div key={`${skill.name}:${skill.repositoryUrl}`} className="rounded-xl border border-white/10 bg-white/5 p-3">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <div className="font-medium text-white">{skill.name}</div>
                    <div className="text-xs text-slate-400">{skill.description}</div>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Pill tone="default">source: {skill.sourceType ?? toHostLabel(skill.repositoryUrl)}</Pill>
                    <Pill tone={isVerified(skill) ? "good" : "warn"}>
                      {isVerified(skill) ? "Verified" : "Unverified"}
                    </Pill>
                  </div>
                </div>
                <div className="mt-2 text-xs text-slate-400">{skill.repositoryUrl}</div>
                <div className="mt-2 flex flex-wrap gap-1">
                  {skill.categories.map((category) => (
                    <Pill key={`${skill.name}:${category}`} tone="accent">
                      {category}
                    </Pill>
                  ))}
                </div>
                <div className="mt-3">
                  <Button onClick={() => void installFromMarketplace(skill)}>
                    {actionBusy(skill.id, "install") ? "Installing..." : "Install"}
                  </Button>
                </div>
              </div>
            ))}
            {marketplaceRows.length === 0 ? <p className="text-sm text-slate-400">No skills found.</p> : null}
          </div>
        </Panel>
      ) : null}

      {activeTab === "install" ? (
        <Panel>
          <SectionHeading title="Install" subtitle="Install → Validate → Enable" />
          <div className="grid gap-3 lg:grid-cols-2">
            <Input value={customName} onChange={setCustomName} placeholder="Skill name" />
            <Input value={customVersion} onChange={setCustomVersion} placeholder="Version" />
            <select
              value={customSourceType}
              onChange={(event) => setCustomSourceType(event.target.value as SkillSourceType)}
              className="rounded-xl border border-white/10 bg-slate-950/40 px-3 py-2 text-sm text-white outline-none focus:border-cyan-400/40"
            >
              <option value="github">GitHub URL</option>
              <option value="zip">ZIP upload</option>
              <option value="file">File upload</option>
            </select>
            {customSourceType === "github" ? (
              <Input value={customRepositoryUrl} onChange={setCustomRepositoryUrl} placeholder="https://github.com/org/repo" />
            ) : (
              <input
                type="file"
                accept={customSourceType === "zip" ? ".zip" : undefined}
                onChange={(event) => setCustomFile(event.target.files?.[0] ?? null)}
                className="rounded-xl border border-white/10 bg-slate-950/40 px-3 py-2 text-sm text-white file:mr-3 file:rounded-lg file:border-0 file:bg-cyan-500/20 file:px-3 file:py-1 file:text-cyan-100"
              />
            )}
          </div>
          <div className="mt-3 grid gap-3 lg:grid-cols-2">
            <textarea
              value={customDescription}
              onChange={(event) => setCustomDescription(event.target.value)}
              placeholder="Description"
              className="min-h-20 rounded-xl border border-white/10 bg-slate-950/40 px-3 py-2 text-sm text-white outline-none placeholder:text-slate-500 focus:border-cyan-400/40"
            />
            <textarea
              value={customInstructions}
              onChange={(event) => setCustomInstructions(event.target.value)}
              placeholder="Instructions"
              className="min-h-20 rounded-xl border border-white/10 bg-slate-950/40 px-3 py-2 text-sm text-white outline-none placeholder:text-slate-500 focus:border-cyan-400/40"
            />
          </div>
          <div className="mt-3">
            <Button variant="primary" onClick={() => void installCustomSkill()}>
              {actionBusy("custom", "install") ? "Installing..." : "Install skill"}
            </Button>
          </div>
        </Panel>
      ) : null}

      {activeTab === "installed" ? (
        <Panel>
          <SectionHeading title="Installed Skills" subtitle="Manage status and lifecycle" />
          <div className="grid gap-2 lg:grid-cols-[1fr_220px]">
            <Input value={installedSearch} onChange={setInstalledSearch} placeholder="Search installed..." />
            <select
              value={installedScope}
              onChange={(event) => setInstalledScope(event.target.value as "all" | SkillScope)}
              className="rounded-xl border border-white/10 bg-slate-950/40 px-3 py-2 text-sm text-white outline-none focus:border-cyan-400/40"
            >
              <option value="all">All scopes</option>
              <option value="system">System</option>
              <option value="tenant">Tenant</option>
              <option value="user">User</option>
            </select>
          </div>
          <div className="mt-3 space-y-3">
            {installedRows.map((skill) => {
              const history = historyBySkillId[skill.id] ?? [];
              return (
                <div key={skill.id} className="rounded-xl border border-white/10 bg-white/5 p-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="font-medium text-white">{skill.name}</div>
                    <div className="flex flex-wrap gap-2">
                      <Pill tone={skill.installed ? "good" : "warn"}>{skill.installed ? "Enabled" : "Disabled"}</Pill>
                      <Pill tone="accent">{resolveSkillScope(skill, auth.principal?.userId)}</Pill>
                      <Pill tone={toTone(skill.validationStatus)}>{skill.validationStatus ?? "unknown"}</Pill>
                      <Pill tone="default">v{skill.currentVersion ?? skill.version}</Pill>
                    </div>
                  </div>
                  <div className="mt-1 text-xs text-slate-400">{skill.repositoryUrl}</div>
                  <div className="mt-2 flex flex-wrap gap-1">
                    <Pill tone="default">source: {skill.sourceType ?? "github"}</Pill>
                    {(skill.capabilities ?? []).map((capability) => (
                      <Pill key={`${skill.id}:${capability}`} tone="accent">
                        {capability}
                      </Pill>
                    ))}
                  </div>
                  <p className="mt-2 text-sm text-slate-300">{skill.instructions}</p>
                  {(skill.validationErrors ?? []).length > 0 ? (
                    <div className="mt-2 rounded-lg border border-rose-500/30 bg-rose-500/10 p-2 text-xs text-rose-200">
                      {(skill.validationErrors ?? []).join("; ")}
                    </div>
                  ) : null}
                  <div className="mt-3 flex flex-wrap gap-2">
                    {skill.installed ? (
                      <Button variant="secondary" onClick={() => void disableSkill(skill)}>
                        {actionBusy(skill.id, "disable") ? "Disabling..." : "Disable"}
                      </Button>
                    ) : (
                      <Button variant="primary" onClick={() => void enableSkill(skill)}>
                        {actionBusy(skill.id, "enable") ? "Enabling..." : "Enable"}
                      </Button>
                    )}
                    <Button onClick={() => void validateSkill(skill)}>
                      {actionBusy(skill.id, "validate") ? "Validating..." : "Validate"}
                    </Button>
                    <Button variant="ghost" onClick={() => void loadHistory(skill)}>
                      {actionBusy(skill.id, "history") ? "Loading history..." : "History"}
                    </Button>
                    <Button variant="ghost" onClick={() => void uninstallSkill(skill)}>
                      {actionBusy(skill.id, "uninstall") ? "Uninstalling..." : "Uninstall"}
                    </Button>
                  </div>
                  {history.length > 0 ? (
                    <div className="mt-3 rounded-xl border border-white/10 bg-slate-950/30 p-2">
                      <div className="text-xs uppercase tracking-wide text-slate-400">Version history</div>
                      <div className="mt-1 space-y-1 text-xs text-slate-200">
                        {history.slice(0, 4).map((entry) => (
                          <div key={`${skill.id}:${entry.installedAt}:${entry.version}`}>
                            v{entry.version} · {new Date(entry.installedAt).toLocaleString()} · {entry.installedBy}
                            {entry.notes ? ` · ${entry.notes}` : ""}
                          </div>
                        ))}
                      </div>
                    </div>
                  ) : null}
                </div>
              );
            })}
            {installedRows.length === 0 ? <p className="text-sm text-slate-400">No installed skills found.</p> : null}
          </div>
        </Panel>
      ) : null}
    </div>
  );
}
