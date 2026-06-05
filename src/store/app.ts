import { create } from "zustand";
import type {
  ChatMessage,
  ModelCfg,
  Provider,
  ReasoningEffort,
  Session,
  ToolStep,
} from "../types";
import { displayModelName, supportsReasoning } from "../lib/format";
import {
  agentComplete,
  agentStream,
  cancelChat,
  chatOnce,
  chatStream,
  listModels,
  listReasoningModels,
  onAgentDelta,
  onAgentReasoningDelta,
  pickFolder,
} from "../lib/tauri";
import {
  AGENT_TOOLS,
  applyWrite,
  executeCommand,
  isCommandTool,
  isWriteTool,
  parseArgs,
  prepareWrite,
  runReadTool,
} from "../lib/agentTools";

// maxAgentSteps is now a persisted setting, read from store in runAgent.

/** Module-level agent-loop control (one loop at a time). */
let agentAbort = false;
let permResolver: ((ok: boolean) => void) | null = null;

function agentSystemPreamble(root: string, memoryContent?: string, compact?: boolean): string {
  const parts: string[] = [];

  // ── Identity ──
  parts.push(`Ты — DapohCode, элитный автономный AI-агент-программист. Ты работаешь НАПРЯМУЮ в проекте пользователя на его машине. Каждый твой вызов инструмента — это реальное действие: чтение реального файла, запись реального кода, выполнение реальной команды. Ты не симулируешь — ты делаешь.

Ты думаешь как senior-инженер с 20-летним опытом: сначала разбираешься, потом действуешь. Ты не угадываешь — ты проверяешь. Ты не повторяешь ошибки — ты адаптируешься.

Важно: всегда отвечай на том же языке, на котором написано последнее сообщение пользователя. Если пользователь пишет на английском — отвечай на английском. Если на русском — на русском.`);

  // ── Environment ──
  parts.push(`# Окружение
- Корень проекта: ${root}
- Все пути к файлам — относительно корня (напр. src/main.rs, не ${root}/src/main.rs)
- Операционная система: определяется по корню (\\\\= Windows, / = Unix)
- Для shell-команд используй синтаксис соответствующей ОС`);

  // ── Memory (DAPOH.md) ──
  if (memoryContent) {
    parts.push(`# Память проекта (DAPOH.md)
Следующий контекст загружен из DAPOH.md в корне проекта. Это инструкции и заметки от пользователя — следуй им:

${memoryContent}`);
  }

  // ── Tools (detailed) ──
  parts.push(`# Инструменты

## Навигация и поиск
- **list_tree(path?)** — полная рекурсивная структура проекта за один вызов. node_modules, .git, target, dist и т.п. пропускаются. ВСЕГДА начинай изучение проекта с этого.
- **list_dir(path?)** — содержимое одного каталога. Используй когда нужен один конкретный уровень.
- **search_text(query, path?)** — быстрый поиск подстроки по всему коду (регистронезависимо). Результат: path:line: текст.
- **grep(pattern, path?, glob?)** — поиск по регулярному выражению. Поддерживает фильтр по расширению (glob="*.ts"). Используй для сложных паттернов: определений функций, импортов, типов. Примеры: pattern="async fn \\w+" glob="*.rs", pattern="import.*zustand" glob="*.ts".
- **read_file(path)** — прочитать файл целиком. ОБЯЗАТЕЛЬНО читай файл перед любой правкой. Никогда не редактируй файл, который не прочитал.

## Редактирование
- **edit_file(path, old_string, new_string)** — точечная замена фрагмента. old_string ДОЛЖЕН совпадать ПОСИМВОЛЬНО (пробелы, табы, переносы). Должен встречаться РОВНО один раз в файле — включай достаточно контекстных строк для уникальности. Это предпочтительный способ правки.
- **write_file(path, content)** — создать новый файл или ПОЛНОСТЬЮ перезаписать. Передавай ВСЁ содержимое файла, не фрагмент. Используй для новых файлов или когда правок слишком много для edit_file.
- **delete_file(path)** — удалить файл. Необратимо. Убедись, что файл не используется.

## Выполнение
- **run_command(command, timeout_secs?)** — shell-команда в корне проекта. Используй для: сборки, тестов, установки зависимостей, git, линтера, проверки результата. Таймаут по умолчанию 120с, макс 300с.`);

  // ── Workflow ──
  parts.push(`# Как работать

## Параллельное выполнение
Все инструменты чтения (read_file, list_tree, search_text, grep) выполняются ПАРАЛЛЕЛЬНО в рамках одного ответа. Вызывай несколько read_file за раз — они отработают одновременно. Это значительно ускоряет анализ. Не стесняйся вызывать 5-10 инструментов чтения за один ход.

## Принцип: Сначала пойми, потом действуй
1. ПРОЧИТАЙ задачу внимательно. Определи, что именно нужно сделать.
2. ИЗУЧИ контекст: list_tree → read_file ключевых файлов → search_text для связей.
3. СПЛАНИРУЙ: мысленно разбей задачу на конкретные шаги.
4. ВЫПОЛНИ: каждый шаг — один осмысленный diff. Проверяй после критических изменений.
5. ПРОВЕРЬ: перечитай изменённые файлы. Если возможно — запусти сборку/тесты.

## При анализе / изучении проекта
Когда просят проанализировать, изучить, разобрать проект:
1. list_tree — увидеть всю структуру.
2. Прочитай ВСЕ значимые файлы: точки входа, конфиги, основные модули. Не ограничивайся 2-3 файлами.
3. search_text — проследи ключевые связи (импорты, вызовы, типы).
4. Дай ПОЛНЫЙ разбор: назначение, стек, архитектура, ключевые модули + как они связаны, точки входа, поток данных, замечания и рекомендации.

## При написании / правке кода
- НИКОГДА не выдумывай импорты, API, типы, пути. Прочитай — потом используй.
- Предпочитай edit_file для точечных правок. write_file — для новых файлов или полной перезаписи.
- Вноси МИНИМАЛЬНЫЕ сфокусированные изменения. Не трогай несвязанный код, не переформатируй.
- Строго соблюдай стиль, отступы, паттерны и соглашения проекта.
- Думай о крайних случаях, обработке ошибок, типизации.
- Не оставляй TODO и заглушки — реализуй полностью.
- Не ломай существующее: проверяй импорты, типы и зависимые модули.

## При ошибках
- Прочитай ошибку ВНИМАТЕЛЬНО. Пойми причину.
- Не повторяй тот же вызов — адаптируй подход.
- Если edit_file не нашёл строку — перечитай файл, найди актуальное содержимое.
- Если команда упала — проанализируй вывод, исправь причину, попробуй снова.`);

  // ── Communication ──
  parts.push(`# Общение с пользователем
- Отвечай на русском, кратко и по делу. Без воды, без извинений, без "Конечно, я могу...".
- Код в ответе — в блоках \\\`\\\`\\\` с указанием языка.
- По завершении — короткое резюме: что изменено, в каких файлах, почему.
- Не утверждай, что сделал то, чего не делал. Только реальные действия.
- Если задача неоднозначна — сделай разумное допущение и укажи его. Не спрашивай по мелочам.
- Действуй АВТОНОМНО: разбей задачу на шаги и доведи до конца. Спрашивай только при реальном риске потери данных или критической неоднозначности.${compact ? "\n\nРЕЖИМ КОМПАКТНЫХ ОТВЕТОВ: отвечай максимально кратко. Только код + одно предложение резюме. Без пояснений, рассуждений и преамбул. Экономь токены." : ""}`);

  // ── Quality ──
  parts.push(`# Стандарт качества
- Пиши код так, как будто его будут ревьюить senior-инженеры.
- Чистый, идиоматичный, рабочий код. Правильные имена, правильная структура.
- Учитывай edge cases и error handling.
- Один коммит = одна логическая единица работы.
- Если создаёшь файл — он должен быть полным и рабочим, не скелетом.`);

  return parts.join("\n\n");
}

