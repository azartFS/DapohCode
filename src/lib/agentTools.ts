//! Agent tool definitions (OpenAI tool-calling schema) + executors that map
//! each tool onto the Rust filesystem commands, scoped to the project root.

import {
  deleteEntry,
  readDir,
  readTextFile,
  readTree,
  searchText,
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
        "Прочитать содержимое текстового файла в проекте. Путь относительно корня проекта.",
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
        "Показать список файлов и папок ОДНОГО уровня каталога. Путь относительно корня (по умолчанию корень).",
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
        "Показать ВСЮ структуру проекта рекурсивно (все папки и файлы сразу). Тяжёлые папки (node_modules, target, .git, dist…) пропускаются. Используй это для анализа/обзора проекта вместо многократных list_dir.",
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
        "Искать текст/подстроку по всему коду проекта (регистронезависимо). Возвращает совпадения в формате path:line: текст. Используй, чтобы находить определения, использования, имена функций и т.п.",
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
        "Создать новый файл или полностью перезаписать существующий. Передавай ПОЛНОЕ содержимое файла.",
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
        "Точечно заменить фрагмент в файле: old_string заменяется на new_string. old_string должен совпадать ДОСЛОВНО (с пробелами/отступами) и встречаться РОВНО один раз — включай достаточно контекста для уникальности.",
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
      name: "delete_file",
      description: "Удалить файл в проекте.",
      parameters: {
        type: "object",
        properties: {
          path: { type: "string", description: "Путь к файлу" },
        },
        required: ["path"],
      },
    },
  },
];

export function isWriteTool(name: string): boolean {
  return name === "write_file" || name === "edit_file" || name === "delete_file";
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

/** Apply a prepared mutation to disk. */
export async function applyWrite(p: PreparedWrite): Promise<void> {
  if (p.newContent === null) {
    await deleteEntry(p.path);
  } else {
    await writeTextFile(p.path, p.newContent);
  }
}
