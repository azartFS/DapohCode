//! Agent tool definitions (OpenAI tool-calling schema) + executors that map
//! each tool onto the Rust filesystem commands, scoped to the project root.

import {
  deleteEntry,
  readDir,
  readTextFile,
  readTree,
  runCommand,
  grepRegex,
  searchText,
  webFetch,
  webSearch,
  writeTextFile,
} from "./tauri";
import { diffLines, type DiffLine } from "./diff";

/** OpenAI-format tools advertised to the model. */
export const AGENT_TOOLS = [
  {
    type: "function",
    function: {
      name: "read_file",
      description:
        "Прочитать файл. Путь относительно корня проекта. ОБЯЗАТЕЛЬНО читай перед правкой.",
      parameters: {
        type: "object",
        properties: {
          path: { type: "string", description: "Путь к файлу, напр. src/main.rs" },
        },
        required: ["path"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "list_dir",
      description:
        "Содержимое одного уровня каталога. По умолчанию — корень проекта.",
      parameters: {
        type: "object",
        properties: {
          path: { type: "string", description: "Путь к папке, напр. src (или '.')" },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "list_tree",
      description:
        "Полная рекурсивная структура проекта. Тяжёлые папки (node_modules, .git, target, dist) пропускаются. Начинай исследование проекта с этого.",
      parameters: {
        type: "object",
        properties: {
          path: {
            type: "string",
            description: "Корень обхода относительно проекта (по умолчанию весь проект)",
          },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "search_text",
      description:
        "Поиск подстроки по коду (регистронезависимо). Результат: path:line: текст.",
      parameters: {
        type: "object",
        properties: {
          query: { type: "string", description: "Что искать" },
          path: {
            type: "string",
            description: "Где искать относительно проекта (по умолчанию весь проект)",
          },
        },
        required: ["query"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "write_file",
      description:
        "Создать файл или полностью перезаписать. Передавай ВСЁ содержимое, не фрагмент.",
      parameters: {
        type: "object",
        properties: {
          path: { type: "string", description: "Путь к файлу" },
          content: { type: "string", description: "Полное новое содержимое файла" },
        },
        required: ["path", "content"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "edit_file",
      description:
        "Точечная замена: old_string → new_string. old_string ДОСЛОВНО (пробелы, табы, переносы), РОВНО один раз в файле. Включай контекст для уникальности. Предпочтительный способ правки.",
      parameters: {
        type: "object",
        properties: {
          path: { type: "string", description: "Путь к файлу" },
          old_string: { type: "string", description: "Точный существующий фрагмент" },
          new_string: { type: "string", description: "Новый фрагмент" },
        },
        required: ["path", "old_string", "new_string"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "run_command",
      description:
        "Shell-команда в корне проекта. Возвращает stdout, stderr, exit code. Таймаут 120с, макс 300с. Пути с пробелами — в кавычки.",
      parameters: {
        type: "object",
        properties: {
          command: {
            type: "string",
            description: "Команда для выполнения, напр. npm install или cargo build",
          },
          timeout_secs: {
            type: "number",
            description: "Таймаут в секундах (по умолчанию 120, макс 300)",
          },
        },
        required: ["command"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "grep",
      description:
        "Regex-поиск по коду. Фильтр по расширению через glob. Для сложных паттернов: функции, классы, импорты.",
      parameters: {
        type: "object",
        properties: {
          pattern: {
            type: "string",
            description:
              "Регулярное выражение, напр. 'async fn \\w+' или 'import.*from .+zustand'",
          },
          path: {
            type: "string",
            description: "Где искать относительно проекта (по умолчанию весь проект)",
          },
          glob: {
            type: "string",
            description:
              "Фильтр по расширению файлов, напр. '*.ts', '*.rs', '*.py'",
          },
        },
        required: ["pattern"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "delete_file",
      description: "Удалить файл. Необратимо.",
      parameters: {
        type: "object",
        properties: {
          path: { type: "string", description: "Путь к файлу" },
        },
        required: ["path"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "web_search",
      description:
        "Поиск в интернете. Используй когда нужна актуальная информация: новые версии, даты, факты вне кодовой базы.",
      parameters: {
        type: "object",
        properties: {
          query: {
            type: "string",
            description: "Поисковый запрос, напр. 'latest version of React'",
          },
          max_results: {
            type: "number",
            description: "Макс. результатов (по умолчанию 8)",
          },
        },
        required: ["query"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "web_fetch",
      description:
        "Загрузить содержимое веб-страницы по URL. HTML автоматически конвертируется в текст. Используй для чтения документации, статей, API-ответов.",
      parameters: {
        type: "object",
        properties: {
          url: {
            type: "string",
            description: "URL страницы, напр. https://docs.rs/tokio/latest",
          },
          max_chars: {
            type: "number",
            description: "Макс. символов (по умолчанию 30000)",
          },
        },
        required: ["url"],
      },
    },
  },
];

export function isWriteTool(name: string): boolean {
  return name === "write_file" || name === "edit_file" || name === "delete_file";
}

/** Tools that need user permission but don't produce a file diff. */
export function isCommandTool(name: string): boolean {
  return name === "run_command";
}

function sep(root: string): string {
  return root.includes("\\") && !root.includes("/") ? "\\" : "/";
}

/** Resolve a (possibly project-relative) tool path against the project root. */
export function resolvePath(root: string, p: string): string {
  const t = (p ?? "").trim();
  if (/^([a-zA-Z]:[\\/]|[\\/])/.test(t)) return t; // already absolute
  const s = sep(root);
  const base = root.replace(/[\\/]+$/, "");
  const rel = t.replace(/^\.[\\/]/, "").replace(/[\\/]+/g, s);
  return rel ? `${base}${s}${rel}` : base;
}

export function parseArgs(raw: string): Record<string, unknown> {
  try {
    const v = JSON.parse(raw || "{}");
    return v && typeof v === "object" ? (v as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

const MAX_RESULT = 60000;
function clamp(s: string): string {
  return s.length > MAX_RESULT ? s.slice(0, MAX_RESULT) + "\n…[обрезано]" : s;
}

/** Run a read-only tool (read_file / list_dir / list_tree / search_text). Returns text for the model. */
export async function runReadTool(
  root: string,
  name: string,
  args: Record<string, unknown>,
): Promise<string> {
  if (name === "read_file") {
    const p = resolvePath(root, String(args.path ?? ""));
    return clamp(await readTextFile(p));
  }
  if (name === "list_dir") {
    const p = resolvePath(root, String(args.path ?? "."));
    const entries = await readDir(p);
    if (entries.length === 0) return "(пусто)";
    return entries
      .map((e) => (e.is_dir ? `${e.name}/` : e.name))
      .join("\n");
  }
  if (name === "list_tree") {
    const p = resolvePath(root, String(args.path ?? ""));
    const tree = await readTree(p);
    if (tree.length === 0) return "(пусто)";
    return clamp(tree.join("\n"));
  }
  if (name === "search_text") {
    const query = String(args.query ?? "");
    const p = resolvePath(root, String(args.path ?? ""));
    const hits = await searchText(p, query);
    if (hits.length === 0) return "(нет совпадений)";
    return clamp(
      hits.map((h) => `${h.path}:${h.line}: ${h.text}`).join("\n"),
    );
  }
  if (name === "grep") {
    const pattern = String(args.pattern ?? "");
    const p = resolvePath(root, String(args.path ?? ""));
    const glob = args.glob != null ? String(args.glob) : undefined;
    const hits = await grepRegex(p, pattern, glob);
    if (hits.length === 0) return "(нет совпадений)";
    return clamp(
      hits.map((h) => `${h.path}:${h.line}: ${h.text}`).join("\n"),
    );
  }
  if (name === "web_search") {
    const query = String(args.query ?? "");
    if (!query.trim()) throw new Error("web_search: пустой запрос");
    const max = typeof args.max_results === "number" ? args.max_results : undefined;
    const results = await webSearch(query, max);
    if (results.length === 0) return "(нет результатов)";
    return results
      .map((r, i) => `${i + 1}. ${r.title}\n   ${r.url}\n   ${r.snippet}`)
      .join("\n\n");
  }
  if (name === "web_fetch") {
    const url = String(args.url ?? "");
    if (!url.trim()) throw new Error("web_fetch: пустой URL");
    const max = typeof args.max_chars === "number" ? args.max_chars : undefined;
    return await webFetch(url, max);
  }
  throw new Error(`Неизвестный инструмент чтения: ${name}`);
}

export interface PreparedWrite {
  path: string; // resolved absolute path
  oldContent: string;
  newContent: string | null; // null = delete
  diff: DiffLine[];
}

/** Prepare a mutating tool WITHOUT touching disk: compute new content + diff. */
export async function prepareWrite(
  root: string,
  name: string,
  args: Record<string, unknown>,
): Promise<PreparedWrite> {
  const path = resolvePath(root, String(args.path ?? ""));
  let oldContent = "";
  try {
    oldContent = await readTextFile(path);
  } catch {
    oldContent = "";
  }

  if (name === "delete_file") {
    return { path, oldContent, newContent: null, diff: diffLines(oldContent, "") };
  }
  if (name === "write_file") {
    const newContent = String(args.content ?? "");
    return { path, oldContent, newContent, diff: diffLines(oldContent, newContent) };
  }
  if (name === "edit_file") {
    const oldStr = String(args.old_string ?? "");
    const newStr = String(args.new_string ?? "");
    if (oldStr === "") throw new Error("edit_file: old_string пустой");
    const idx = oldContent.indexOf(oldStr);
    if (idx === -1) throw new Error("edit_file: old_string не найден в файле");
    if (oldContent.indexOf(oldStr, idx + 1) !== -1)
      throw new Error("edit_file: old_string встречается более одного раза");
    const newContent =
      oldContent.slice(0, idx) + newStr + oldContent.slice(idx + oldStr.length);
    return { path, oldContent, newContent, diff: diffLines(oldContent, newContent) };
  }
  throw new Error(`Неизвестный инструмент записи: ${name}`);
}

/** Execute a shell command in the project root. Returns formatted output for the model. */
export async function executeCommand(
  root: string,
  args: Record<string, unknown>,
): Promise<string> {
  const cmd = String(args.command ?? "");
  if (!cmd.trim()) throw new Error("run_command: пустая команда");
  const timeout = typeof args.timeout_secs === "number" ? args.timeout_secs : undefined;
  const result = await runCommand(cmd, root, timeout);
  const parts: string[] = [];
  if (result.stdout.trim()) parts.push(result.stdout.trim());
  if (result.stderr.trim()) parts.push(`[stderr]\n${result.stderr.trim()}`);
  if (result.timed_out) parts.push("[таймаут — команда убита]");
  const exitInfo = result.exit_code !== null ? `exit code: ${result.exit_code}` : "exit code: N/A";
  const output = parts.length > 0 ? parts.join("\n") : "(нет вывода)";
  return clamp(`$ ${cmd}\n${output}\n${exitInfo}`);
}

/** Apply a prepared mutation to disk. */
export async function applyWrite(p: PreparedWrite): Promise<void> {
  if (p.newContent === null) {
    await deleteEntry(p.path);
  } else {
    await writeTextFile(p.path, p.newContent);
  }
}