/** Convert a stored display message into OpenAI-format API message(s). */
function toApiMessages(m: ChatMessage): Array<Record<string, unknown>> {
  if (m.role === "user") return [{ role: "user", content: m.content }];
  if (m.role === "assistant") {
    if (m.toolSteps && m.toolSteps.length > 0) {
      const out: Array<Record<string, unknown>> = [
        {
          role: "assistant",
          content: m.content || null,
          tool_calls: m.toolSteps.map((s) => ({
            id: s.id,
            type: "function",
            function: { name: s.name, arguments: s.args },
          })),
        },
      ];
      for (const s of m.toolSteps) {
        out.push({ role: "tool", tool_call_id: s.id, content: s.result ?? "" });
      }
      return out;
    }
    return [{ role: "assistant", content: m.content }];
  }
  return [];
}

/** basename of a path, handling both / and \\ separators. */
export function basename(path: string): string {
  const parts = path.split(/[\\/]+/).filter(Boolean);
  return parts[parts.length - 1] ?? path;
}

const STORE_KEY = "dapohcode.state.v1";

export type Mode = "solo";

interface Persisted {
  providers: Provider[];
  models: ModelCfg[];
  activeModelId: string | null;
  systemPrompt: string;
  temperature: number;
  reasoningEffort: ReasoningEffort;
  autoApply: boolean;
  sessions: Session[];
  currentSessionId: string | null;
  projectName: string | null;
  projectPath: string | null;
  mode: Mode;
  maxAgentSteps: number;
  notifyOnComplete: boolean;
  compactMode: boolean;
  theme: "dark" | "light" | "system";
  language: "ru" | "en";
  showThinking: boolean;
}

const DEFAULTS: Persisted = {
  providers: [],
  models: [],
  activeModelId: null,
  systemPrompt:
    "Ты — экспертный ассистент-программист в IDE DapohCode. Отвечай точно, кратко и по делу, без воды. Думай о крайних случаях и корректности. Код оформляй в блоках ``` с указанием языка. Если вопрос неоднозначен — сделай разумное допущение и укажи его. Не выдумывай факты, API и поведение библиотек. Всегда отвечай на том же языке, на котором написал пользователь.",
  temperature: 0.7,
  reasoningEffort: "medium",
  autoApply: false,
  sessions: [],
  currentSessionId: null,
  projectName: null,
  projectPath: null,
  mode: "solo",
  maxAgentSteps: 40,
  notifyOnComplete: true,
  compactMode: false,
  theme: "dark",
  language: "ru",
  showThinking: false,
};

function sanitizeMessages(arr: unknown): ChatMessage[] {
  if (!Array.isArray(arr)) return [];
  return arr
    .filter((m): m is ChatMessage => !!m && typeof m === "object")
    .map((m) => ({
      id: String(m.id),
      role: m.role,
      content: typeof m.content === "string" ? m.content : "",
      // never restore a "streaming" state across reloads
      streaming: false,
      error: !!m.error,
      ...(typeof m.reasoning === "string" && m.reasoning ? { reasoning: m.reasoning } : {}),
      ...(Array.isArray(m.toolSteps) ? { toolSteps: m.toolSteps } : {}),
    }));
}

function sanitizeSessions(arr: unknown): Session[] {
  if (!Array.isArray(arr)) return [];
  return arr
    .filter((s): s is Session => !!s && typeof s === "object")
    .map((s) => ({
      id: String(s.id),
      title: typeof s.title === "string" ? s.title : "",
      kind: s.kind === "folder" ? "folder" : "session",
      folderPath: typeof s.folderPath === "string" ? s.folderPath : null,
      folderName: typeof s.folderName === "string" ? s.folderName : null,
      autoTitled: !!s.autoTitled,
      createdAt: typeof s.createdAt === "number" ? s.createdAt : Date.now(),
      updatedAt: typeof s.updatedAt === "number" ? s.updatedAt : Date.now(),
      messages: sanitizeMessages(s.messages),
    }));
}

