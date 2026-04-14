import { useMemo } from 'react';
import { Panel, SectionHeading } from '@/components/common';
import { RepoStatusCard } from '@/components/panels';
import { usePathParam } from './_utils';
import { useAppStore } from '@/store/app-store';

export function RepositoriesPage() {
  const { state, dispatch } = useAppStore();
  const projectId = usePathParam(2);
  const project = state.projects.find((item) => item.id === projectId) ?? state.projects[0];

  const linkedIds = useMemo(
    () => state.projectRepositoryLinks.filter((link) => link.projectId === project?.id).map((link) => link.repositoryId),
    [state.projectRepositoryLinks, project?.id]
  );

  if (!project) return <Panel>No project selected.</Panel>;

  return (
    <div className="space-y-5">
      <Panel>
        <SectionHeading title="Repositories" subtitle={project.name} />
        <div className="text-sm text-slate-300">Link an existing repository to this project for multi-repo execution.</div>
        <div className="mt-3 flex flex-wrap gap-2">
          {state.repositories.filter((repo) => !linkedIds.includes(repo.id)).map((repo) => (
            <button
              key={repo.id}
              onClick={() => dispatch({ type: 'linkRepository', projectId: project.id, repositoryId: repo.id })}
              className="rounded-xl border border-cyan-400/30 bg-cyan-500/20 px-3 py-2 text-sm text-cyan-100"
            >
              Link {repo.name}
            </button>
          ))}
        </div>
      </Panel>
      <div className="grid gap-4 xl:grid-cols-2">
        {state.repositories
          .filter((repo) => linkedIds.includes(repo.id))
          .map((repository) => (
            <RepoStatusCard key={repository.id} repository={repository} linkedProject={project.name} />
          ))}
      </div>
    </div>
  );
}
