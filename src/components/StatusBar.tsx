import { useApp, useCurrentMessages } from "../store/app";
import { displayModelName } from "../lib/format";

/** Rough token estimate: ~4 chars per token for natural language. */
function estimateTokens(text: string): number {
  if (!text) return 0;
  return Math.ceil(text.length / 3.5);
}

export function StatusBar() {
  const messages = useCurrentMessages();
  const activeModelId = useApp((s) => s.activeModelId);
  const models = useApp((s) => s.models);
  const providers = useApp((s) => s.providers);
  const sessions = useApp((s) => s.sessions);
  const currentSessionId = useApp((s) => s.currentSessionId);

  const sess = sessions.find((s) => s.id === currentSessionId);
  const model = models.find((m) => m.id === activeModelId);
  const provider = model ? providers.find((p) => p.id === model.providerId) : undefined;

  // Sum all message content for token estimate
  const totalChars = messages.reduce((sum, m) => sum + m.content.length, 0);
  const tokens = estimateTokens(totalChars.toString().length > 0 ? messages.map(m => m.content).join("") : "");

  if (messages.length === 0) return null;

  return (
    <div className="flex items-center gap-4 border-t border-[var(--color-border)] bg-[var(--color-rail)] px-4 py-1.5 text-[11px] text-[var(--color-faint)]">
      {model && (
        <span>
          {provider?.name ?? "?"} · {displayModelName(model.label)}
        </span>
      )}
      {sess?.folderName && (
        <span className="truncate">📂 {sess.folderName}</span>
      )}
      <span className="ml-auto tabular-nums">
        ~{tokens.toLocaleString()} токенов · {messages.length} сообщ.
      </span>
    </div>
  );
}
