import { type ReactNode, useEffect, useState } from "react";
import { useApp } from "../store/app";
import { PROVIDER_PRESETS } from "../lib/presets";
import { displayModelName } from "../lib/format";
import { Select } from "./Select";
import {
  IconBell,
  IconClose,
  IconCpu,
  IconGlobe,
  IconHome,
  IconInfo,
  IconKeyboard,
  IconPalette,
  IconPlus,
  IconServer,
  IconShield,
  IconSliders,
  IconSparkle,
  IconTrash,
} from "./icons";

type Section =
  | "general"
  | "customization"
  | "agent"
  | "permissions"
  | "notifications"
  | "hotkeys"
  | "providers"
  | "models"
  | "about";

const NAV: {
  group: string;
  items: {
    id: Section;
    label: string;
    icon: (p: { className?: string }) => ReactNode;
  }[];
}[] = [
  {
    group: "Основное",
    items: [
      { id: "general", label: "Основные", icon: IconHome },
    ],
  },
  {
    group: "Приложение",
    items: [
      { id: "customization", label: "Кастомизация", icon: IconPalette },
      { id: "notifications", label: "Уведомления", icon: IconBell },
      { id: "hotkeys", label: "Хоткеи", icon: IconKeyboard },
    ],
  },
  {
    group: "Агент",
    items: [
      { id: "agent", label: "Настройки агента", icon: IconCpu },
      { id: "permissions", label: "Разрешения", icon: IconShield },
    ],
  },
  {
    group: "Сервер",
    items: [
      { id: "providers", label: "Провайдеры", icon: IconServer },
      { id: "models", label: "Модели", icon: IconSparkle },
    ],
  },
  {
    group: "Другое",
    items: [{ id: "about", label: "О приложении", icon: IconInfo }],
  },
];

const APP_VERSION = "v0.2.0";

const inputCls =
  "rounded-md border border-[var(--color-border)] bg-[var(--color-bg)] px-2.5 py-2 text-[12.5px] outline-none transition-colors focus:border-[var(--color-faint)] placeholder:text-[var(--color-faint)]";

export function SettingsView() {
  const [section, setSection] = useState<Section>("general");
  const close = useApp((s) => s.setView);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close("chat");
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [close]);

  return (
    <div
      className="absolute inset-0 z-50 flex items-center justify-center bg-black/55 p-6 backdrop-blur-sm"
      onMouseDown={() => close("chat")}
    >
      <div
        className="relative flex h-[620px] max-h-[90vh] w-[860px] max-w-[92vw] overflow-hidden rounded-2xl border border-[var(--color-border-strong)] bg-[var(--color-bg)] shadow-[0_30px_80px_rgba(0,0,0,0.7)]"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <button
          onClick={() => close("chat")}
          aria-label="Закрыть"
          className="absolute right-3.5 top-3.5 z-10 flex h-7 w-7 items-center justify-center rounded-lg text-[var(--color-muted)] transition-colors hover:bg-[var(--color-surface-2)] hover:text-[var(--color-text)]"
        >
          <IconClose className="h-4 w-4" />
        </button>
        {/* Sidebar */}
        <aside className="flex w-[220px] flex-col justify-between border-r border-[var(--color-border)] bg-[var(--color-rail)] px-3 py-5">
          <nav className="flex flex-col gap-5">
            {NAV.map((g) => (
              <div key={g.group || "extra"} className="flex flex-col gap-0.5">
                {g.group && (
                  <div className="px-2 pb-1.5 text-[11px] font-medium uppercase tracking-wider text-[var(--color-faint)]">
                    {g.group}
                  </div>
                )}
                {g.items.map((it) => {
                  const active = section === it.id;
                  const Icon = it.icon;
                  return (
                    <button
                      key={it.id}
                      onClick={() => setSection(it.id)}
                      className={`flex items-center gap-2.5 rounded-lg px-2.5 py-[7px] text-[13px] transition-colors ${
                        active
                          ? "bg-[var(--color-surface-2)] font-medium text-[var(--color-text)]"
                          : "text-[var(--color-muted)] hover:bg-[var(--color-surface)] hover:text-[var(--color-text)]"
                      }`}
                    >
                      <Icon
                        className={`h-[15px] w-[15px] ${
                          active ? "text-[var(--color-text)]" : "text-[var(--color-faint)]"
                        }`}
                      />
                      {it.label}
                    </button>
                  );
                })}
              </div>
            ))}
          </nav>

          <div className="px-2">
            <div className="text-[12px] font-semibold text-[var(--color-text)]">DapohCode</div>
            <div className="text-[11px] text-[var(--color-faint)]">{APP_VERSION}</div>
          </div>
        </aside>

        {/* Main panel */}
        <div className="min-w-0 flex-1 overflow-y-auto px-8 py-7">
          <div className="mx-auto max-w-2xl">
            {section === "general" && <GeneralSection />}
            {section === "customization" && <CustomizationSection />}
            {section === "notifications" && <NotificationsSection />}
            {section === "hotkeys" && <HotkeysSection />}
            {section === "agent" && <AgentSection />}
            {section === "permissions" && <PermissionsSection />}
            {section === "providers" && <ProvidersSection />}
            {section === "models" && <ModelsSection />}
            {section === "about" && <AboutSection />}
          </div>
        </div>
      </div>
    </div>
  );
}