function loadPersisted(): Persisted {
  if (typeof window === "undefined") return { ...DEFAULTS };
  try {
    const raw = window.localStorage.getItem(STORE_KEY);
    if (!raw) return { ...DEFAULTS };
    const p = JSON.parse(raw) as Partial<Persisted>;
    const sessions = sanitizeSessions(p.sessions);
    const currentSessionId =
      typeof p.currentSessionId === "string" &&
      sessions.some((s) => s.id === p.currentSessionId)
        ? p.currentSessionId
        : null;
    return {
      providers: Array.isArray(p.providers) ? p.providers : [],
      models: Array.isArray(p.models) ? p.models : [],
      activeModelId: typeof p.activeModelId === "string" ? p.activeModelId : null,
      systemPrompt:
        typeof p.systemPrompt === "string" ? p.systemPrompt : DEFAULTS.systemPrompt,
      temperature:
        typeof p.temperature === "number" ? p.temperature : DEFAULTS.temperature,
      reasoningEffort: (["minimal", "low", "medium", "high"] as const).includes(
        p.reasoningEffort as ReasoningEffort,
      )
        ? (p.reasoningEffort as ReasoningEffort)
        : DEFAULTS.reasoningEffort,
      autoApply: typeof p.autoApply === "boolean" ? p.autoApply : DEFAULTS.autoApply,
      sessions,
      currentSessionId,
      projectName: typeof p.projectName === "string" ? p.projectName : null,
      projectPath: typeof p.projectPath === "string" ? p.projectPath : null,
      mode: "solo",
      maxAgentSteps: typeof p.maxAgentSteps === "number" ? Math.min(Math.max(p.maxAgentSteps, 5), 100) : DEFAULTS.maxAgentSteps,
      notifyOnComplete: typeof p.notifyOnComplete === "boolean" ? p.notifyOnComplete : DEFAULTS.notifyOnComplete,
      compactMode: typeof p.compactMode === "boolean" ? p.compactMode : DEFAULTS.compactMode,
      theme: (["dark", "light", "system"] as const).includes(p.theme as "dark") ? (p.theme as "dark") : DEFAULTS.theme,
      language: (["ru", "en"] as const).includes(p.language as "ru") ? (p.language as "ru") : DEFAULTS.language,
      showThinking: typeof p.showThinking === "boolean" ? p.showThinking : DEFAULTS.showThinking,
    };
  } catch {
    return { ...DEFAULTS };
  }
}

/** Play a short notification tone via Web Audio API. */
function playNotificationSound() {
  try {
    const ctx = new AudioContext();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.type = "sine";
    // Two-tone ascending chime
    osc.frequency.setValueAtTime(660, ctx.currentTime);
    osc.frequency.setValueAtTime(880, ctx.currentTime + 0.12);
    gain.gain.setValueAtTime(0.2, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.4);
    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + 0.4);
  } catch { /* ignore audio errors */ }
}

