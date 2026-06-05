import { useEffect, useRef, useState } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { save } from "@tauri-apps/plugin-dialog";
import { useApp, estimateTokens, CONTEXT_WINDOW } from "../store/app";
import { useT } from "../lib/i18n";
import { writeTextFile } from "../lib/tauri";
import {
  IconClose,
  IconKebab,
  IconMaximize,
  IconMinimize,
} from "./icons";

const CIRC = 2 * Math.PI * 7; // ≈43.98 — circumference of r=7

export function Header() {
  const view = useApp((s) => s.view);
  const cur = useApp((s) =>
    s.sessions.find((x) => x.id === s.currentSessionId),
  );
  const compactSession = useApp((s) => s.compactSession);
  const deleteSession = useApp((s) => s.deleteSession);
  const renameSession = useApp((s) => s.renameSession);

  const t = useT();
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  // Context usage percentage (only re-renders when pct changes)
  const pct = useApp((s) => {
    const sess = s.sessions.find((x) => x.id === s.currentSessionId);
    if (!sess || sess.messages.length === 0) return 0;
    return Math.min(
      Math.round((estimateTokens(sess.messages) / CONTEXT_WINDOW) * 100),
      100,
    );
  });

  useEffect(() => {
    if (!menuOpen) return;
    const onDoc = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [menuOpen]);

  const minimize = () => void getCurrentWindow().minimize();
  const toggleMax = () => void getCurrentWindow().toggleMaximize();
  const close = () => void getCurrentWindow().close();

  const hasMessages = (cur?.messages.length ?? 0) > 0;
  const title =
    view === "settings" ? t("Настройки") : hasMessages ? cur?.title ?? "" : "";

  const onExport = async () => {
    setMenuOpen(false);
    if (!cur) return;
    const md = cur.messages
      .filter((m) => !m.error)
      .map((m) => {
        const prefix = m.role === "user" ? "## 👤 User" : "## 🤖 Assistant";
        return `${prefix}\n\n${m.content}`;
      })
      .join("\n\n---\n\n");
    const content = `# ${cur.title || "Chat"}\n\n${md}\n`;
    try {
      const filePath = await save({
        defaultPath: `${(cur.title || "chat").replace(/[^a-zA-Zа-яА-Я0-9_-]/g, "_")}.md`,
        filters: [{ name: "Markdown", extensions: ["md"] }],
      });
      if (filePath) await writeTextFile(filePath, content);
    } catch {
      /* cancelled */
    }
  };

  const onRename = () => {
    setMenuOpen(false);
    if (!cur) return;
    const next = window.prompt(t("Название чата"), cur.title ?? "");
    if (next && next.trim()) renameSession(cur.id, next.trim());
  };
  const onDelete = () => {
    setMenuOpen(false);
    if (cur) deleteSession(cur.id);
  };

  const offset = CIRC * (1 - pct / 100);

  return (
    <header
      data-tauri-drag-region
      className="relative flex h-[46px] flex-shrink-0 items-center px-[18px]"
    >
      <span className="pointer-events-none truncate text-[13px] font-semibold text-[#e8e8e8]">
        {title}
      </span>

      <div className="ml-auto flex items-center gap-3.5 text-[var(--color-muted)]">
        {view !== "settings" && (
          <div className="group relative">
            <button
              onClick={() => void compactSession()}
              title={`${t("Контекст")}: ${pct}%`}
              aria-label="Context usage"
              className="flex items-center justify-center transition-colors hover:text-white"
            >
              <svg
                width="17"
                height="17"
                viewBox="0 0 18 18"
                style={{ transform: "rotate(-90deg)" }}
              >
                <circle
                  cx="9"
                  cy="9"
                  r="7"
                  fill="none"
                  stroke="rgba(255,255,255,0.12)"
                  strokeWidth="1.8"
                />
                {pct > 0 && (
                  <circle
                    cx="9"
                    cy="9"
                    r="7"
                    fill="none"
                    stroke="white"
                    strokeWidth="1.8"
                    strokeLinecap="round"
                    strokeDasharray={CIRC}
                    strokeDashoffset={offset}
                    style={{ transition: "stroke-dashoffset 0.4s ease" }}
                  />
                )}
              </svg>
            </button>
            <div className="pointer-events-none absolute right-1/2 top-full z-50 mt-2 translate-x-1/2 whitespace-nowrap rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-1.5 text-[11.5px] text-[#ccc] opacity-0 shadow-lg transition-opacity group-hover:opacity-100">
              {t("Контекст")}: {pct}%
            </div>
          </div>
        )}

        {view !== "settings" && cur && (
          <div className="relative" ref={menuRef}>
            <button
              onClick={() => setMenuOpen((v) => !v)}
              title="Меню"
              aria-label="Menu"
              className="grid place-items-center transition-colors hover:text-white"
            >
              <IconKebab className="h-[18px] w-[18px]" />
            </button>
            {menuOpen && (
              <div className="absolute right-0 top-[26px] z-50 w-[170px] overflow-hidden rounded-lg border border-[var(--color-border-strong)] bg-[var(--color-surface)] py-1 text-[12.5px] text-[#d6d6d6] shadow-xl">
                <button
                  onClick={onRename}
                  className="block w-full px-3 py-2 text-left hover:bg-[var(--color-surface-2)]"
                >
                  {t("Переименовать")}
                </button>
                <button
                  onClick={onExport}
                  className="block w-full px-3 py-2 text-left hover:bg-[var(--color-surface-2)]"
                >
                  {t("Экспорт .md")}
                </button>
                <button
                  onClick={onDelete}
                  className="block w-full px-3 py-2 text-left text-[var(--color-danger)] hover:bg-[var(--color-surface-2)]"
                >
                  {t("Удалить чат")}
                </button>
              </div>
            )}
          </div>
        )}

        <div className="ml-1 flex items-center gap-4 text-[var(--color-faint)]">
          <button
            onClick={minimize}
            className="transition-colors hover:text-white"
            aria-label="Minimize"
          >
            <IconMinimize className="h-[13px] w-[13px]" />
          </button>
          <button
            onClick={toggleMax}
            className="transition-colors hover:text-white"
            aria-label="Maximize"
          >
            <IconMaximize className="h-[12px] w-[12px]" />
          </button>
          <button
            onClick={close}
            className="transition-colors hover:text-[#ff6b6b]"
            aria-label="Close"
          >
            <IconClose className="h-[13px] w-[13px]" />
          </button>
        </div>
      </div>
    </header>
  );
}