/* ───────────────────────── Shared ───────────────────────── */

function SectionTitle({ title, sub }: { title: string; sub?: string }) {
  return (
    <div className="mb-6">
      <h1 className="text-[19px] font-semibold tracking-tight text-[var(--color-text)]">{title}</h1>
      {sub && (
        <p className="mt-1 text-[12.5px] text-[var(--color-muted)]">{sub}</p>
      )}
    </div>
  );
}

function Toggle({ on, onClick }: { on: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={`relative h-[21px] w-[38px] flex-shrink-0 rounded-full border transition-colors ${
        on
          ? "border-transparent bg-[var(--color-accent)]"
          : "border-[var(--color-border-strong)] bg-[var(--color-surface-2)]"
      }`}
      aria-pressed={on}
    >
      <span
        className={`absolute top-[2px] h-[15px] w-[15px] rounded-full transition-all ${
          on ? "left-[19px] bg-[var(--color-bg)]" : "left-[2px] bg-[#777]"
        }`}
      />
    </button>
  );
}

function SettingRow({
  label,
  description,
  children,
  noBorder,
}: {
  label: string;
  description?: string;
  children: ReactNode;
  noBorder?: boolean;
}) {
  return (
    <div
      className={`flex items-start gap-4 py-4 ${
        noBorder ? "" : "border-t border-[var(--color-border)]"
      }`}
    >
      <div className="min-w-0 flex-1">
        <div className="text-[12.5px] font-medium text-[var(--color-text)]">{label}</div>
        {description && (
          <p className="mt-1 text-[11.5px] leading-relaxed text-[var(--color-faint)]">
            {description}
          </p>
        )}
      </div>
      <div className="flex shrink-0 items-center">{children}</div>
    </div>
  );
}

/* ───────────────────────── General ───────────────────────── */

function GeneralSection() {
  const language = useApp((s) => s.language);
  const setLanguage = useApp((s) => s.setLanguage);

  return (
    <div>
      <SectionTitle title="Основные" sub="Основные параметры приложения." />
      <div className="flex flex-col">
        <SettingRow
          label="Язык интерфейса"
          description="Язык отображения интерфейса и ответов агента."
          noBorder
        >
          <div className="flex items-center gap-2">
            <IconGlobe className="h-4 w-4 text-[var(--color-faint)]" />
            <div className="flex overflow-hidden rounded-lg border border-[var(--color-border)]">
              {(["ru", "en"] as const).map((lang) => (
                <button
                  key={lang}
                  onClick={() => setLanguage(lang)}
                  className={`px-3.5 py-1.5 text-[12px] transition-colors ${
                    language === lang
                      ? "bg-[var(--color-surface-2)] font-medium text-[var(--color-text)]"
                      : "text-[var(--color-muted)] hover:text-[var(--color-text)]"
                  } ${lang === "ru" ? "border-r border-[var(--color-border)]" : ""}`}
                >
                  {lang === "ru" ? "Русский" : "English"}
                </button>
              ))}
            </div>
          </div>
        </SettingRow>
      </div>
    </div>
  );
}

/* ───────────────────────── Customization (was Appearance) ───────────────────────── */

