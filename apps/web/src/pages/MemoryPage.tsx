import { useMemo, useState } from 'react';
import { Input, Panel, SectionHeading } from '@/components/common';
import { MemoryChunkList } from '@/components/panels';
import { useAppStore } from '@/store/app-store';

export function MemoryPage() {
  const { state } = useAppStore();
  const [query, setQuery] = useState('');

  const chunks = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return state.memoryChunks;
    return state.memoryChunks.filter((chunk) => {
      const text = `${chunk.chunkTitle} ${chunk.chunkText} ${chunk.category}`.toLowerCase();
      return text.includes(q);
    });
  }, [query, state.memoryChunks]);

  return (
    <div className="space-y-5">
      <Panel>
        <SectionHeading title="Memory explorer" subtitle="Centralized memory" />
        <Input value={query} onChange={setQuery} placeholder="Filter by title, text, category" />
        <p className="mt-2 text-xs text-slate-400">Pinned, project-local, ADR, and run memory are all queryable here.</p>
      </Panel>
      <MemoryChunkList chunks={chunks} />
    </div>
  );
}
