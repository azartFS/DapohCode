import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import { open } from "@tauri-apps/plugin-dialog";

/** Open a native folder picker. Returns the chosen absolute path or null. */
export async function pickFolder(): Promise<string | null> {
  const res = await open({ directory: true, multiple: false });
  return typeof res === "string" ? res : null;
}

/* ─────────────────────────── Filesystem (agent tools) ─────────────────── */

export interface FsEntry {
  name: string;
  path: string;
  is_dir: boolean;
}

export interface SearchHit {
  path: string;
  line: number;
  text: string;
}

export async function readDir(path: string): Promise<FsEntry[]> {
  return await invoke<FsEntry[]>("read_dir", { path });
}
export async function readTextFile(path: string): Promise<string> {
  return await invoke<string>("read_text_file", { path });
}
export async function writeTextFile(path: string, content: string): Promise<void> {
  await invoke("write_text_file", { path, content });
}
export async function createEntry(
  parent: string,
  name: string,
  isDir: boolean,
): Promise<string> {
  return await invoke<string>("create_entry", { parent, name, isDir });
}
export async function renameEntry(path: string, newName: string): Promise<string> {
  return await invoke<string>("rename_entry", { path, newName });
}
export async function deleteEntry(path: string): Promise<void> {
  await invoke("delete_entry", { path });
}

/** Recursive project tree — returns relative paths, dirs end with '/'. */
export async function grepRegex(
  path: string,
  pattern: string,
  glob?: string,
  maxResults?: number,
): Promise<Array<{ path: string; line: number; text: string }>> {
  return await invoke("grep_regex", {
    path,
    pattern,
    glob: glob ?? null,
    maxResults: maxResults ?? null,
  });
}

export async function readTree(
  path: string,
  maxEntries?: number,
): Promise<string[]> {
  return await invoke<string[]>("read_tree", {
    path,
    maxEntries: maxEntries ?? null,
  });
}

/** Case-insensitive text search across project files. */
export async function searchText(
  path: string,
  query: string,
  maxResults?: number,
): Promise<SearchHit[]> {
  return await invoke<SearchHit[]>("search_text", {
    path,
    query,
    maxResults: maxResults ?? null,
  });
}

/* ─────────────────────────── Shell (run_command) ──────────────────────── */

export interface RunCommandResult {
  exit_code: number | null;
  stdout: string;
  stderr: string;
  timed_out: boolean;
}

/** Execute a shell command inside a directory with a timeout. */
export async function runCommand(
  command: string,
  cwd: string,
  timeoutSecs?: number,
): Promise<RunCommandResult> {
  return await invoke<RunCommandResult>("run_command", {
    req: {
      command,
      cwd,
      timeout_secs: timeoutSecs ?? null,
    },
  });
}

/* ─────────────────────────── Agent (tool-calling) ──────────────────────── */

export interface AgentToolCall {
  id: string;
  name: string;
  arguments: string;
}
export interface AgentResponse {
  content: string | null;
  tool_calls: AgentToolCall[];
}
export interface AgentRequest {
  baseUrl: string;
  apiKey: string;
  model: string;
  messages: unknown[];
  tools: unknown;
  reasoningEffort?: string | null;
}
export async function agentComplete(req: AgentRequest): Promise<AgentResponse> {
  return await invoke<AgentResponse>("agent_complete", {
    req: {
      base_url: req.baseUrl,
      api_key: req.apiKey,
      model: req.model,
      messages: req.messages,
      tools: req.tools,
      reasoning_effort: req.reasoningEffort ?? null,
    },
  });
}

/** Streaming agent completion — emits "agent-delta" events for text tokens,
 *  returns the full AgentResponse (content + tool_calls) when done. */
export async function agentStream(req: AgentRequest): Promise<AgentResponse> {
  return await invoke<AgentResponse>("agent_stream", {
    req: {
      base_url: req.baseUrl,
      api_key: req.apiKey,
      model: req.model,
      messages: req.messages,
      tools: req.tools,
      reasoning_effort: req.reasoningEffort ?? null,
    },
  });
}

export interface AgentDeltaEvent {
  content: string;
}

export function onAgentDelta(
  cb: (e: AgentDeltaEvent) => void,
): Promise<UnlistenFn> {
  return listen<AgentDeltaEvent>("agent-delta", (e) => cb(e.payload));
}

export interface ChatOnceRequest {
  baseUrl: string;
  apiKey: string;
  model: string;
  messages: { role: string; content: string }[];
  temperature?: number | null;
}

/** Non-streaming single completion (used for short helper calls). */
export async function chatOnce(req: ChatOnceRequest): Promise<string> {
  return await invoke<string>("chat_once", {
    req: {
      base_url: req.baseUrl,
      api_key: req.apiKey,
      model: req.model,
      messages: req.messages,
      temperature: req.temperature ?? null,
    },
  });
}

export interface ChatStreamRequest {
  requestId: string;
  baseUrl: string;
  apiKey: string;
  model: string;
  messages: { role: string; content: string }[];
  temperature?: number | null;
  reasoningEffort?: string | null;
}

export async function chatStream(req: ChatStreamRequest): Promise<void> {
  await invoke("chat_stream", {
    req: {
      request_id: req.requestId,
      base_url: req.baseUrl,
      api_key: req.apiKey,
      model: req.model,
      messages: req.messages,
      temperature: req.temperature ?? null,
      reasoning_effort: req.reasoningEffort ?? null,
    },
  });
}

export async function cancelChat(): Promise<void> {
  await invoke("cancel_chat");
}

/** List available models from an OpenAI-compatible provider (GET /models). */
export async function listModels(
  baseUrl: string,
  apiKey: string,
): Promise<string[]> {
  return await invoke<string[]>("list_models", {
    req: { base_url: baseUrl, api_key: apiKey },
  });
}

/** Model ids (full + short) that support reasoning, per the models.dev catalogue. */
export async function listReasoningModels(): Promise<string[]> {
  return await invoke<string[]>("list_reasoning_models", {
    req: { url: null },
  });
}

export interface DeltaEvent {
  request_id: string;
  content: string;
}
export interface DoneEvent {
  request_id: string;
}
export interface ErrorEvent {
  request_id: string;
  message: string;
}

export function onChatDelta(cb: (e: DeltaEvent) => void): Promise<UnlistenFn> {
  return listen<DeltaEvent>("chat-delta", (e) => cb(e.payload));
}
export function onChatDone(cb: (e: DoneEvent) => void): Promise<UnlistenFn> {
  return listen<DoneEvent>("chat-done", (e) => cb(e.payload));
}
export function onChatError(cb: (e: ErrorEvent) => void): Promise<UnlistenFn> {
  return listen<ErrorEvent>("chat-error", (e) => cb(e.payload));
}
