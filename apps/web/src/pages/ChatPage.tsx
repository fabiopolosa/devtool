import { useState } from "react";
import { Panel, SectionHeading } from '@/components/common';
import { ChatComposer, PlannerOutputCard } from '@/components/panels';
import { BrainstormingWorkbench } from '@/components/brainstorming/BrainstormingWorkbench';
import { usePathParam } from './_utils';
import { useAppStore } from '@/store/app-store';

export function ChatPage() {
  const { state, dispatch } = useAppStore();
  const [brainstormingMode, setBrainstormingMode] = useState(false);
  const threadId = usePathParam(1) ?? state.threads[0]?.id;
  const thread = state.threads.find((item) => item.id === threadId) ?? state.threads[0];
  const projectId = thread?.projectId ?? state.projects[0]?.id;
  const messages = state.messages.filter((item) => item.threadId === thread?.id);

  return (
    <div className="space-y-5">
      <Panel>
        <SectionHeading
          title={thread?.title ?? 'Command center'}
          subtitle={thread?.id ?? 'chat'}
          action={
            <button
              onClick={() => setBrainstormingMode((current) => !current)}
              className={`rounded-none border px-3 py-2 text-xs ${
                brainstormingMode
                  ? 'border-cyan-400/50 bg-cyan-500/20 text-cyan-100'
                  : 'border-white/20 bg-black/20 text-slate-300'
              }`}
            >
              {brainstormingMode ? 'Brainstorming ON' : 'Brainstorming mode'}
            </button>
          }
        />
        <div className="space-y-2">
          {messages.map((message) => (
            <div key={message.id} className="rounded-xl border border-white/10 bg-white/5 p-3 text-sm">
              <div className="mb-1 text-xs uppercase tracking-wide text-slate-400">{message.role}</div>
              <div className="text-slate-200">{message.content}</div>
            </div>
          ))}
        </div>
      </Panel>

      {brainstormingMode ? <BrainstormingWorkbench embedded /> : null}

      <ChatComposer
        onSubmit={(value) => {
          if (!thread?.id || !value.trim()) return;
          dispatch({ type: 'addMessage', threadId: thread.id, content: value });
          if (projectId) dispatch({ type: 'proposeRoadmapFromChat', projectId, content: value });
        }}
      />

      <PlannerOutputCard
        title="Chat to roadmap"
        summary="When a chat request contains execution intent, it can propose roadmap items and open approval gates."
      />
    </div>
  );
}
