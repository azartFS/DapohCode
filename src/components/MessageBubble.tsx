import { useApp } from "../store/app";
import { useT } from "../lib/i18n";
import { MessageContent } from "./MessageContent";
import { ToolStepCard } from "./ToolStep";
import type { ChatMessage } from "../types";
import { IconAlert } from "./icons";
import { ThinkingIndicator } from "./ThinkingIndicator";

export function MessageBubble({ m }: { m: ChatMessage }) {
  const isUser = m.role === "user";
  // Older persisted error messages had a leading "⚠ " — strip it since the
  // error box now renders its own alert icon.
  const content = m.error
    ? m.content.replace(/^\s*[⚠️]+\s*/u, "")
    : m.content;

  if (isUser) {
    return (
      <div className="flex justify-end">
        <div className="max-w-[78%] rounded-[15px] bg-[var(--color-surface-2)] px-[15px] py-[9px] text-[13.5px] leading-relaxed text-[var(--color-text)]">
          <MessageContent text={content} />
        </div>
      </div>
    );
  }

  if (m.error) {
    return (
      <div
        className="flex items-start gap-2 rounded-lg bg-[color-mix(in_srgb,var(--color-danger)_10%,transparent)] px-3 py-2 text-[13.5px] text-[var(--color-danger)]"
        style={{
          boxShadow:
            "0 0 16px 2px color-mix(in srgb, var(--color-danger) 22%, transparent)",
        }}
      >
        <IconAlert className="mt-0.5 h-[15px] w-[15px] flex-shrink-0" />
        <div className="min-w-0 flex-1">
          <MessageContent text={content} />
        </div>
      </div>
    );
  }

  const hasTools = (m.toolSteps?.length ?? 0) > 0;
  const t = useT();
  const showThinking = useApp((s) => s.showThinking);
  const hasReasoning = (m.reasoning?.length ?? 0) > 0;
  const isThinking = m.streaming && m.content.length === 0 && !hasTools;

  return (
    <div className="text-[13.5px] leading-relaxed text-[var(--color-text)]">
      {/* Reasoning/thinking block — shown muted when setting is on */}
      {showThinking && hasReasoning && (
        <div className="mb-2 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2">
          <div className="mb-1 flex items-center gap-1.5 text-[11px] font-medium text-[var(--color-faint)]">
            <span className="opacity-70">💭</span> {t("Размышления")}
            {m.streaming && m.content.length === 0 && (
              <span className="ml-1 inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-[var(--color-muted)]" />
            )}
          </div>
          <div className="text-[12.5px] leading-relaxed text-[var(--color-muted)] whitespace-pre-wrap">
            {m.reasoning}
          </div>
        </div>
      )}
      {/* When showThinking is OFF and model is still only reasoning — show indicator */}
      {!showThinking && isThinking && hasReasoning && (
        <ThinkingIndicator />
      )}
      {/* When no reasoning at all and streaming with no content — show indicator */}
      {isThinking && !hasReasoning && (
        <ThinkingIndicator />
      )}
      {content.trim().length > 0 && <MessageContent text={content} />}
      {hasTools && (
        <div className="mt-2 flex flex-col gap-1.5">
          {m.toolSteps!.map((s) => (
            <ToolStepCard key={s.id} step={s} />
          ))}
        </div>
      )}
    </div>
  );
}