function CustomizationSection() {
  const theme = useApp((s) => s.theme);
  const setTheme = useApp((s) => s.setTheme);

  return (
    <div>
      <SectionTitle title="Кастомизация" sub="Тема интерфейса и визуальные настройки." />
      <div className="flex flex-col">
        <SettingRow label="Тема" description="Цветовая схема интерфейса." noBorder>
          <div className="flex gap-2">
            {(["dark", "light", "system"] as const).map((t) => (
              <button
                key={t}
                onClick={() => setTheme(t)}
                className={`rounded-lg border px-3 py-1.5 text-[12px] transition-colors ${
                  theme === t
                    ? "border-[var(--color-accent)]/30 bg-[var(--color-surface-2)] font-medium text-[var(--color-text)]"
                    : "border-[var(--color-border)] text-[var(--color-muted)] hover:border-[var(--color-border-strong)] hover:text-[var(--color-text)]"
                }`}
              >
                {t === "dark" ? "Тёмная" : t === "light" ? "Светлая" : "Системная"}
              </button>
            ))}
          </div>
        </SettingRow>
      </div>
    </div>
  );
}

/* ───────────────────────── Notifications ───────────────────────── */

function NotificationsSection() {
  const notifyOnComplete = useApp((s) => s.notifyOnComplete);
  const setNotifyOnComplete = useApp((s) => s.setNotifyOnComplete);

  return (
    <div>
      <SectionTitle title="Уведомления" sub="Звуковые и системные уведомления." />
      <div className="flex flex-col">
        <SettingRow
          label="Звук при завершении"
          description="Проигрывать звуковой сигнал когда агент завершит выполнение задачи."
          noBorder
        >
          <Toggle on={notifyOnComplete} onClick={() => setNotifyOnComplete(!notifyOnComplete)} />
        </SettingRow>
      </div>
    </div>
  );
}

/* ───────────────────────── Agent ───────────────────────── */

function AgentSection() {
  const compactMode = useApp((s) => s.compactMode);
  const setCompactMode = useApp((s) => s.setCompactMode);
  const showThinking = useApp((s) => s.showThinking);
  const setShowThinking = useApp((s) => s.setShowThinking);

  return (
    <div>
      <SectionTitle title="Настройки агента" sub="Параметры поведения AI-агента." />
      <div className="flex flex-col">
        <SettingRow
          label="Компактные ответы"
          description="Агент отвечает короче и по делу, без развёрнутых пояснений. Экономит токены."
          noBorder
        >
          <Toggle on={compactMode} onClick={() => setCompactMode(!compactMode)} />
        </SettingRow>
        <SettingRow
          label="Показывать размышления"
          description="Отображать процесс мышления модели (reasoning tokens) приглушённым текстом. Если выключено — просто индикатор «Думаю…»."
        >
          <Toggle on={showThinking} onClick={() => setShowThinking(!showThinking)} />
        </SettingRow>
      </div>
    </div>
  );
}

/* ───────────────────────── Permissions ───────────────────────── */

function PermissionsSection() {
  const autoApply = useApp((s) => s.autoApply);
  const setAutoApply = useApp((s) => s.setAutoApply);

  return (
    <div>
      <SectionTitle title="Разрешения" sub="Контроль над тем, что агент может делать без подтверждения." />
      <div className="flex flex-col">
        <SettingRow
          label="Авто-применение изменений"
          description="Агент записывает файлы и выполняет команды без запроса разрешения. Опасно — включайте только если доверяете модели."
          noBorder
        >
          <Toggle on={autoApply} onClick={() => setAutoApply(!autoApply)} />
        </SettingRow>
      </div>
    </div>
  );
}

/* ───────────────────────── Hotkeys ───────────────────────── */

const HOTKEYS: { keys: string[]; desc: string }[] = [
  { keys: ["Enter"], desc: "Отправить сообщение" },
  { keys: ["Shift", "Enter"], desc: "Перенос строки" },
  { keys: ["Esc"], desc: "Закрыть настройки / выпадающий список" },
];

