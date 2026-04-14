import { FormEvent, useMemo, useState } from 'react';
import { Input, Panel, SectionHeading } from '@/components/common';
import { ProjectCard } from '@/components/panels';
import { useAppStore } from '@/store/app-store';

export function ProjectsPage() {
  const { state, dispatch } = useAppStore();
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (!name.trim()) return;
    dispatch({ type: 'createProject', name: name.trim(), description: description.trim() });
    setName('');
    setDescription('');
  };

  const cards = useMemo(
    () =>
      state.projects.map((project) => ({
        project,
        repoCount: state.projectRepositoryLinks.filter((link) => link.projectId === project.id).length,
        roadmapCount: state.roadmapItems.filter((item) => item.projectId === project.id).length,
        taskCount: state.tasks.filter((item) => item.projectId === project.id).length
      })),
    [state]
  );

  return (
    <div className="space-y-5">
      <Panel>
        <SectionHeading title="Projects" subtitle="Portfolio" />
        <form onSubmit={submit} className="grid gap-3 md:grid-cols-[1.2fr_2fr_auto]">
          <Input value={name} onChange={setName} placeholder="New project name" />
          <Input value={description} onChange={setDescription} placeholder="Short description" />
          <button type="submit" className="rounded-xl border border-cyan-400/30 bg-cyan-500/20 px-4 py-2 text-sm font-medium text-cyan-100">Create</button>
        </form>
      </Panel>

      <div className="grid gap-4 xl:grid-cols-2">
        {cards.map((card) => (
          <ProjectCard
            key={card.project.id}
            project={card.project}
            repoCount={card.repoCount}
            roadmapCount={card.roadmapCount}
            taskCount={card.taskCount}
          />
        ))}
      </div>
    </div>
  );
}
