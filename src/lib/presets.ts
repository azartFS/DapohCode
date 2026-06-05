export interface ProviderPreset {
  name: string;
  baseUrl: string;
  /** Optional hint shown under the form (e.g. where to get a key). */
  hint?: string;
}

/**
 * Presets for popular OpenAI-compatible providers. The user still adds the API
 * key (and edits the base URL if needed) — these only prefill sensible values.
 */
export const PROVIDER_PRESETS: ProviderPreset[] = [
  // ─── Major / aggregators ───
  {
    name: "NVIDIA",
    baseUrl: "https://integrate.api.nvidia.com/v1",
    hint: "Ключ: build.nvidia.com → API Keys",
  },
  { name: "OpenAI", baseUrl: "https://api.openai.com/v1" },
  { name: "OpenRouter", baseUrl: "https://openrouter.ai/api/v1" },
  {
    name: "Anthropic (OpenAI-совмест.)",
    baseUrl: "https://api.anthropic.com/v1",
  },
  {
    name: "Google Gemini (OpenAI-совмест.)",
    baseUrl: "https://generativelanguage.googleapis.com/v1beta/openai",
  },
  { name: "xAI (Grok)", baseUrl: "https://api.x.ai/v1" },
  { name: "DeepSeek", baseUrl: "https://api.deepseek.com/v1" },
  { name: "Mistral", baseUrl: "https://api.mistral.ai/v1" },
  {
    name: "Cohere (OpenAI-совмест.)",
    baseUrl: "https://api.cohere.ai/compatibility/v1",
  },
  {
    name: "GitHub Models",
    baseUrl: "https://models.inference.ai.azure.com",
    hint: "Ключ: GitHub Personal Access Token (models:read)",
  },
  {
    name: "Azure OpenAI",
    baseUrl:
      "https://<resource>.openai.azure.com/openai/deployments/<deployment>",
    hint: "Замените <resource> и <deployment> на свои.",
  },

  // ─── Fast inference / hosting ───
  { name: "Groq", baseUrl: "https://api.groq.com/openai/v1" },
  { name: "Cerebras", baseUrl: "https://api.cerebras.ai/v1" },
  { name: "SambaNova", baseUrl: "https://api.sambanova.ai/v1" },
  { name: "Together", baseUrl: "https://api.together.xyz/v1" },
  { name: "Fireworks", baseUrl: "https://api.fireworks.ai/inference/v1" },
  { name: "DeepInfra", baseUrl: "https://api.deepinfra.com/v1/openai" },
  { name: "Hyperbolic", baseUrl: "https://api.hyperbolic.xyz/v1" },
  { name: "Novita AI", baseUrl: "https://api.novita.ai/v3/openai" },
  { name: "Nebius AI Studio", baseUrl: "https://api.studio.nebius.ai/v1" },
  { name: "Friendli", baseUrl: "https://inference.friendli.ai/v1" },
  { name: "Featherless", baseUrl: "https://api.featherless.ai/v1" },
  { name: "Kluster.ai", baseUrl: "https://api.kluster.ai/v1" },
  { name: "Perplexity", baseUrl: "https://api.perplexity.ai" },
  {
    name: "Cloudflare Workers AI",
    baseUrl: "https://api.cloudflare.com/client/v4/accounts/<account_id>/ai/v1",
    hint: "Замените <account_id> на ID своего аккаунта Cloudflare.",
  },

  // ─── China / APAC ───
  { name: "Moonshot (Kimi)", baseUrl: "https://api.moonshot.ai/v1" },
  { name: "Zhipu GLM", baseUrl: "https://open.bigmodel.cn/api/paas/v4" },
  {
    name: "Alibaba Qwen (DashScope)",
    baseUrl: "https://dashscope-intl.aliyuncs.com/compatible-mode/v1",
  },
  { name: "01.AI (Yi)", baseUrl: "https://api.lingyiwanwu.com/v1" },

  // ─── Local ───
  { name: "Ollama (локально)", baseUrl: "http://localhost:11434/v1" },
  { name: "LM Studio (локально)", baseUrl: "http://localhost:1234/v1" },
  { name: "vLLM (локально)", baseUrl: "http://localhost:8000/v1" },
  { name: "llama.cpp (локально)", baseUrl: "http://localhost:8080/v1" },
  { name: "Jan (локально)", baseUrl: "http://localhost:1337/v1" },
  { name: "KoboldCpp (локально)", baseUrl: "http://localhost:5001/v1" },
  {
    name: "text-generation-webui (локально)",
    baseUrl: "http://localhost:5000/v1",
  },

  // ─── Custom ───
  { name: "Своё (Custom)", baseUrl: "" },
];
