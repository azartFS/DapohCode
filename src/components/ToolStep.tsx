import { useState } from "react";
import { useApp } from "../store/app";
import { useT } from "../lib/i18n";
import type { ToolStep } from "../types";
import type { DiffLine } from "../lib/diff";
import { diffStat } from "../lib/diff";
import {
  IconCheck,
  IconChevronDown,
  IconChevronRight,
  IconClose,
  IconDownload,
  IconFileText,
  IconGlobe,
  IconList,
  IconPencil,
  IconSearch,
  IconTrash,
} from "./icons";

const LABEL: Record<string, string> = {
  read_file: "Чтение",
  list_dir: "Список",
  list_tree: "Структура проекта",
  search_text: "Поиск",
  write_file: "Запись",
  edit_file: "Правка",
  delete_file: "Удаление",
  run_command: "Команда",
  grep: "Поиск (regex)",
  web_search: "Поиск в интернете",
  web_fetch: "Изучение страницы",
};

function ToolIcon({ name, className }: { name: string; className?: string }) {
  if (name === "list_dir") return <IconList className={className} />;
  if (name === "edit_file") return <IconPencil className={className} />;
  if (name === "search_text") return <IconSearch className={className} />;
  if (name === "delete_file") return <IconTrash className={className} />;
  if (name === "run_command") return <IconFileText className={className} />;
  if (name === "web_search") return <IconGlobe className={className} />;
  if (name === "web_fetch") return <IconDownload className={className} />;
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

/* ── web_search result parser ── */

interface SearchHit {
  num: string;
  title: string;
  url: string;
  snippet: string;
}

function parseSearchResults(raw: string): SearchHit[] {
  const hits: SearchHit[] = [];
  const blocks = raw.split(/\n\n+/);
  for (const block of blocks) {
    const lines = block.split("\n").map((l) => l.trim()).filter(Boolean);
    if (lines.length === 0) continue;
    // First line: "1. Title"
    const m = lines[0].match(/^(\d+)\.\s+(.+)/);
    if (!m) continue;
    hits.push({
      num: m[1],
      title: m[2],
      url: lines[1] ?? "",
      snippet: lines.slice(2).join(" "),
    });
  }
  return hits;
}

function SearchResultsView({ result }: { result: string }) {
  const hits = parseSearchResults(result);
  if (hits.length === 0) {
    return (
      <pre className="selectable max-h-[260px] overflow-auto px-3 py-2 font-mono text-[12px] leading-[1.5] text-[#cfcfcf]">
        {result}
      </pre>
    );
  }
  return (
    <div className="selectable max-h-[340px] overflow-y-auto py-1.5">
      {hits.map((h, i) => (
        <div
          key={i}
          className={`px-3.5 py-2 transition-colors hover:bg-[var(--color-surface-2)] ${
            i > 0 ? "border-t border-[color-mix(in_srgb,var(--color-border)_50%,transparent)]" : ""
          }`}
        >
          <div className="flex items-baseline gap-1.5 text-[13px] font-medium leading-[1.35] text-[#7cacf8]">
            <span className="text-[11px] font-normal text-[var(--color-faint)] tabular-nums shrink-0">
              {h.num}
            </span>
            <span>{h.title}</span>
          </div>
          {h.url && (
            <div className="mt-0.5 truncate font-mono text-[11px] leading-[1.4] text-[var(--color-faint)]">
              {h.url}
            </div>
          )}
          {h.snippet && (
            <div className="mt-0.5 text-[12.5px] leading-[1.45] text-[var(--color-muted)] line-clamp-2">
              {h.snippet}
            </div>
          )}
        </div>
      ))}
      <div className="px-3.5 py-1 text-[11px] text-[var(--color-faint)]">
        {hits.length} {hits.length === 1 ? "результат" : hits.length < 5 ? "результата" : "результатов"}
      </div>
    </div>
  );
}

/* ── web_fetch result view ── */

function FetchResultView({ result, url }: { result: string; url?: string }) {
  const charCount = result.length;
  const fmtCount =
    charCount >= 1000
      ? `${Math.round(charCount / 1000)} к символов`
      : `${charCount} символов`;

  // Shorten URL for display chip
  let shortUrl = url ?? "";
  try {
    if (shortUrl) {
      const u = new URL(shortUrl);
      const path = u.pathname.length > 30 ? u.pathname.slice(0, 27) + "…" : u.pathname;
      shortUrl = u.host + path;
    }
  } catch {
    // keep as-is
  }

  return (
    <div className="selectable max-h-[320px] overflow-y-auto">
      {(shortUrl || charCount > 0) && (
        <div className="flex items-center gap-1.5 px-3.5 pt-2 pb-1 text-[11px] text-[var(--color-faint)]">
          {shortUrl && (
            <span className="truncate max-w-[400px] rounded bg-[var(--color-surface-2)] px-2 py-0.5 font-mono text-[10.5px] text-[var(--color-muted)]">
              {shortUrl}
            </span>
          )}
          <span className="tabular-nums">· {fmtCount}</span>
        </div>
      )}
      <div className="whitespace-pre-wrap break-words px-3.5 pb-2.5 pt-1 text-[12.5px] leading-[1.55] text-[#c8c8c8]">
        {result}
      </div>
    </div>
  );
}

/* ── Main card ── */

export function ToolStepCard({ step }: { step: ToolStep }) {
  const t = useT();
  const pendingPerm = useApp((s) => s.pendingPerm);
  const resolvePermission = useApp((s) => s.resolvePermission);
  const isWrite =
    step.name === "write_file" ||
    step.name === "edit_file" ||
    step.name === "delete_file" ||
    step.name === "run_command";
  const isWebSearch = step.name === "web_search";
  const isWebFetch = step.name === "web_fetch";
  const awaiting = pendingPerm?.stepId === step.id;
  const [open, setOpen] = useState(isWrite);

  const diff = isWrite ? parseDiff(step.diff) : [];
  const stat = diff.length ? diffStat(diff) : null;
  const label = t(LABEL[step.name] ?? step.name);
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
          ) : isWebSearch && step.result ? (
            <SearchResultsView result={step.result} />
          ) : isWebFetch && step.result ? (
            <FetchResultView result={step.result} url={step.path} />
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
            {t("Применить изменение?")}
          </span>
          <button
            onClick={() => resolvePermission(false)}
            className="rounded-lg border border-[var(--color-border-strong)] px-3 py-1.5 text-[12px] text-[var(--color-muted)] transition-colors hover:text-white"
          >
            {t("Отклонить")}
          </button>
          <button
            onClick={() => resolvePermission(true)}
            className="rounded-lg bg-white px-3 py-1.5 text-[12px] font-medium text-black transition-opacity hover:opacity-90"
          >
            {t("Применить")}
          </button>
        </div>
      )}
    </div>
  );
}