function HotkeysSection() {
  return (
    <div>
      <SectionTitle title="Хоткеи" sub="Горячие клавиши приложения." />
      <div className="overflow-hidden rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)]">
        {HOTKEYS.map((h, i) => (
          <div
            key={h.desc}
            className={`flex items-center justify-between px-4 py-3 ${
              i !== HOTKEYS.length - 1
                ? "border-b border-[var(--color-border)]"
                : ""
            }`}
          >
            <span className="text-[12.5px] text-[var(--color-text)]">{h.desc}</span>
            <span className="flex items-center gap-1">
              {h.keys.map((k) => (
                <kbd
                  key={k}
                  className="rounded-md border border-[var(--color-border-strong)] bg-[var(--color-bg)] px-2 py-0.5 font-mono text-[11px] text-[var(--color-muted)]"
                >
                  {k}
                </kbd>
              ))}
            </span>
          </div>
        ))}
      </div>
      <p className="mt-3 text-[11.5px] text-[var(--color-faint)]">
        Настраиваемые сочетания появятся в следующих версиях.
      </p>
    </div>
  );
}

/* ───────────────────────── About ───────────────────────── */

function AboutSection() {
  const clearAllData = useApp((s) => s.clearAllData);
  const sessions = useApp((s) => s.sessions);
  const models = useApp((s) => s.models);
  const providers = useApp((s) => s.providers);
  const [confirmClear, setConfirmClear] = useState(false);

  return (
    <div>
      <SectionTitle title="О приложении" />

      <div className="mb-6 overflow-hidden rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)]">
        <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--color-border)]">
          <span className="text-[12.5px] text-[var(--color-muted)]">Версия</span>
          <span className="font-mono text-[12.5px] text-[var(--color-text)]">{APP_VERSION}</span>
        </div>
        <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--color-border)]">
          <span className="text-[12.5px] text-[var(--color-muted)]">Сессий</span>
          <span className="font-mono text-[12.5px] text-[var(--color-text)]">{sessions.length}</span>
        </div>
        <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--color-border)]">
          <span className="text-[12.5px] text-[var(--color-muted)]">Провайдеров</span>
          <span className="font-mono text-[12.5px] text-[var(--color-text)]">{providers.length}</span>
        </div>
        <div className="flex items-center justify-between px-4 py-3">
          <span className="text-[12.5px] text-[var(--color-muted)]">Моделей</span>
          <span className="font-mono text-[12.5px] text-[var(--color-text)]">{models.length}</span>
        </div>
      </div>

      <div className="rounded-2xl border border-[#3a2020] bg-[#1a1010] p-4">
        <div className="mb-2 flex items-center gap-2">
          <IconTrash className="h-4 w-4 text-[#e05050]" />
          <span className="text-[13px] font-medium text-[var(--color-text)]">Очистить все данные</span>
        </div>
        <p className="mb-3 text-[11.5px] text-[var(--color-faint)]">
          Удалить все сессии, провайдеров, модели и настройки. Это действие необратимо.
        </p>
        {!confirmClear ? (
          <button
            onClick={() => setConfirmClear(true)}
            className="rounded-md border border-[#5a2020] bg-[#2a1515] px-3.5 py-2 text-[12.5px] font-medium text-[#e05050] transition-colors hover:bg-[#3a2020]"
          >
            Удалить всё
          </button>
        ) : (
          <div className="flex items-center gap-2">
            <button
              onClick={() => clearAllData()}
              className="rounded-md bg-[#e05050] px-3.5 py-2 text-[12.5px] font-medium text-white transition-opacity hover:opacity-90"
            >
              Да, удалить
            </button>
            <button
              onClick={() => setConfirmClear(false)}
              className="rounded-md border border-[var(--color-border)] px-3.5 py-2 text-[12.5px] text-[var(--color-muted)] transition-colors hover:text-[var(--color-text)]"
            >
              Отмена
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

/* ───────────────────────── Providers ───────────────────────── */

function ProvidersSection() {
  const providers = useApp((s) => s.providers);
  const addProvider = useApp((s) => s.addProvider);
  const removeProvider = useApp((s) => s.removeProvider);
  const fetchModels = useApp((s) => s.fetchModels);

  const [connectIdx, setConnectIdx] = useState<number | null>(null);
  const [fName, setFName] = useState("");
  const [fBaseUrl, setFBaseUrl] = useState("");
  const [fKey, setFKey] = useState("");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");

  const openConnect = (idx: number) => {
    const preset = PROVIDER_PRESETS[idx];
    setConnectIdx(idx);
    setFName(preset.name === "Своё (Custom)" ? "" : preset.name);
    setFBaseUrl(preset.baseUrl);
    setFKey("");
    setNotice("");
  };

  const cancelConnect = () => setConnectIdx(null);

  const canConnect = fName.trim() && fBaseUrl.trim();
  const connect = async () => {
    if (!canConnect) return;
    setBusy(true);
    const id = addProvider({
      name: fName.trim(),
      baseUrl: fBaseUrl.trim(),
      apiKey: fKey.trim(),
    });
    const res = await fetchModels(id);
    setBusy(false);
    setConnectIdx(null);
    if (res.error) setNotice(`Подключено, но модели не загрузились: ${res.error}`);
    else setNotice(`Подключено: ${fName.trim()} · моделей ${res.added} ✓`);
  };

  return (
    <div>
      {providers.length > 0 && (
        <div className="mb-8">
          <h2 className="mb-3 text-[13px] font-semibold text-[var(--color-muted)]">
            Подключённые провайдеры
          </h2>
          <div className="overflow-hidden rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)]">
            {providers.map((p, i) => {
              const isPreset = PROVIDER_PRESETS.some((pr) => pr.name === p.name);
              return (
                <div
                  key={p.id}
                  className={`flex items-center gap-3 px-4 py-3.5 ${
                    i !== providers.length - 1
                      ? "border-b border-[var(--color-border)]"
                      : ""
                  }`}
                >
                  <IconServer className="h-[16px] w-[16px] shrink-0 text-[var(--color-muted)]" />
                  <span className="truncate text-[13px] font-medium text-[var(--color-text)]">
                    {p.name}
                  </span>
                  <span className="shrink-0 rounded border border-[var(--color-border-strong)] px-1.5 py-0.5 text-[10.5px] text-[var(--color-muted)]">
                    {isPreset ? "API ключ" : "Пользовательский"}
                  </span>
                  <button
                    onClick={() => removeProvider(p.id)}
                    className="ml-auto shrink-0 text-[12.5px] text-[var(--color-muted)] transition-colors hover:text-[var(--color-text)]"
                  >
                    Отключить
                  </button>
                </div>
              );
            })}
          </div>
          {notice && (
            <div className="mt-2 text-[11.5px] text-[var(--color-faint)]">
              {notice}
            </div>
          )}
        </div>
      )}

      <SectionTitle title="Провайдеры" sub="Выберите провайдера для подключения." />
      <div className="overflow-hidden rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)]">
        {PROVIDER_PRESETS.map((preset, i) => {
          const open = connectIdx === i;
          return (
            <div
              key={preset.name}
              className={
                i !== PROVIDER_PRESETS.length - 1
                  ? "border-b border-[var(--color-border)]"
                  : ""
              }
            >
              <div className="flex items-center gap-3 px-4 py-3.5">
                <IconServer className="h-[16px] w-[16px] shrink-0 text-[var(--color-muted)]" />
                <span className="truncate text-[13px] font-medium text-[var(--color-text)]">
                  {preset.name}
                </span>
                <button
                  onClick={() => (open ? cancelConnect() : openConnect(i))}
                  className="ml-auto shrink-0 text-[12.5px] text-[var(--color-muted)] transition-colors hover:text-[var(--color-text)]"
                >
                  {open ? "Отмена" : "Подключить"}
                </button>
              </div>

              {open && (
                <div className="flex flex-col gap-2.5 border-t border-[var(--color-border)] bg-[var(--color-bg)] px-4 py-4">
                  <input
                    value={fName}
                    onChange={(e) => setFName(e.target.value)}
                    placeholder="Название (как показывать)"
                    className={inputCls}
                  />
                  <input
                    value={fBaseUrl}
                    onChange={(e) => setFBaseUrl(e.target.value)}
                    placeholder="Base URL (https://integrate.api.nvidia.com/v1)"
                    className={`${inputCls} font-mono`}
                  />
                  <input
                    value={fKey}
                    onChange={(e) => setFKey(e.target.value)}
                    type="password"
                    placeholder="API key"
                    className={`${inputCls} font-mono`}
                  />
                  {preset.hint && (
                    <div className="text-[11px] text-[var(--color-faint)]">
                      {preset.hint}
                    </div>
                  )}
                  <button
                    onClick={() => void connect()}
                    disabled={!canConnect || busy}
                    className="self-start rounded-md bg-[var(--color-accent)] px-3.5 py-2 text-[12.5px] font-medium text-[var(--color-bg)] transition-opacity disabled:opacity-30"
                  >
                    {busy ? "Подключение…" : "Подключить"}
                  </button>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ───────────────────────── Models ───────────────────────── */

function ModelsSection() {
  const providers = useApp((s) => s.providers);
  const models = useApp((s) => s.models);
  const addModel = useApp((s) => s.addModel);
  const removeModel = useApp((s) => s.removeModel);

  const [mProviderId, setMProviderId] = useState("");
  const [mModelId, setMModelId] = useState("");
  const [mLabel, setMLabel] = useState("");
  const [showForm, setShowForm] = useState(false);

  const effectiveProviderId = mProviderId || providers[0]?.id || "";
  const canAdd = effectiveProviderId && mModelId.trim();
  const submit = () => {
    if (!canAdd) return;
    addModel({
      providerId: effectiveProviderId,
      modelId: mModelId.trim(),
      label: mLabel.trim() || displayModelName(mModelId.trim()),
    });
    setMModelId("");
    setMLabel("");
    setShowForm(false);
  };

  return (
    <div>
      <SectionTitle title="Модели" sub="Доступные для выбора в чате модели." />

      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-[13px] font-semibold text-[var(--color-muted)]">
          Подключённые модели
        </h2>
        <button
          onClick={() => setShowForm((v) => !v)}
          disabled={providers.length === 0}
          className="flex items-center gap-1.5 rounded-md border border-[var(--color-border-strong)] px-2.5 py-1.5 text-[12px] text-[var(--color-text)] transition-colors hover:bg-[var(--color-surface-2)] disabled:opacity-40"
        >
          <IconPlus className="h-[13px] w-[13px]" />
          Добавить
        </button>
      </div>

      {models.length === 0 ? (
        <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-6 text-center text-[12.5px] text-[var(--color-faint)]">
          Моделей нет — нажмите «загрузить модели» у провайдера или добавьте
          вручную.
        </div>
      ) : (
        <div className="overflow-hidden rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)]">
          {models.map((m, i) => {
            const prov = providers.find((p) => p.id === m.providerId);
            return (
              <div
                key={m.id}
                className={`flex items-center gap-3 px-4 py-3 ${
                  i !== models.length - 1
                    ? "border-b border-[var(--color-border)]"
                    : ""
                }`}
              >
                <IconSparkle className="h-[15px] w-[15px] shrink-0 text-[var(--color-muted)]" />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-[13px] font-medium text-[var(--color-text)]">
                    {displayModelName(m.label)}
                  </div>
                  <div className="truncate font-mono text-[11px] text-[var(--color-faint)]">
                    {m.modelId} · {prov?.name ?? "провайдер удалён"}
                  </div>
                </div>
                <button
                  onClick={() => removeModel(m.id)}
                  className="shrink-0 text-[12px] text-[var(--color-muted)] transition-colors hover:text-[var(--color-danger)]"
                >
                  Удалить
                </button>
              </div>
            );
          })}
        </div>
      )}

      {showForm && providers.length > 0 && (
        <div className="mt-4 flex flex-col gap-2.5 rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4">
          <div className="text-[12.5px] font-medium text-[var(--color-text)]">
            Новая модель
          </div>
          <Select
            value={effectiveProviderId}
            onChange={(v) => setMProviderId(v)}
            options={providers.map((p) => ({ value: p.id, label: p.name }))}
          />
          <input
            value={mModelId}
            onChange={(e) => setMModelId(e.target.value)}
            placeholder="ID модели (meta/llama-3.1-405b-instruct)"
            className={`${inputCls} font-mono`}
          />
          <input
            value={mLabel}
            onChange={(e) => setMLabel(e.target.value)}
            placeholder="Название в интерфейсе (необязательно)"
            className={inputCls}
          />
          <button
            onClick={submit}
            disabled={!canAdd}
            className="self-start rounded-md bg-[var(--color-accent)] px-3.5 py-2 text-[12.5px] font-medium text-[var(--color-bg)] transition-opacity disabled:opacity-30"
          >
            Добавить модель
          </button>
        </div>
      )}
    </div>
  );
}
