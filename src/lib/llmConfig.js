const STORAGE_KEY = "mccc_explorer_llm_config_v1";

export const DEFAULT_LLM_CONFIG = {
  model: "deepseek-ai/DeepSeek-R1-Distill-Llama-8B",
  apiKey: "sk-private-cloud",
};

export function loadLlmConfig() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULT_LLM_CONFIG };
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return { ...DEFAULT_LLM_CONFIG };
    return {
      model: typeof parsed.model === "string" && parsed.model.trim() ? parsed.model.trim() : DEFAULT_LLM_CONFIG.model,
      apiKey: typeof parsed.apiKey === "string" && parsed.apiKey.trim() ? parsed.apiKey.trim() : DEFAULT_LLM_CONFIG.apiKey,
    };
  } catch {
    return { ...DEFAULT_LLM_CONFIG };
  }
}

export function saveLlmConfig(next) {
  if (!next || typeof next !== "object") return;
  const safe = {
    model: typeof next.model === "string" ? next.model.trim() : DEFAULT_LLM_CONFIG.model,
    apiKey: typeof next.apiKey === "string" ? next.apiKey.trim() : DEFAULT_LLM_CONFIG.apiKey,
  };
  localStorage.setItem(STORAGE_KEY, JSON.stringify(safe));
}

export function resetLlmConfig() {
  localStorage.removeItem(STORAGE_KEY);
}
