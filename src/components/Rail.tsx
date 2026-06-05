import { useApp } from "../store/app";
import type { Session } from "../types";
import { IconPlus, IconSettings, IconTerminal } from "./icons";

const COLORS = [
  "#a21caf",
  "#6b7a18",
  "#7f1d1d",
  "#1d4ed8",
  "#0d9488",
  "#6d28d9",
  "#15803d",
  "#7c3aed",
  "#b45309",
  "#0369a1",
  "#be185d",
  "#4d7c0f",
];

function colorFor(id: string): string {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  return COLORS[h % COLORS.length];
}

function letterFor(s: Session): string {
  const base = (s.folderName || s.title || "").trim();
  return base ? base[0].toUpperCase() : "#";
}

export function Rail() {
  const sessions = useApp((s) => s.sessions);
  const currentSessionId = useApp((s) => s.currentSessionId);
  const view = useApp((s) => s.view);
  const selectSession = useApp((s) => s.selectSession);
  const setView = useApp((s) => s.setView);
  const createChatInFolder = useApp((s) => s.createChatInFolder);

  return (
    <aside className="flex w-[54px] flex-shrink-0 flex-col items-center gap-2 border-r border-[var(--color-border)] bg-[var(--color-rail)] py-2.5">
      <div className="no-scrollbar flex flex-1 flex-col items-center gap-2 overflow-y-auto">
        {sessions.map((s) => {
          const active = s.id === currentSessionId && view !== "settings";
          return (
            <div
              key={s.id}
              className="relative flex w-full items-center justify-center"
            >
              {active && (
                <span className="absolute left-0 top-1/2 h-5 w-[3px] -translate-y-1/2 rounded-r bg-white" />
              )}
              <button
                onClick={() => selectSession(s.id)}
                title={s.folderName || s.title || "Чат"}
                className={`grid h-[34px] w-[34px] place-items-center rounded-[11px] text-[14px] font-bold text-white transition-opacity ${
                  active ? "opacity-100" : "opacity-55 hover:opacity-90"
                }`}
                style={{ background: colorFor(s.id) }}
              >
                {letterFor(s)}
              </button>
            </div>
          );
        })}

        <button
          onClick={() => void createChatInFolder()}
          title="Новый чат — выбрать папку"
          aria-label="New chat"
          className="grid h-[34px] w-[34px] place-items-center rounded-[10px] text-[var(--color-faint)] transition-colors hover:bg-[var(--color-surface-2)] hover:text-white"
        >
          <IconPlus className="h-[17px] w-[17px]" />
        </button>
      </div>

      <button
        onClick={() => setView(view === "settings" ? "chat" : "settings")}
        title="Настройки"
        aria-label="Settings"
        className={`grid h-[30px] w-[30px] place-items-center rounded-lg transition-colors ${
          view === "settings"
            ? "text-white"
            : "text-[var(--color-faint)] hover:text-white"
        }`}
      >
        <IconSettings className="h-[17px] w-[17px]" />
      </button>
      <button
        title="Терминал"
        aria-label="Terminal"
        className="grid h-[30px] w-[30px] place-items-center rounded-lg text-[var(--color-faint)] transition-colors hover:text-white"
      >
        <IconTerminal className="h-[17px] w-[17px]" />
      </button>
    </aside>
  );
}
