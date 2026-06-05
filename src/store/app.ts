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
  cancelChat,
  chatOnce,
  chatStream,
  listModels,
  listReasoningModels,
  pickFolder,
} from "../lib/tauri";
import {
  AGENT_TOOLS,
  applyWrite,
  isWriteTool,
  parseArgs,
  prepareWrite,
  runReadTool,
} from "../lib/agentTools";

const MAX_AGENT_STEPS = 40;

/** Module-level agent-loop control (one loop at a time). */
let agentAbort = false;
let permResolver: ((ok: boolean) => void) | null = null;

function agentSystemPreamble(root: string): string {
  return [
    "Ты — DapohCode, автономный AI-агент по программированию мирового уровня. Ты работаешь внутри настоящего проекта пользователя на его машине и реально меняешь код через инструменты.",
    "",
    `# Проект`,
    `Корень проекта: ${root}`,
    "Все пути к файлам указывай относительно корня проекта (например, src/main.rs).",
    "",
    "# Инструменты",
    "• list_tree(path) — ВСЯ структура проекта рекурсивно за один вызов (тяжёлые папки пропускаются). Начинай обзор проекта с этого.",
    "• list_dir(path) — содержимое одного уровня каталога.",
    "• search_text(query, path) — поиск подстроки по всему коду (path:line: текст). Используй, чтобы находить определения, использования, конфиги.",
    "• read_file(path) — прочитать файл. Читай перед любой правкой.",
    "• write_file(path, content) — создать новый файл или ПОЛНОСТЬЮ перезаписать. Передавай полное содержимое.",
    "• edit_file(path, old_string, new_string) — точечная замена. old_string должен совпадать ДОСЛОВНО (с пробелами/отступами) и встречаться РОВНО один раз — включай достаточно контекста для уникальности.",
    "• delete_file(path) — удалить файл.",
    "",
    "# Анализ / изучение проекта",
    "Если просят проанализировать, изучить, разобрать проект или понять, как он устроен — это значит изучить ПРОЕКТ ЦЕЛИКОМ, а не только структуру папок:",
    "1. Вызови list_tree, чтобы увидеть все папки и файлы.",
    "2. Прочитай ключевые файлы через read_file: точки входа (main/index/lib), манифесты и конфиги (package.json, Cargo.toml, tsconfig, README) и ВСЕ значимые модули с реальным кодом. Не ограничивайся одним-двумя файлами и не останавливайся на структуре папок.",
    "3. Используй search_text, чтобы проследить связи: где что определяется и используется.",
    "4. Изучай итеративно, пока не поймёшь проект по-настоящему. Не делай выводов по именам файлов — читай их содержимое.",
    "5. Затем дай разбор: назначение проекта, стек/зависимости, архитектура и структура, ключевые модули и как они связаны, точки входа и поток данных, замечания и потенциальные проблемы.",
    "",
    "# Как работать",
    "1. Пойми задачу. Если контекста мало — сначала изучи проект (list_tree → read_file → search_text), не угадывай.",
    "2. Никогда не выдумывай содержимое файлов, API, импорты или пути. Прочитай — потом меняй.",
    "3. Предпочитай edit_file для точечных правок; write_file — только для новых файлов или полной перезаписи.",
    "4. Вноси минимальные, сфокусированные изменения. Не переформатируй и не трогай несвязанный код.",
    "5. Строго соблюдай стиль, соглашения, отступы и паттерны, уже принятые в проекте.",
    "6. Меняй файлы по одному осмысленными шагами. После записи можешь перечитать файл, чтобы убедиться в корректности.",
    "7. Действуй автономно: разбивай задачу на шаги и доводи до конца, не спрашивая лишнего. Уточняй только при реальной неоднозначности или риске потери данных.",
    "8. Будь осторожен с удалением и перезаписью — это необратимо.",
    "9. Если инструмент вернул ошибку — прочитай её, адаптируйся и попробуй иначе, а не повторяй вслепую.",
    "",
    "# Качество",
    "• Пиши чистый, идиоматичный, рабочий код. Учитывай крайние случаи и обработку ошибок.",
    "• Не оставляй заглушек и TODO, если задача — реализовать функциональность.",
    "• Не ломай существующее: помни про импорты, типы и связанные места.",
    "",
    "# Ответ пользователю",
    "• Отвечай на русском, кратко и по делу. Код в ответе оформляй в блоках ``` с указанием языка.",
    "• По завершении дай короткое резюме: что изменено, в каких файлах и почему.",
    "• Не утверждай, что сделал то, чего не делал. Описывай только реально выполненные действия.",
  ].join("\n");
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
}

const DEFAULTS: Persisted = {
  providers: [],
  models: [],
  activeModelId: null,
  systemPrompt:
    "Ты — экспертный ассистент-программист в IDE DapohCode. Отвечай точно, кратко и по делу, без воды. Думай о крайних случаях и корректности. Код оформляй в блоках ``` с указанием языка. Если вопрос неоднозначен — сделай разумное допущение и укажи его. Не выдумывай факты, API и поведение библиотек.",
  temperature: 0.7,
  reasoningEffort: "medium",
  autoApply: false,
  sessions: [],
  currentSessionId: null,
  projectName: null,
  projectPath: null,
  mode: "solo",
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
    };
  } catch {
    return { ...DEFAULTS };
  }
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
    const sysParts: string[] = [];
    if (get().systemPrompt.trim()) sysParts.push(get().systemPrompt.trim());
    sysParts.push(agentSystemPreamble(root));
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
    };

    try {
      for (let step = 0; step < MAX_AGENT_STEPS; step++) {
        if (agentAbort) break;

        const resp = await agentComplete({
          baseUrl: provider.baseUrl,
          apiKey: provider.apiKey,
          model: model.modelId,
          messages: apiMessages,
          tools: AGENT_TOOLS,
          reasoningEffort: reasoning,
        });
        if (agentAbort) break;

        const calls = resp.tool_calls ?? [];
        const content = resp.content ?? "";

        if (calls.length === 0) {
          patchMsg(curId, (m) => ({ ...m, content, streaming: false }));
          finalize();
          return;
        }

        // Record the assistant's tool-call turn for the model's context.
        apiMessages.push({
          role: "assistant",
          content: content || null,
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
        patchMsg(curId, (m) => ({
          ...m,
          content: content || m.content,
          toolSteps: steps,
          streaming: true,
        }));

        for (const c of calls) {
          if (agentAbort) break;
          const args = parseArgs(c.arguments);
          const dispPath = args.path != null ? String(args.path) : undefined;
          let resultText = "";
          try {
            if (!isWriteTool(c.name)) {
              patchStep(curId, c.id, (s) => ({ ...s, path: dispPath }));
              resultText = await runReadTool(root, c.name, args);
              patchStep(curId, c.id, (s) => ({
                ...s,
                status: "ok",
                result: clip(resultText),
              }));
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
          apiMessages.push({
            role: "tool",
            tool_call_id: c.id,
            content: resultText,
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
    if (activeRequestId && streamingSessionId) {
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

  finishStream: (requestId) => {
    let titleSessionId: string | null = null;
    set((s) => {
      if (s.activeRequestId !== requestId || !s.streamingSessionId) return {};
      const sid = s.streamingSessionId;
      const sessions = withSessionMessages(s.sessions, sid, (msgs) =>
        msgs.map((m) =>
          m.id === s.streamingMsgId ? { ...m, streaming: false } : m,
        ),
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
