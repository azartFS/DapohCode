import { useState } from "react";
import { useApp } from "../store/app";
import type { ToolStep } from "../types";
import type { DiffLine } from "../lib/diff";
import { diffStat } from "../lib/diff";
import {
  IconCheck,
  IconChevronDown,
  IconChevronRight,
  IconClose,
  IconFileText,
  IconList,
  IconPencil,
  IconTrash,
} from "./icons";

const LABEL: Record<string, string> = {
  read_file: "Чтение",
  list_dir: "Список",
  write_file: "Запись",
  edit_file: "Правка",
  delete_file: "Удаление",
};

function ToolIcon({ name, className }: { name: string; className?: string }) {
  if (name === "list_dir") return <IconList className={className} />;
  if (name === "edit_file") return <IconPencil className={className} />;
  if (name === "delete_file") return <IconTrash className={className} />;
  return <IconFileText className={className} />;
}

function parseDiff(s?: string): DiffLine[] {
  if (!s) return [];
  try {
    const v = JSON.parse(s);
    return Array.isArray(v) ? (v as DiffLine[]) : [];
  } catch {
    return [];
  }
}

function StatusDot({ status }: { status: ToolStep["status"] }) {
  if (status === "ok")
    return <IconCheck className="h-3.5 w-3.5 text-[var(--color-success)]" />;
  if (status === "error")
    return <IconClose className="h-3.5 w-3.5 text-[var(--color-danger)]" />;
  if (status === "denied")
    return <IconClose className="h-3.5 w-3.5 text-[var(--color-faint)]" />;
  if (status === "awaiting")
    return (
      <span className="h-2 w-2 rounded-full bg-[var(--color-warn)]" />
    );
  return (
    <span className="h-2.5 w-2.5 animate-pulse rounded-full bg-[var(--color-muted)]" />
  );
}

function DiffView({ lines }: { lines: DiffLine[] }) {
  return (
    <pre className="selectable max-h-[320px] overflow-auto px-3 py-2 font-mono text-[12px] leading-[1.5]">
      {lines.map((l, i) => (
        <div
          key={i}
          className={
            l.type === "add"
              ? "bg-[color-mix(in_srgb,var(--color-success)_14%,transparent)] text-[#a6e6b8]"
              : l.type === "del"
                ? "bg-[color-mix(in_srgb,var(--color-danger)_13%,transparent)] text-[#f0a8a8]"
                : "text-[var(--color-muted)]"
          }
        >
          <span className="mr-2 select-none text-[var(--color-faint)]">
            {l.type === "add" ? "+" : l.type === "del" ? "-" : " "}
          </span>
          {l.text || "\u00A0"}
        </div>
      ))}
    </pre>
  );
}

export function ToolStepCard({ step }: { step: ToolStep }) {
  const pendingPerm = useApp((s) => s.pendingPerm);
  const resolvePermission = useApp((s) => s.resolvePermission);
  const isWrite =
    step.name === "write_file" ||
    step.name === "edit_file" ||
    step.name === "delete_file";
  const awaiting = pendingPerm?.stepId === step.id;
  const [open, setOpen] = useState(isWrite);

  const diff = isWrite ? parseDiff(step.diff) : [];
  const stat = diff.length ? diffStat(diff) : null;
  const label = LABEL[step.name] ?? step.name;
  const expandable = isWrite ? diff.length > 0 : !!step.result;
  const showBody = (open || awaiting) && expandable;

  return (
    <div className="overflow-hidden rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)]">
      <button
        onClick={() => expandable && setOpen((v) => !v)}
        className="flex w-full items-center gap-2.5 px-3 py-2 text-left"
      >
        <ToolIcon name={step.name} className="h-[14px] w-[14px] text-[var(--color-muted)]" />
        <span className="text-[12.5px] font-medium text-[#e0e0e0]">{label}</span>
        {step.path && (
          <span className="truncate font-mono text-[11.5px] text-[var(--color-muted)]">
            {step.path}
          </span>
        )}
        {stat && (
          <span className="ml-1 flex-shrink-0 font-mono text-[11px]">
            <span className="text-[var(--color-success)]">+{stat.added}</span>{" "}
            <span className="text-[var(--color-danger)]">-{stat.removed}</span>
          </span>
        )}
        <span className="ml-auto flex flex-shrink-0 items-center gap-2">
          <StatusDot status={step.status} />
          {expandable &&
            (showBody ? (
              <IconChevronDown className="h-3.5 w-3.5 text-[var(--color-faint)]" />
            ) : (
              <IconChevronRight className="h-3.5 w-3.5 text-[var(--color-faint)]" />
            ))}
        </span>
      </button>

      {showBody && (
        <div className="border-t border-[var(--color-border)] bg-[var(--color-bg)]">
          {isWrite ? (
            diff.length > 0 ? (
              <DiffView lines={diff} />
            ) : null
          ) : (
            <pre className="selectable max-h-[260px] overflow-auto px-3 py-2 font-mono text-[12px] leading-[1.5] text-[#cfcfcf]">
              {step.result}
            </pre>
          )}
        </div>
      )}

      {awaiting && (
        <div className="flex items-center gap-2 border-t border-[var(--color-border)] px-3 py-2">
          <span className="mr-auto text-[12px] text-[var(--color-muted)]">
            Применить изменение?
          </span>
          <button
            onClick={() => resolvePermission(false)}
            className="rounded-lg border border-[var(--color-border-strong)] px-3 py-1.5 text-[12px] text-[var(--color-muted)] transition-colors hover:text-white"
          >
            Отклонить
          </button>
          <button
            onClick={() => resolvePermission(true)}
            className="rounded-lg bg-white px-3 py-1.5 text-[12px] font-medium text-black transition-opacity hover:opacity-90"
          >
            Применить
          </button>
        </div>
      )}
    </div>
  );
}
