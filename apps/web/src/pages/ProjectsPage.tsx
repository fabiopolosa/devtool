import { useNavigate } from '@tanstack/react-router';
import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import type { Project } from '@cp/domain';
import { Button, Input, Panel, SectionHeading } from '@/components/common';
import { ProjectCard } from '@/components/panels';
import { useAppStore } from '@/store/app-store';

interface CreateProjectPayload {
  name: string;
  description?: string;
}

export function ProjectsPage() {
  const navigate = useNavigate();
  const { state, dispatch, auth, authActions } = useAppStore();
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [loading, setLoading] = useState(false);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | undefined>();

  const loadProjects = useCallback(async () => {
    if (auth.enabled && auth.required) return;
    setLoading(true);
    setError(undefined);
    try {
      const { response, body } = await authActions.apiFetchJson<{ items?: Project[]; message?: string }>('/projects');
      if (!response.ok) {
        throw new Error(body.message ?? `Unable to load projects (HTTP ${response.status})`);
      }
      dispatch({ type: 'replaceProjects', projects: body.items ?? [] });
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Unable to load projects');
    } finally {
      setLoading(false);
    }
  }, [auth.enabled, auth.required, authActions, dispatch]);

  useEffect(() => {
    void loadProjects();
  }, [loadProjects]);

  const submit = useCallback(
    async (event: FormEvent) => {
      event.preventDefault();
      if (!name.trim()) return;
      setCreating(true);
      setError(undefined);
      try {
        const payload: CreateProjectPayload = {
          name: name.trim(),
          ...(description.trim() ? { description: description.trim() } : {})
        };
        const { response, body } = await authActions.apiFetchJson<{ item?: Project; message?: string }>('/projects', {
          method: 'POST',
          body: JSON.stringify(payload)
        });
        if (!response.ok || !body.item) {
          throw new Error(body.message ?? `Unable to create project (HTTP ${response.status})`);
        }

        setName('');
        setDescription('');
        setShowCreateForm(false);
        dispatch({ type: 'replaceProjects', projects: [...state.projects, body.item] });
        await navigate({ to: '/project/$projectId', params: { projectId: body.item.id } });
      } catch (createError) {
        setError(createError instanceof Error ? createError.message : 'Unable to create project');
      } finally {
        setCreating(false);
      }
    },
    [authActions, description, dispatch, name, navigate, state.projects]
  );

  const cards = useMemo(
    () =>
      state.projects.map((project) => ({
        project,
        repoCount: state.projectRepositoryLinks.filter((link) => link.projectId === project.id).length,
        roadmapCount: state.roadmapItems.filter((item) => item.projectId === project.id).length,
        taskCount: state.tasks.filter((item) => item.projectId === project.id).length
      })),
    [state.projectRepositoryLinks, state.projects, state.roadmapItems, state.tasks]
  );

  return (
    <div className="space-y-5">
      <Panel>
        <SectionHeading
          title="Projects"
          subtitle="Portfolio"
          action={
            <div className="flex gap-2">
              <Button variant="secondary" onClick={() => void loadProjects()}>
                {loading ? 'Refreshing...' : 'Refresh'}
              </Button>
              <Button variant="primary" onClick={() => setShowCreateForm((current) => !current)}>
                {showCreateForm ? 'Close' : 'New Project'}
              </Button>
            </div>
          }
        />
        {showCreateForm ? (
          <form onSubmit={(event) => void submit(event)} className="grid gap-3 md:grid-cols-[1.2fr_2fr_auto]">
            <Input value={name} onChange={setName} placeholder="Project name" />
            <Input value={description} onChange={setDescription} placeholder="Short description (optional)" />
            <Button type="submit" variant="primary">
              {creating ? 'Creating...' : 'Create'}
            </Button>
          </form>
        ) : (
          <p className="text-sm text-[color:var(--muted)]">
            Create a tenant-scoped project and open its workspace to start coding, context, and schema workflows.
          </p>
        )}
        {error ? <p className="mt-3 text-sm text-[color:var(--bad)]">{error}</p> : null}
      </Panel>

      {loading && cards.length === 0 ? (
        <Panel>
          <p className="text-sm text-[color:var(--muted)]">Loading projects...</p>
        </Panel>
      ) : null}

      {!loading && cards.length === 0 ? (
        <Panel>
          <SectionHeading title="No projects yet" subtitle="Empty state" />
          <p className="text-sm text-[color:var(--muted)]">
            Start by creating your first project. It will open directly into `/project/:id` after creation.
          </p>
          <div className="mt-3">
            <Button variant="primary" onClick={() => setShowCreateForm(true)}>
              New Project
            </Button>
          </div>
        </Panel>
      ) : null}

      {cards.length > 0 ? (
        <div className="grid gap-4 xl:grid-cols-2">
          {cards.map((card) => (
            <div key={card.project.id} className="space-y-2">
              <ProjectCard
                project={card.project}
                repoCount={card.repoCount}
                roadmapCount={card.roadmapCount}
                taskCount={card.taskCount}
              />
              <div className="flex flex-wrap gap-2">
                <Button
                  variant="primary"
                  onClick={() =>
                    void navigate({
                      to: '/project/$projectId',
                      params: { projectId: card.project.id }
                    })
                  }
                >
                  Open project
                </Button>
                <Button
                  variant="secondary"
                  onClick={() =>
                    void navigate({
                      to: '/project/$projectId/coding',
                      params: { projectId: card.project.id }
                    })
                  }
                >
                  Open coding
                </Button>
                <Button
                  onClick={() =>
                    void navigate({
                      to: '/project/$projectId/context',
                      params: { projectId: card.project.id }
                    })
                  }
                >
                  Open context
                </Button>
              </div>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}
