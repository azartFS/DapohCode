/** Strip the provider prefix from a model id for display.
 *  e.g. "meta/llama-3.3-70b-instruct" -> "llama-3.3-70b-instruct" */
export function displayModelName(id: string): string {
  if (!id) return id;
  const i = id.lastIndexOf("/");
  return i >= 0 ? id.slice(i + 1) : id;
}

/** Heuristic fallback used only when the models.dev catalogue is unavailable. */
function heuristicReasoning(modelId: string): boolean {
  const n = displayModelName(modelId).toLowerCase();
  return (
    /(^|[-/])(o1|o3|o4)([-/]|$)/.test(n) ||
    n.includes("gpt-5") ||
    n.includes("reason") ||
    n.includes("deepseek-r1") ||
    n.includes("qwq") ||
    n.includes("magistral") ||
    n.includes("thinking")
  );
}

/** Whether a model supports the OpenAI-style `reasoning_effort` parameter.
 *  Primary source is the models.dev catalogue (`reasoningIds`); if that is
 *  empty (e.g. offline), fall back to a small name heuristic. */
export function supportsReasoning(
  reasoningIds: string[] | Set<string>,
  modelId: string,
): boolean {
  if (!modelId) return false;
  const set =
    reasoningIds instanceof Set ? reasoningIds : new Set(reasoningIds);
  if (set.size === 0) return heuristicReasoning(modelId);
  return set.has(modelId) || set.has(displayModelName(modelId));
}
