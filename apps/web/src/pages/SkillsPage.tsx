import { useCallback, useEffect, useMemo, useState } from "react";
import type { Skill } from "@cp/domain";
import { Button, Input, Panel, Pill, SectionHeading } from "@/components/common";
import { useAppStore } from "@/store/app-store";

const defaultMarketplaceUrl =
  (import.meta.env.VITE_SKILLS_MARKETPLACE_DEFAULT as string | undefined)?.trim() ||
  "https://raw.githubusercontent.com/fabiopolosa/devtool/main/marketplace.json";

const normalize = (value: string): string => value.trim().toLowerCase();

export function SkillsPage() {
  const { auth, authActions } = useAppStore();
  const [marketplaceUrl, setMarketplaceUrl] = useState(defaultMarketplaceUrl);
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [catalog, setCatalog] = useState<Skill[]>([]);
  const [installed, setInstalled] = useState<Skill[]>([]);
  const [loading, setLoading] = useState(false);
  const [installingRepository, setInstallingRepository] = useState<string | undefined>();
  const [warning, setWarning] = useState<string | undefined>();
  const [error, setError] = useState<string | undefined>();

  const loadInstalled = useCallback(async () => {
    const response = await authActions.apiFetch("/skills/installed");
    const body = (await response.json()) as { items?: Skill[]; message?: string };
    if (!response.ok) {
      throw new Error(body.message ?? `Unable to load installed skills (HTTP ${response.status})`);
    }
    setInstalled(body.items ?? []);
  }, [authActions]);

  const loadCatalog = useCallback(async () => {
    setLoading(true);
    setError(undefined);
    setWarning(undefined);
    try {
      const response = await authActions.apiFetch(
        `/skills/catalog?marketplace=${encodeURIComponent(marketplaceUrl)}`
      );
      const body = (await response.json()) as { items?: Skill[]; message?: string };
      if (!response.ok) {
        throw new Error(body.message ?? `Unable to load marketplace catalog (HTTP ${response.status})`);
      }
      setCatalog(body.items ?? []);
      await loadInstalled();
    } catch (catalogError) {
      setError(catalogError instanceof Error ? catalogError.message : "Unable to load marketplace");
    } finally {
      setLoading(false);
    }
  }, [authActions, loadInstalled, marketplaceUrl]);

  useEffect(() => {
    if (!auth.enabled) {
      return;
    }
    void loadCatalog();
  }, [auth.enabled, loadCatalog]);

  const installSkill = useCallback(
    async (skill: Skill) => {
      setInstallingRepository(skill.repositoryUrl);
      setWarning(undefined);
      setError(undefined);
      try {
        const response = await authActions.apiFetch("/skills/install", {
          method: "POST",
          body: JSON.stringify({
            name: skill.name,
            repositoryUrl: skill.repositoryUrl
          })
        });
        const body = (await response.json()) as {
          item?: Skill;
          warning?: string;
          message?: string;
        };
        if (!response.ok) {
          throw new Error(body.message ?? `Unable to install skill (HTTP ${response.status})`);
        }

        if (body.warning) {
          setWarning(body.warning);
        }

        await Promise.all([loadInstalled(), loadCatalog()]);
      } catch (installError) {
        setError(installError instanceof Error ? installError.message : "Unable to install skill");
      } finally {
        setInstallingRepository(undefined);
      }
    },
    [authActions, loadCatalog, loadInstalled]
  );

  const categories = useMemo(() => {
    const set = new Set<string>();
    for (const skill of catalog) {
      for (const category of skill.categories) {
        set.add(category);
      }
    }
    return ["all", ...[...set].sort((left, right) => left.localeCompare(right))];
  }, [catalog]);

  const installedKey = useMemo(
    () => new Set(installed.map((skill) => `${normalize(skill.name)}::${skill.repositoryUrl}`)),
    [installed]
  );

  const filteredCatalog = useMemo(() => {
    const normalizedQuery = normalize(search);
    return catalog.filter((skill) => {
      if (categoryFilter !== "all" && !skill.categories.includes(categoryFilter)) {
        return false;
      }
      if (!normalizedQuery) {
        return true;
      }
      return (
        normalize(skill.name).includes(normalizedQuery) ||
        normalize(skill.description).includes(normalizedQuery) ||
        normalize(skill.repositoryUrl).includes(normalizedQuery) ||
        skill.categories.some((category) => normalize(category).includes(normalizedQuery))
      );
    });
  }, [catalog, categoryFilter, search]);

  if (!auth.enabled) {
    return (
      <Panel>
        <SectionHeading title="Skills" subtitle="Marketplace" />
        <p className="text-sm text-slate-300">
          Skills management is available only when authentication is enabled.
        </p>
      </Panel>
    );
  }

  return (
    <div className="space-y-5">
      <Panel>
        <SectionHeading title="Skills Marketplace" subtitle="Catalog & installation" />
        <div className="grid gap-2 lg:grid-cols-[1fr_auto]">
          <Input value={marketplaceUrl} onChange={setMarketplaceUrl} placeholder="Marketplace URL" />
          <Button variant="secondary" onClick={() => void loadCatalog()}>
            {loading ? "Refreshing..." : "Refresh catalog"}
          </Button>
        </div>
        <div className="mt-3 grid gap-2 lg:grid-cols-[1fr_220px]">
          <Input value={search} onChange={setSearch} placeholder="Search skills..." />
          <select
            value={categoryFilter}
            onChange={(event) => setCategoryFilter(event.target.value)}
            className="rounded-xl border border-white/10 bg-slate-950/40 px-3 py-2 text-sm text-white outline-none focus:border-cyan-400/40"
          >
            {categories.map((category) => (
              <option key={category} value={category}>
                {category}
              </option>
            ))}
          </select>
        </div>
        {error ? <p className="mt-3 text-sm text-rose-300">{error}</p> : null}
        {warning ? <p className="mt-2 text-sm text-amber-300">{warning}</p> : null}
      </Panel>

      <div className="grid gap-4 xl:grid-cols-2">
        <Panel>
          <SectionHeading title="Available Skills" subtitle={`${filteredCatalog.length} results`} />
          <div className="space-y-3">
            {filteredCatalog.map((skill) => {
              const isInstalled = installedKey.has(`${normalize(skill.name)}::${skill.repositoryUrl}`);
              return (
                <div key={`${skill.name}:${skill.repositoryUrl}`} className="rounded-xl border border-white/10 bg-white/5 p-3">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="font-medium text-white">{skill.name}</div>
                      <div className="text-xs text-slate-400">{skill.repositoryUrl}</div>
                    </div>
                    <Pill tone={isInstalled ? "good" : "default"}>
                      {isInstalled ? "Installed" : `v${skill.version}`}
                    </Pill>
                  </div>
                  <p className="mt-2 text-sm text-slate-300">{skill.description}</p>
                  <div className="mt-2 flex flex-wrap gap-1">
                    {skill.categories.map((category) => (
                      <Pill key={`${skill.name}:${category}`} tone="accent">
                        {category}
                      </Pill>
                    ))}
                  </div>
                  <div className="mt-3">
                    <Button
                      variant={isInstalled ? "ghost" : "primary"}
                      onClick={() => void installSkill(skill)}
                    >
                      {installingRepository === skill.repositoryUrl
                        ? "Installing..."
                        : isInstalled
                          ? "Reinstall"
                          : "Install"}
                    </Button>
                  </div>
                </div>
              );
            })}
            {filteredCatalog.length === 0 ? <p className="text-sm text-slate-400">No skills found.</p> : null}
          </div>
        </Panel>

        <Panel>
          <SectionHeading title="Installed Skills" subtitle={`${installed.length} installed`} />
          <div className="space-y-3">
            {installed.map((skill) => (
              <div key={skill.id} className="rounded-xl border border-white/10 bg-white/5 p-3">
                <div className="flex items-center justify-between gap-3">
                  <div className="font-medium text-white">{skill.name}</div>
                  <Pill tone="good">Installed</Pill>
                </div>
                <div className="mt-1 text-xs text-slate-400">{skill.repositoryUrl}</div>
                <p className="mt-2 text-sm text-slate-300">{skill.instructions}</p>
              </div>
            ))}
            {installed.length === 0 ? <p className="text-sm text-slate-400">No skills installed yet.</p> : null}
          </div>
        </Panel>
      </div>
    </div>
  );
}