function uuid(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

export type View = "chat" | "settings";

interface AppState extends Persisted {
  view: View;
  streaming: boolean;
  activeRequestId: string | null;
  streamingMsgId: string | null;
  streamingSessionId: string | null;
  /** model ids (full + short) that support reasoning_effort (models.dev) */
  reasoningModelIds: string[];

  setView: (v: View) => void;
  loadReasoningModels: () => Promise<void>;

  addProvider: (p: Omit<Provider, "id">) => string;
  updateProvider: (id: string, patch: Partial<Omit<Provider, "id">>) => void;
  removeProvider: (id: string) => void;

  addModel: (m: Omit<ModelCfg, "id">) => string;
  removeModel: (id: string) => void;
  setActiveModel: (id: string | null) => void;
  fetchModels: (
    providerId: string,
  ) => Promise<{ added: number; error?: string }>;

  setSystemPrompt: (v: string) => void;
  setTemperature: (v: number) => void;
  setReasoningEffort: (v: ReasoningEffort) => void;
  setAutoApply: (v: boolean) => void;
  setNotifyOnComplete: (v: boolean) => void;
  setCompactMode: (v: boolean) => void;
  setTheme: (v: "dark" | "light" | "system") => void;
  setLanguage: (v: "ru" | "en") => void;
  setShowThinking: (v: boolean) => void;
  clearAllData: () => void;
  clearCurrentSession: () => void;
  compactSession: () => Promise<void>;
  addInfoMessage: (content: string) => void;

  /** Pending file-change permission request (agent mode), or null. */
  pendingPerm: { stepId: string; name: string; path: string } | null;
  resolvePermission: (ok: boolean) => void;
  runAgent: (
    sessionId: string,
    userMsg: ChatMessage,
    newTitle: string,
    model: ModelCfg,
    provider: Provider,
    root: string,
  ) => Promise<void>;

  setProject: (name: string | null, path: string | null) => void;

  newSession: () => string;
  newSessionInFolder: (name: string, path: string) => string;
  createChatInFolder: () => Promise<void>;
  selectSession: (id: string) => void;
  deleteSession: (id: string) => void;
  renameSession: (id: string, title: string) => void;
  generateTitle: (sessionId: string) => Promise<void>;

  send: (text: string) => Promise<void>;
  stop: () => Promise<void>;

  appendDelta: (requestId: string, content: string) => void;
  appendReasoningDelta: (requestId: string, content: string) => void;
  finishStream: (requestId: string) => void;
  failStream: (requestId: string, message: string) => void;
}

function persist(state: Persisted) {
  if (typeof window === "undefined") return;
  const data: Persisted = {
    providers: state.providers,
    models: state.models,
    activeModelId: state.activeModelId,
    systemPrompt: state.systemPrompt,
    temperature: state.temperature,
    reasoningEffort: state.reasoningEffort,
    autoApply: state.autoApply,
    sessions: state.sessions,
    currentSessionId: state.currentSessionId,
    projectName: state.projectName,
    projectPath: state.projectPath,
    mode: state.mode,
    maxAgentSteps: state.maxAgentSteps,
    notifyOnComplete: state.notifyOnComplete,
    compactMode: state.compactMode,
    theme: state.theme,
    language: state.language,
    showThinking: state.showThinking,
  };
  try {
    window.localStorage.setItem(STORE_KEY, JSON.stringify(data));
  } catch {
    /* ignore */
  }
}

/** Replace the messages of a single session by id. */
function withSessionMessages(
  sessions: Session[],
  id: string,
  fn: (msgs: ChatMessage[]) => ChatMessage[],
): Session[] {
  return sessions.map((s) =>
    s.id === id ? { ...s, messages: fn(s.messages), updatedAt: Date.now() } : s,
  );
}

export const useApp = create<AppState>((set, get) => ({
  ...loadPersisted(),
  view: "chat",
  streaming: false,
  activeRequestId: null,
  streamingMsgId: null,
  streamingSessionId: null,
  reasoningModelIds: [],
  pendingPerm: null,

  setView: (v) => set({ view: v }),

  loadReasoningModels: async () => {
    try {
      const ids = await listReasoningModels();
      if (ids.length > 0) set({ reasoningModelIds: ids });
    } catch {
      /* offline / fetch failed — supportsReasoning() falls back to heuristic */
    }
  },

  addProvider: (p) => {
    const id = uuid();
    set((s) => {
      const providers = [...s.providers, { id, ...p }];
      persist({ ...s, providers });
      return { providers };
    });
    return id;
  },

  updateProvider: (id, patch) =>
    set((s) => {
      const providers = s.providers.map((p) =>
        p.id === id ? { ...p, ...patch } : p,
      );
      persist({ ...s, providers });
      return { providers };
    }),

  removeProvider: (id) =>
    set((s) => {
      const providers = s.providers.filter((p) => p.id !== id);
      const models = s.models.filter((m) => m.providerId !== id);
      const activeModelId = models.some((m) => m.id === s.activeModelId)
        ? s.activeModelId
        : null;
      persist({ ...s, providers, models, activeModelId });
      return { providers, models, activeModelId };
    }),

  addModel: (m) => {
    const id = uuid();
    set((s) => {
      const models = [...s.models, { id, ...m }];
      const activeModelId = s.activeModelId ?? id;
      persist({ ...s, models, activeModelId });
      return { models, activeModelId };
    });
    return id;
  },

  removeModel: (id) =>
    set((s) => {
      const models = s.models.filter((m) => m.id !== id);
      const activeModelId =
        s.activeModelId === id ? (models[0]?.id ?? null) : s.activeModelId;
      persist({ ...s, models, activeModelId });
      return { models, activeModelId };
    }),

  fetchModels: async (providerId) => {
    const prov = get().providers.find((p) => p.id === providerId);
    if (!prov) return { added: 0, error: "Провайдер не найден" };

    let ids: string[];
    try {
      ids = await listModels(prov.baseUrl, prov.apiKey);
    } catch (e) {
      return { added: 0, error: String(e) };
    }

    let added = 0;
    set((s) => {
      const existing = new Set(
        s.models.filter((m) => m.providerId === providerId).map((m) => m.modelId),
      );
      const fresh = ids
        .filter((id) => !existing.has(id))
        .map((id) => ({
          id: uuid(),
          providerId,
          modelId: id,
          label: displayModelName(id),
        }));
      added = fresh.length;
      if (fresh.length === 0) return {};
      const models = [...s.models, ...fresh];
      const activeModelId = s.activeModelId ?? models[0]?.id ?? null;
      persist({ ...s, models, activeModelId });
      return { models, activeModelId };
    });
    return { added };
  },

  setActiveModel: (id) =>
    set((s) => {
      persist({ ...s, activeModelId: id });
      return { activeModelId: id };
    }),

  setSystemPrompt: (v) =>
    set((s) => {
      persist({ ...s, systemPrompt: v });
      return { systemPrompt: v };
    }),

  setTemperature: (v) =>
    set((s) => {
      persist({ ...s, temperature: v });
      return { temperature: v };
    }),

  setReasoningEffort: (v) =>
    set((s) => {
      persist({ ...s, reasoningEffort: v });
      return { reasoningEffort: v };
    }),

  setAutoApply: (v) =>
    set((s) => {
      persist({ ...s, autoApply: v });
      return { autoApply: v };
    }),

  setNotifyOnComplete: (v) =>
    set((s) => {
      persist({ ...s, notifyOnComplete: v });
      return { notifyOnComplete: v };
    }),

  setCompactMode: (v) =>
    set((s) => {
      persist({ ...s, compactMode: v });
      return { compactMode: v };
    }),

  setTheme: (v) =>
    set((s) => {
      persist({ ...s, theme: v });
      return { theme: v };
    }),

  setLanguage: (v) =>
    set((s) => {
      persist({ ...s, language: v });
      return { language: v };
    }),

  setShowThinking: (v) =>
    set((s) => {
      persist({ ...s, showThinking: v });
      return { showThinking: v };
    }),

  clearAllData: () => {
    if (typeof window !== "undefined") {
      window.localStorage.removeItem(STORE_KEY);
      window.location.reload();
    }
  },

  clearCurrentSession: () => {
    const sid = get().currentSessionId;
    if (!sid) return;
    set((s) => {
      const sessions = withSessionMessages(s.sessions, sid, () => []);
      persist({ ...s, sessions });
      return { sessions };
    });
  },

  compactSession: async () => {
    const s = get();
    const sid = s.currentSessionId;
    if (!sid) return;
    const sess = s.sessions.find((x) => x.id === sid);
    if (!sess || sess.messages.length < 6) return;

    const mdl = s.models.find((m) => m.id === s.activeModelId);
    const prov = mdl
      ? s.providers.find((p) => p.id === mdl.providerId)
      : undefined;
    if (!mdl || !prov) return;

    const keepCount = 4;
    const toCompact = sess.messages.slice(0, -keepCount);
    const toKeep = sess.messages.slice(-keepCount);
    if (toCompact.length < 2) return;

    const compactText = toCompact
      .filter((m) => m.content.trim().length > 0)
      .map((m) => `[${m.role}]: ${m.content}`)
      .join("\n\n")
      .slice(0, 12000);

    try {
      const summary = await chatOnce({
        baseUrl: prov.baseUrl,
        apiKey: prov.apiKey,
        model: mdl.modelId,
        messages: [
          {
            role: "system",
            content:
              "Сожми этот диалог в краткую сводку. Сохрани: ключевые решения, изменённые файлы, технические детали, важные договорённости. Убери всё лишнее. Отвечай ТОЛЬКО сводкой, без преамбул. Язык — как в диалоге.",
          },
          { role: "user", content: compactText },
        ],
      });
      const summaryMsg: ChatMessage = {
        id: uuid(),
        role: "assistant",
        content: `📋 **Сводка предыдущего контекста:**\n\n${summary.trim()}`,
      };
      set((st) => {
        const sessions = withSessionMessages(
          st.sessions,
          sid as string,
          () => [summaryMsg, ...toKeep],
        );
        persist({ ...st, sessions });
        return { sessions };
      });
    } catch {
      /* ignore compaction errors */
    }
  },

  addInfoMessage: (content) => {
    const sid = get().currentSessionId;
    if (!sid) return;
    const msg: ChatMessage = { id: uuid(), role: "assistant", content };
    set((s) => {
      const sessions = withSessionMessages(s.sessions, sid, (msgs) => [
        ...msgs,
        msg,
      ]);
      persist({ ...s, sessions });
      return { sessions };
    });
  },

  resolvePermission: (ok) => {
    const r = permResolver;
    permResolver = null;
    set({ pendingPerm: null });
    if (r) r(ok);
  },

  setProject: (name, path) =>
    set((s) => {
      persist({ ...s, projectName: name, projectPath: path });
      return { projectName: name, projectPath: path };
    }),

  newSession: () => {
    const id = uuid();
    const now = Date.now();
    const session: Session = {
      id,
      title: "",
      kind: "session",
      folderPath: null,
      folderName: null,
      autoTitled: false,
      createdAt: now,
      updatedAt: now,
      messages: [],
    };
    set((s) => {
      const sessions = [session, ...s.sessions];
      persist({ ...s, sessions, currentSessionId: id });
      return { sessions, currentSessionId: id, view: "chat" };
    });
    return id;
  },

  newSessionInFolder: (name, path) => {
    const id = uuid();
    const now = Date.now();
    const session: Session = {
      id,
      title: "",
      kind: "folder",
      folderPath: path,
      folderName: name,
      autoTitled: false,
      createdAt: now,
      updatedAt: now,
      messages: [],
    };
    set((s) => {
      const sessions = [session, ...s.sessions];
      persist({ ...s, sessions, currentSessionId: id });
      return { sessions, currentSessionId: id, view: "chat" };
    });
    return id;
  },

  createChatInFolder: async () => {
    try {
      const path = await pickFolder();
      if (!path) return;
      get().newSessionInFolder(basename(path), path);
    } catch {
      /* dialog unavailable (e.g. running outside Tauri) */
    }
  },

  selectSession: (id) =>
    set((s) => {
      if (!s.sessions.some((x) => x.id === id)) return {};
      persist({ ...s, currentSessionId: id });
      return { currentSessionId: id, view: "chat" };
    }),

  deleteSession: (id) =>
    set((s) => {
      const sessions = s.sessions.filter((x) => x.id !== id);
      const currentSessionId =
        s.currentSessionId === id
          ? (sessions[0]?.id ?? null)
          : s.currentSessionId;
      persist({ ...s, sessions, currentSessionId });
      return { sessions, currentSessionId };
    }),

  renameSession: (id, title) =>
    set((s) => {
      const t = title.trim();
      if (!t) return {};
      const sessions = s.sessions.map((x) =>
        x.id === id ? { ...x, title: t, autoTitled: true } : x,
      );
      persist({ ...s, sessions });
      return { sessions };
    }),

  generateTitle: async (sessionId) => {
    const s = get();
    const sess = s.sessions.find((x) => x.id === sessionId);
    if (!sess || sess.autoTitled) return;
    const model = s.models.find((m) => m.id === s.activeModelId);
    const provider = model
      ? s.providers.find((p) => p.id === model.providerId)
      : undefined;
    if (!model || !provider) return;

    const convo = sess.messages
      .filter((m) => !m.error && m.content.trim().length > 0)
      .map((m) => `${m.role}: ${m.content}`)
      .join("\n")
      .slice(0, 2000);
    if (!convo) return;

    try {
      const raw = await chatOnce({
        baseUrl: provider.baseUrl,
        apiKey: provider.apiKey,
        model: model.modelId,
        messages: [
          {
            role: "system",
            content:
              "Придумай очень короткое название для этого диалога (3–6 слов) на языке диалога, отражающее его тему. Ответь ТОЛЬКО названием — без кавычек, без точки в конце, без префиксов.",
          },
          { role: "user", content: convo },
        ],
      });
      const title = raw
        .trim()
        .split("\n")[0]
        .replace(/^["'«»\s]+|["'«».\s]+$/g, "")
        .slice(0, 60);
      if (title) {
        set((st) => {
          const sessions = st.sessions.map((x) =>
            x.id === sessionId ? { ...x, title, autoTitled: true } : x,
          );
          persist({ ...st, sessions });
          return { sessions };
        });
      }
    } catch {
      /* ignore title generation errors */
    }
  },

  runAgent: async (sessionId, userMsg, newTitle, model, provider, root) => {
    agentAbort = false;

    // Patch a single message within the session.
    const patchMsg = (id: string, fn: (m: ChatMessage) => ChatMessage) =>
      set((st) => {
        const sessions = withSessionMessages(st.sessions, sessionId, (msgs) =>
          msgs.map((m) => (m.id === id ? fn(m) : m)),
        );
        persist({ ...st, sessions });
        return { sessions };
      });

    const patchStep = (
      msgId: string,
      stepId: string,
      fn: (s: ToolStep) => ToolStep,
    ) =>
      patchMsg(msgId, (m) => ({
        ...m,
        toolSteps: (m.toolSteps ?? []).map((s) =>
          s.id === stepId ? fn(s) : s,
        ),
      }));

    const pushAssistant = (id: string) =>
      set((st) => {
        const sessions = withSessionMessages(st.sessions, sessionId, (msgs) => [
          ...msgs,
          { id, role: "assistant" as const, content: "", streaming: true },
        ]);
        return { sessions, streamingMsgId: id };
      });

    const clip = (s: string, n = 4000) =>
      s.length > n ? s.slice(0, n) + "\n…[обрезано]" : s;

    // Append the user message + first assistant placeholder, enter streaming.
    let curId = uuid();
    set((st) => {
      const sessions = st.sessions.map((x) =>
        x.id === sessionId
          ? {
              ...x,
              title: newTitle,
              updatedAt: Date.now(),
              messages: [
                ...x.messages,
                userMsg,
                {
                  id: curId,
                  role: "assistant" as const,
                  content: "",
                  streaming: true,
                },
              ],
            }
          : x,
      );
      persist({ ...st, sessions });
      return {
        sessions,
        streaming: true,
        activeRequestId: null,
        streamingMsgId: curId,
        streamingSessionId: sessionId,
      };
    });

    // Build the API conversation from the transcript (reconstruct tool turns).
    const sess0 = get().sessions.find((x) => x.id === sessionId);
    const apiMessages: Array<Record<string, unknown>> = [];
    // Try to read DAPOH.md from project root for project memory
    let memoryContent: string | undefined;
    try {
      const { readTextFile } = await import("../lib/tauri");
      const memPath = root.includes("\\") ? `${root}\\DAPOH.md` : `${root}/DAPOH.md`;
      memoryContent = await readTextFile(memPath);
      if (memoryContent.trim().length === 0) memoryContent = undefined;
    } catch {
      memoryContent = undefined;
    }

    const sysParts: string[] = [];
    if (get().systemPrompt.trim()) sysParts.push(get().systemPrompt.trim());
    sysParts.push(agentSystemPreamble(root, memoryContent, get().compactMode));
    apiMessages.push({ role: "system", content: sysParts.join("\n\n") });
    for (const m of sess0?.messages ?? []) {
      if (m.id === curId || m.error) continue;
      apiMessages.push(...toApiMessages(m));
    }

    const reasoning = supportsReasoning(get().reasoningModelIds, model.modelId)
      ? get().reasoningEffort
      : null;

    const finalize = () => {
      let titleSessionId: string | null = null;
      set((st) => {
        // Drop a trailing empty assistant placeholder if the loop ended on one.
        const sessions = withSessionMessages(st.sessions, sessionId, (msgs) =>
          msgs.filter(
            (m, i) =>
              !(
                i === msgs.length - 1 &&
                m.role === "assistant" &&
                m.content.trim().length === 0 &&
                (m.toolSteps?.length ?? 0) === 0
              ),
          ),
        );
        const sess = sessions.find((x) => x.id === sessionId);
        const real =
          sess?.messages.filter(
            (m) => !m.error && (m.content.trim().length > 0 || m.toolSteps),
          ) ?? [];
        if (sess && !sess.autoTitled && real.length >= 2) titleSessionId = sessionId;
        persist({ ...st, sessions });
        return {
          sessions,
          streaming: false,
          activeRequestId: null,
          streamingMsgId: null,
          streamingSessionId: null,
          pendingPerm: null,
        };
      });
      if (titleSessionId) void get().generateTitle(titleSessionId);
      if (get().notifyOnComplete) playNotificationSound();
    };

    try {
      for (let step = 0; step < 500; step++) {
        if (agentAbort) break;

        // Stream text tokens live via agent-delta events.
        const unlisten = await onAgentDelta((e) => {
          if (!agentAbort) {
            patchMsg(curId, (m) => ({
              ...m,
              content: m.content + e.content,
            }));
          }
        });
        const unlistenReasoning = await onAgentReasoningDelta((e) => {
          if (!agentAbort) {
            patchMsg(curId, (m) => ({
              ...m,
              reasoning: (m.reasoning ?? "") + e.content,
            }));
          }
        });

        let resp: Awaited<ReturnType<typeof agentStream>>;
        try {
          resp = await agentStream({
            baseUrl: provider.baseUrl,
            apiKey: provider.apiKey,
            model: model.modelId,
            messages: apiMessages,
            tools: AGENT_TOOLS,
            reasoningEffort: reasoning,
          });
        } finally {
          unlisten();
          unlistenReasoning();
        }
        if (agentAbort) break;

        const calls = resp.tool_calls ?? [];
        const content = resp.content ?? "";

        if (calls.length === 0) {
          // Content was already streamed via deltas — just stop streaming flag.
          patchMsg(curId, (m) => ({ ...m, content: m.content || content, streaming: false }));
          finalize();
          return;
        }

        // Record the assistant's tool-call turn for the model's context.
        apiMessages.push({
          role: "assistant",
          content: content || "",
          tool_calls: calls.map((c) => ({
            id: c.id,
            type: "function",
            function: { name: c.name, arguments: c.arguments },
          })),
        });

        // Show this turn's content + tool cards (running).
        const steps: ToolStep[] = calls.map((c) => ({
          id: c.id,
          name: c.name,
          args: c.arguments,
          status: "running",
        }));
        // Content was streamed live — use whatever's in the message already.
        // Only override if the model sent content but streaming didn't capture it.
        patchMsg(curId, (m) => ({
          ...m,
          content: m.content || content,
          toolSteps: steps,
          streaming: true,
        }));

        // Split into read-only and non-read groups for parallel execution.
        const readCalls = calls.filter(
          (c) => !isWriteTool(c.name) && !isCommandTool(c.name),
        );
        const nonReadCalls = calls.filter(
          (c) => isWriteTool(c.name) || isCommandTool(c.name),
        );

        // Results map: tool_call_id → result text
        const results = new Map<string, string>();

        // ── Execute ALL read-only tools in parallel ──
        if (readCalls.length > 0 && !agentAbort) {
          const readPromises = readCalls.map(async (c) => {
            const args = parseArgs(c.arguments);
            const dispPath = args.path != null ? String(args.path) : undefined;
            patchStep(curId, c.id, (s) => ({ ...s, path: dispPath }));
            try {
              const resultText = await runReadTool(root, c.name, args);
              patchStep(curId, c.id, (s) => ({
                ...s,
                status: "ok",
                result: clip(resultText),
              }));
              results.set(c.id, resultText);
            } catch (e) {
              const errText = `Ошибка: ${String(e)}`;
              patchStep(curId, c.id, (s) => ({
                ...s,
                status: "error",
                result: errText,
              }));
              results.set(c.id, errText);
            }
          });
          await Promise.all(readPromises);
        }

        // ── Execute write/command tools sequentially (need permission) ──
        for (const c of nonReadCalls) {
          if (agentAbort) break;
          const args = parseArgs(c.arguments);
          const dispPath = args.path != null ? String(args.path) : undefined;
          let resultText = "";
          try {
            if (isCommandTool(c.name)) {
              const cmdStr = String(args.command ?? "");
              const auto = get().autoApply;
              patchStep(curId, c.id, (s) => ({
                ...s,
                path: cmdStr,
                status: auto ? "running" : "awaiting",
              }));
              let ok = auto;
              if (!auto) {
                ok = await new Promise<boolean>((resolve) => {
                  permResolver = resolve;
                  set({
                    pendingPerm: {
                      stepId: c.id,
                      name: c.name,
                      path: cmdStr,
                    },
                  });
                });
              }
              if (agentAbort) ok = false;
              if (ok) {
                resultText = await executeCommand(root, args);
                patchStep(curId, c.id, (s) => ({
                  ...s,
                  status: "ok",
                  result: clip(resultText),
                }));
              } else {
                resultText = "Пользователь отклонил выполнение команды.";
                patchStep(curId, c.id, (s) => ({
                  ...s,
                  status: "denied",
                  result: resultText,
                }));
              }
            } else {
              const prep = await prepareWrite(root, c.name, args);
              const diffStr = JSON.stringify(prep.diff);
              const auto = get().autoApply;
              patchStep(curId, c.id, (s) => ({
                ...s,
                path: dispPath,
                diff: diffStr,
                status: auto ? "running" : "awaiting",
              }));
              let ok = auto;
              if (!auto) {
                ok = await new Promise<boolean>((resolve) => {
                  permResolver = resolve;
                  set({
                    pendingPerm: {
                      stepId: c.id,
                      name: c.name,
                      path: dispPath ?? "",
                    },
                  });
                });
              }
              if (agentAbort) ok = false;
              if (ok) {
                await applyWrite(prep);
                resultText =
                  c.name === "delete_file"
                    ? `Файл удалён: ${dispPath}`
                    : `Изменения применены: ${dispPath}`;
                patchStep(curId, c.id, (s) => ({
                  ...s,
                  status: "ok",
                  result: resultText,
                }));
              } else {
                resultText = "Пользователь отклонил изменение.";
                patchStep(curId, c.id, (s) => ({
                  ...s,
                  status: "denied",
                  result: resultText,
                }));
              }
            }
          } catch (e) {
            resultText = `Ошибка: ${String(e)}`;
            patchStep(curId, c.id, (s) => ({
              ...s,
              status: "error",
              result: resultText,
            }));
          }
          results.set(c.id, resultText);
        }

        // Push all tool results to apiMessages in original call order.
        for (const c of calls) {
          apiMessages.push({
            role: "tool",
            tool_call_id: c.id,
            content: results.get(c.id) ?? "",
          });
        }

        // Close this turn's message, open a fresh placeholder for the next.
        patchMsg(curId, (m) => ({ ...m, streaming: false }));
        if (agentAbort) break;
        curId = uuid();
        pushAssistant(curId);
      }

      if (!agentAbort) {
        patchMsg(curId, (m) => ({
          ...m,
          streaming: false,
          content: m.content || "Достигнут лимит шагов агента.",
        }));
      } else {
        patchMsg(curId, (m) => ({ ...m, streaming: false }));
      }
      finalize();
    } catch (e) {
      patchMsg(curId, (m) => ({
        ...m,
        streaming: false,
        error: true,
        content: m.content || String(e),
      }));
      finalize();
    }
  },

  send: async (text) => {
    if (get().streaming) return;

    // Make sure there is an active session to write into.
    let sessionId = get().currentSessionId;
    if (!sessionId || !get().sessions.some((x) => x.id === sessionId)) {
      sessionId = get().newSession();
    }

    const s = get();
    const model = s.models.find((m) => m.id === s.activeModelId);
    const provider = model
      ? s.providers.find((p) => p.id === model.providerId)
      : undefined;

    const userMsg: ChatMessage = { id: uuid(), role: "user", content: text };
    const sess = s.sessions.find((x) => x.id === sessionId);
    const isFirst = !sess || sess.messages.length === 0;
    // Provisional title from the first message; a model-generated title
    // replaces it once the first reply finishes (see generateTitle).
    const newTitle =
      isFirst && (!sess || !sess.title)
        ? text.trim().slice(0, 48)
        : sess?.title ?? "";

    if (!model || !provider) {
      const errMsg: ChatMessage = {
        id: uuid(),
        role: "assistant",
        content:
          "Не выбрана модель. Добавь провайдера и модель в Настройках, затем выбери модель внизу.",
        error: true,
      };
      set((st) => {
        const sessions = st.sessions.map((x) =>
          x.id === sessionId
            ? {
                ...x,
                title: newTitle,
                updatedAt: Date.now(),
                messages: [...x.messages, userMsg, errMsg],
              }
            : x,
        );
        persist({ ...st, sessions });
        return { sessions };
      });
      return;
    }

    // Folder-bound sessions run the agentic (tool-calling) loop; plain chats
    // keep the lightweight streaming path below.
    if (sess?.folderPath) {
      await get().runAgent(
        sessionId as string,
        userMsg,
        newTitle,
        model,
        provider,
        sess.folderPath,
      );
      return;
    }

    const assistantId = uuid();
    const requestId = uuid();
    const assistantMsg: ChatMessage = {
      id: assistantId,
      role: "assistant",
      content: "",
      streaming: true,
    };

    const history = [...(sess?.messages ?? []), userMsg]
      .filter((m) => !m.error && m.content.trim().length > 0)
      .map((m) => ({ role: m.role, content: m.content }));
    const apiMessages = s.systemPrompt.trim()
      ? [{ role: "system", content: s.systemPrompt.trim() }, ...history]
      : history;

    set((st) => {
      const sessions = st.sessions.map((x) =>
        x.id === sessionId
          ? {
              ...x,
              title: newTitle,
              updatedAt: Date.now(),
              messages: [...x.messages, userMsg, assistantMsg],
            }
          : x,
      );
      persist({ ...st, sessions });
      return {
        sessions,
        streaming: true,
        activeRequestId: requestId,
        streamingMsgId: assistantId,
        streamingSessionId: sessionId,
      };
    });

    try {
      await chatStream({
        requestId,
        baseUrl: provider.baseUrl,
        apiKey: provider.apiKey,
        model: model.modelId,
        messages: apiMessages,
        temperature: s.temperature,
        reasoningEffort: supportsReasoning(
          get().reasoningModelIds,
          model.modelId,
        )
          ? s.reasoningEffort
          : null,
      });
    } catch (e) {
      get().failStream(requestId, String(e));
    }
  },

  stop: async () => {
    // Abort any running agent loop and release a pending permission prompt.
    agentAbort = true;
    if (permResolver) {
      const r = permResolver;
      permResolver = null;
      r(false);
    }
    if (get().pendingPerm) set({ pendingPerm: null });

    const { activeRequestId, streamingSessionId, streamingMsgId } = get();
    // Reflect the stop in the UI immediately so the button feels responsive,
    // independent of how fast the backend's cooperative cancel kicks in.
    // Any late chat-delta/done/error events are ignored because they guard on
    // activeRequestId, which we clear here.
    if (streamingSessionId) {
      set((s) => {
        const sessions = withSessionMessages(
          s.sessions,
          streamingSessionId,
          (msgs) =>
            msgs
              .map((m) =>
                m.id === streamingMsgId ? { ...m, streaming: false } : m,
              )
              // Drop the empty assistant placeholder if stopped before any token.
              .filter(
                (m) =>
                  !(m.id === streamingMsgId && m.content.trim().length === 0),
              ),
        );
        persist({ ...s, sessions });
        return {
          sessions,
          streaming: false,
          activeRequestId: null,
          streamingMsgId: null,
          streamingSessionId: null,
        };
      });
    }
    // Abort the in-flight backend request to stop wasting tokens.
    try {
      await cancelChat();
    } catch {
      /* ignore */
    }
  },

  appendDelta: (requestId, content) =>
    set((s) => {
      if (s.activeRequestId !== requestId || !s.streamingSessionId) return {};
      const sessions = withSessionMessages(
        s.sessions,
        s.streamingSessionId,
        (msgs) =>
          msgs.map((m) =>
            m.id === s.streamingMsgId
              ? { ...m, content: m.content + content }
              : m,
          ),
      );
      return { sessions };
    }),

  appendReasoningDelta: (requestId, content) =>
    set((s) => {
      if (s.activeRequestId !== requestId || !s.streamingSessionId) return {};
      const sessions = withSessionMessages(
        s.sessions,
        s.streamingSessionId,
        (msgs) =>
          msgs.map((m) =>
            m.id === s.streamingMsgId
              ? { ...m, reasoning: (m.reasoning ?? "") + content }
              : m,
          ),
      );
      return { sessions };
    }),

  finishStream: (requestId) => {
    let titleSessionId: string | null = null;
    set((s) => {
      if (s.activeRequestId !== requestId || !s.streamingSessionId) return {};
      const sid = s.streamingSessionId;
      const sessions = withSessionMessages(s.sessions, sid, (msgs) =>
        msgs.map((m) => {
          if (m.id !== s.streamingMsgId) return m;
          // If the model returned no content at all, show an error.
          if (m.content.trim().length === 0) {
            return { ...m, streaming: false, error: true, content: "Модель не вернула ответ. Проверь API-ключ, выбранную модель и провайдера." };
          }
          return { ...m, streaming: false };
        }),
      );
      const sess = sessions.find((x) => x.id === sid);
      const realMsgs =
        sess?.messages.filter((m) => !m.error && m.content.trim().length > 0) ??
        [];
      if (sess && !sess.autoTitled && realMsgs.length >= 2) {
        titleSessionId = sid;
      }
      persist({ ...s, sessions });
      return {
        sessions,
        streaming: false,
        activeRequestId: null,
        streamingMsgId: null,
        streamingSessionId: null,
      };
    });
    if (titleSessionId) void get().generateTitle(titleSessionId);
    // Play notification sound if enabled
    if (get().notifyOnComplete) playNotificationSound();
  },

  failStream: (requestId, message) =>
    set((s) => {
      if (s.activeRequestId !== requestId || !s.streamingSessionId) return {};
      const sessions = withSessionMessages(
        s.sessions,
        s.streamingSessionId,
        (msgs) =>
          msgs.map((m) =>
            m.id === s.streamingMsgId
              ? {
                  ...m,
                  streaming: false,
                  error: true,
                  content:
                    m.content.trim().length > 0 ? m.content : message,
                }
              : m,
          ),
      );
      persist({ ...s, sessions });
      return {
        sessions,
        streaming: false,
        activeRequestId: null,
        streamingMsgId: null,
        streamingSessionId: null,
      };
    }),
}));

/** Convenience selector: messages of the active session (or empty). */
export function useCurrentMessages(): ChatMessage[] {
  return useApp((s) => {
    const cur = s.sessions.find((x) => x.id === s.currentSessionId);
    return cur ? cur.messages : EMPTY_MESSAGES;
  });
}

const EMPTY_MESSAGES: ChatMessage[] = [];
