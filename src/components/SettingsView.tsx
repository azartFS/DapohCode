import { type ReactNode, useEffect, useState } from "react";
import { useApp } from "../store/app";
import { PROVIDER_PRESETS } from "../lib/presets";
import { displayModelName } from "../lib/format";
import { Select } from "./Select";
import {
  IconClose,
  IconKeyboard,
  IconPlus,
  IconServer,
  IconSliders,
  IconSparkle,
} from "./icons";

type Section = "general" | "hotkeys" | "providers" | "models";

const NAV: {
  group: string;
  items: {
    id: Section;
    label: string;
    icon: (p: { className?: string }) => ReactNode;
  }[];
}[] = [
  {
    group: "Приложение",
    items: [
      { id: "general", label: "Основные", icon: IconSliders },
      { id: "hotkeys", label: "Хоткеи", icon: IconKeyboard },
    ],
  },
  {
    group: "Сервер",
    items: [
      { id: "providers", label: "Провайдеры", icon: IconServer },
      { id: "models", label: "Модели", icon: IconSparkle },
    ],
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
        className="relative flex h-[560px] max-h-[88vh] w-[840px] max-w-[92vw] overflow-hidden rounded-2xl border border-[var(--color-border-strong)] bg-[var(--color-bg)] shadow-[0_30px_80px_rgba(0,0,0,0.7)]"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <button
          onClick={() => close("chat")}
          aria-label="Закрыть"
          className="absolute right-3.5 top-3.5 z-10 flex h-7 w-7 items-center justify-center rounded-lg text-[var(--color-muted)] transition-colors hover:bg-[var(--color-surface-2)] hover:text-white"
        >
          <IconClose className="h-4 w-4" />
        </button>
        {/* Sidebar */}
        <aside className="flex w-[220px] flex-col justify-between border-r border-[var(--color-border)] bg-[var(--color-rail)] px-3 py-5">
        <nav className="flex flex-col gap-6">
          {NAV.map((g) => (
            <div key={g.group} className="flex flex-col gap-1">
              <div className="px-2 pb-1 text-[11px] font-medium uppercase tracking-wider text-[var(--color-faint)]">
                {g.group}
              </div>
              {g.items.map((it) => {
                const active = section === it.id;
                const Icon = it.icon;
                return (
                  <button
                    key={it.id}
                    onClick={() => setSection(it.id)}
                    className={`flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-[13px] transition-colors ${
                      active
                        ? "bg-[var(--color-surface-2)] font-medium text-white"
                        : "text-[var(--color-muted)] hover:bg-[var(--color-surface)] hover:text-white"
                    }`}
                  >
                    <Icon
                      className={`h-[15px] w-[15px] ${
                        active ? "text-white" : "text-[var(--color-faint)]"
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
          <div className="text-[12px] font-semibold text-[#cfcfcf]">DapohCode</div>
          <div className="text-[11px] text-[var(--color-faint)]">{APP_VERSION}</div>
        </div>
      </aside>

      {/* Main panel */}
      <div className="min-w-0 flex-1 overflow-y-auto px-8 py-7">
        <div className="mx-auto max-w-2xl">
          {section === "general" && <GeneralSection />}
          {section === "hotkeys" && <HotkeysSection />}
          {section === "providers" && <ProvidersSection />}
          {section === "models" && <ModelsSection />}
        </div>
      </div>
      </div>
    </div>
  );
}

function SectionTitle({ title, sub }: { title: string; sub?: string }) {
  return (
    <div className="mb-6">
      <h1 className="text-[19px] font-semibold tracking-tight">{title}</h1>
      {sub && (
        <p className="mt-1 text-[12.5px] text-[var(--color-muted)]">{sub}</p>
      )}
    </div>
  );
}

/* ───────────────────────── General ───────────────────────── */

function Toggle({
  on,
  onClick,
}: {
  on: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`relative h-[21px] w-[38px] flex-shrink-0 rounded-full border transition-colors ${
        on
          ? "border-transparent bg-white"
          : "border-[var(--color-border-strong)] bg-[var(--color-surface-2)]"
      }`}
      aria-pressed={on}
    >
      <span
        className={`absolute top-[2px] h-[15px] w-[15px] rounded-full transition-all ${
          on ? "left-[19px] bg-black" : "left-[2px] bg-[#777]"
        }`}
      />
    </button>
  );
}

/** Divider row between setting groups. */
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
        <div className="text-[12.5px] font-medium text-[#e8e8e8]">{label}</div>
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

const EFFORT_OPTIONS: { value: string; label: string }[] = [
  { value: "minimal", label: "Минимальная" },
  { value: "low", label: "Низкая" },
  { value: "medium", label: "Средняя" },
  { value: "high", label: "Высокая" },
];

function GeneralSection() {
  const autoApply = useApp((s) => s.autoApply);
  const setAutoApply = useApp((s) => s.setAutoApply);
  const temperature = useApp((s) => s.temperature);
  const setTemperature = useApp((s) => s.setTemperature);
  const reasoningEffort = useApp((s) => s.reasoningEffort);
  const setReasoningEffort = useApp((s) => s.setReasoningEffort);

  return (
    <div>
      <SectionTitle title="Основные" sub="Параметры модели и поведения агента." />
      <div className="flex flex-col">
        {/* Temperature */}
        <SettingRow
          label="Температура"
          description="Креативность ответов модели. 0 — детерминированно, 1 — баланс, 2 — максимальная вариативность."
          noBorder
        >
          <div className="flex items-center gap-3">
            <input
              type="range"
              min="0"
              max="2"
              step="0.1"
              value={temperature}
              onChange={(e) => setTemperature(parseFloat(e.target.value))}
              className="h-1 w-[120px] cursor-pointer appearance-none rounded-full bg-[var(--color-surface-2)] accent-white [&::-webkit-slider-thumb]:h-3.5 [&::-webkit-slider-thumb]:w-3.5 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-white"
            />
            <span className="w-[32px] text-right font-mono text-[12px] text-[var(--color-muted)]">
              {temperature.toFixed(1)}
            </span>
          </div>
        </SettingRow>

        {/* Reasoning effort */}
        <SettingRow
          label="Глубина мышления"
          description="Сколько ресурсов модель тратит на рассуждения. Работает только с моделями, поддерживающими reasoning."
        >
          <select
            value={reasoningEffort}
            onChange={(e) =>
              setReasoningEffort(
                e.target.value as "minimal" | "low" | "medium" | "high",
              )
            }
            className="rounded-md border border-[var(--color-border)] bg-[var(--color-bg)] px-2.5 py-1.5 text-[12.5px] outline-none transition-colors focus:border-[var(--color-faint)]"
          >
            {EFFORT_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </SettingRow>

        {/* Auto-apply */}
        <SettingRow
          label="Авто-применение"
          description="Агент применяет изменения в файлы и выполняет команды без запроса разрешения."
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
  { keys: ["Esc"], desc: "Закрыть выпадающий список" },
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
            <span className="text-[12.5px] text-[#e8e8e8]">{h.desc}</span>
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

/* ───────────────────────── Providers ───────────────────────── */

function ProvidersSection() {
  const providers = useApp((s) => s.providers);
  const addProvider = useApp((s) => s.addProvider);
  const removeProvider = useApp((s) => s.removeProvider);
  const fetchModels = useApp((s) => s.fetchModels);

  // Inline connect form, opened from a catalogue row.
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
      {/* Connected providers (only when there are any) */}
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
                  <span className="truncate text-[13px] font-medium text-white">
                    {p.name}
                  </span>
                  <span className="shrink-0 rounded border border-[var(--color-border-strong)] px-1.5 py-0.5 text-[10.5px] text-[var(--color-muted)]">
                    {isPreset ? "API ключ" : "Пользовательский"}
                  </span>
                  <button
                    onClick={() => removeProvider(p.id)}
                    className="ml-auto shrink-0 text-[12.5px] text-[var(--color-muted)] transition-colors hover:text-white"
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

      {/* Catalogue of all available providers */}
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
                <span className="truncate text-[13px] font-medium text-white">
                  {preset.name}
                </span>
                <button
                  onClick={() => (open ? cancelConnect() : openConnect(i))}
                  className="ml-auto shrink-0 text-[12.5px] text-[var(--color-muted)] transition-colors hover:text-white"
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
                    className="self-start rounded-md bg-white px-3.5 py-2 text-[12.5px] font-medium text-black transition-opacity disabled:opacity-30"
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
          className="flex items-center gap-1.5 rounded-md border border-[var(--color-border-strong)] px-2.5 py-1.5 text-[12px] text-[#e8e8e8] transition-colors hover:bg-[var(--color-surface-2)] disabled:opacity-40"
        >
          <IconPlus className="h-[13px] w-[13px] " />
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
                  <div className="truncate text-[13px] font-medium text-white">
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
          <div className="text-[12.5px] font-medium text-[#e8e8e8]">
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
            className="self-start rounded-md bg-white px-3.5 py-2 text-[12.5px] font-medium text-black transition-opacity disabled:opacity-30"
          >
            Добавить модель
          </button>
        </div>
      )}
    </div>
  );
}
