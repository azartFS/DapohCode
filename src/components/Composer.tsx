import { type ChangeEvent, type KeyboardEvent, useState } from "react";
import { useApp } from "../store/app";
import {
  IconArrowUp,
  IconBolt,
  IconChevronDown,
  IconPlus,
  IconSparkle,
} from "./icons";
import { Select } from "./Select";
import type { ReasoningEffort } from "../types";
import { displayModelName, supportsReasoning } from "../lib/format";
import { useT } from "../lib/i18n";

const REASONING_OPTIONS: { value: ReasoningEffort; label: string }[] = [
  { value: "minimal", label: "Минимум" },
  { value: "low", label: "Низкая" },
  { value: "medium", label: "Средняя" },
  { value: "high", label: "Высокая" },
];

export function Composer() {
  const t = useT();
  const [text, setText] = useState("");
  const streaming = useApp((s) => s.streaming);
  const send = useApp((s) => s.send);
  const stop = useApp((s) => s.stop);

  const models = useApp((s) => s.models);
  const providers = useApp((s) => s.providers);
  const activeModelId = useApp((s) => s.activeModelId);
  const setActiveModel = useApp((s) => s.setActiveModel);
  const reasoningEffort = useApp((s) => s.reasoningEffort);
  const setReasoningEffort = useApp((s) => s.setReasoningEffort);
  const reasoningModelIds = useApp((s) => s.reasoningModelIds);

  const reasoningLabel =
    REASONING_OPTIONS.find((o) => o.value === reasoningEffort)?.label ??
    "Средняя";

  const model = models.find((m) => m.id === activeModelId);
  const provider = model
    ? providers.find((p) => p.id === model.providerId)
    : undefined;
  const modelLabel = model ? displayModelName(model.label) : "model";
  const providerName = provider?.name ?? "No provider";
  const canReason = model
    ? supportsReasoning(reasoningModelIds, model.modelId)
    : false;

  const submit = () => {
    const t = text.trim();
    if (!t || streaming) return;
    setText("");
    void send(t);
  };

  const onChange = (e: ChangeEvent<HTMLTextAreaElement>) => {
    setText(e.target.value);
    const el = e.target;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 200)}px`;
  };

  const onKey = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      submit();
    }
  };

  return (
    <div className="mx-auto w-full max-w-[760px] px-4">
      <div className="rounded-2xl border border-[var(--color-border-strong)] bg-[var(--color-surface)] px-4 pb-2.5 pt-3.5 focus-within:border-[#3a3a3a]">
        <textarea
          value={text}
          onChange={onChange}
          onKeyDown={onKey}
          rows={1}
          placeholder={t("Спросите что угодно...")}
          className="max-h-[200px] min-h-[26px] w-full resize-none bg-transparent text-[13.5px] leading-relaxed text-white outline-none placeholder:text-[var(--color-faint)]"
        />

        <div className="mt-2 flex items-center">
          <button
            className="grid h-[30px] w-[30px] place-items-center rounded-lg text-[var(--color-muted)] transition-colors hover:bg-[var(--color-surface-2)] hover:text-white"
            title="Прикрепить"
            aria-label="Attach"
          >
            <IconPlus className="h-[17px] w-[17px]" />
          </button>

          <div className="ml-auto">
            {streaming ? (
              <button
                onClick={() => void stop()}
                className="grid h-[32px] w-[32px] place-items-center rounded-[9px] bg-[var(--color-surface-3)] text-white transition-colors hover:bg-[var(--color-border)]"
                title="Стоп"
                aria-label="Stop"
              >
                <span className="h-3 w-3 rounded-[2px] bg-white" />
              </button>
            ) : (
              <button
                onClick={submit}
                disabled={!text.trim()}
                className="grid h-[32px] w-[32px] place-items-center rounded-[9px] bg-[var(--color-surface-3)] text-[#cfcfcf] transition-colors hover:text-white disabled:opacity-40"
                title="Отправить"
                aria-label="Send"
              >
                <IconArrowUp className="h-[16px] w-[16px]" />
              </button>
            )}
          </div>
        </div>
      </div>

      <div className="mt-2.5 flex items-center gap-5 px-1 text-[12.5px] text-[var(--color-muted)]">
        <div
          className="flex cursor-pointer items-center gap-1.5 transition-colors hover:text-white"
          title="Режим"
        >
          <b className="font-semibold text-[#e8e8e8]">Build</b>
          <IconChevronDown className="h-[11px] w-[11px] text-[var(--color-faint)]" />
        </div>

        {canReason && (
          <Select
            value={reasoningEffort}
            onChange={(v) => setReasoningEffort(v as ReasoningEffort)}
            openUp
            options={REASONING_OPTIONS}
            trigger={
              <span
                className="flex cursor-pointer items-center gap-1.5 transition-colors hover:text-white"
                title="Сила раздумывания (reasoning effort) — передаётся в API"
              >
                <IconBolt className="h-[13px] w-[13px] text-[#cfcfcf]" />
                <span className="text-[#e8e8e8]">{reasoningLabel}</span>
                <IconChevronDown className="h-[11px] w-[11px] text-[var(--color-faint)]" />
              </span>
            }
          />
        )}

        <Select
          value={activeModelId ?? ""}
          onChange={(v) => setActiveModel(v || null)}
          openUp
          options={models.map((m) => {
            const pn =
              providers.find((p) => p.id === m.providerId)?.name ?? "?";
            return { value: m.id, label: `${pn} · ${displayModelName(m.label)}` };
          })}
          trigger={
            <span className="flex cursor-pointer items-center gap-1.5 transition-colors hover:text-white">
              <IconSparkle className="h-[14px] w-[14px] text-[#cfcfcf]" />
              <span className="text-[#e8e8e8]">{providerName}</span>
              <span className="text-[var(--color-faint)]">·</span>
              <span>{modelLabel}</span>
              <IconChevronDown className="h-[11px] w-[11px] text-[var(--color-faint)]" />
            </span>
          }
        />
      </div>
    </div>
  );
}
