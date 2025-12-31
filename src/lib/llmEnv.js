export function getLlmApiUrl() {
  const v = (import.meta.env?.VITE_LLM_API_URL ?? "").toString().trim();
  return v;
}

export function isMockMode() {
  return !getLlmApiUrl();
}

