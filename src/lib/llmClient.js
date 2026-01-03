import { getLlmApiUrl } from "./llmEnv";
import { mockChatCompletions } from "./mockLlm";

function normalizeBaseUrl(baseUrl) {
  const s = String(baseUrl ?? "").trim();
  return s.endsWith("/") ? s.slice(0, -1) : s;
}

function hasAssistantContent(json) {
  const c0 = json?.choices?.[0];
  const content = c0?.message?.content;
  const text = c0?.text;
  if (typeof content === "string" && content.trim()) return true;
  if (typeof text === "string" && text.trim()) return true;
  return false;
}

export async function chatCompletions({ apiKey, body, signal, timeoutMs = 12000 }) {
  const baseUrl = getLlmApiUrl();
  if (!baseUrl) return mockChatCompletions({ body, reason: "ENV_MISSING" });

  const url = `${normalizeBaseUrl(baseUrl)}/chat/completions`;
  let res;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), Math.max(1000, Number(timeoutMs) || 12000));
  try {
    res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey ?? ""}`,
      },
      body: JSON.stringify(body),
      signal: signal ?? ctrl.signal,
    });
  } catch (e) {
    clearTimeout(timer);
    return mockChatCompletions({ body, reason: e?.name === "AbortError" ? "TIMEOUT" : "NETWORK_OR_CORS" });
  }
  clearTimeout(timer);

  let text = "";
  try {
    text = await res.text();
  } catch {
    return mockChatCompletions({ body, reason: "READ_BODY_FAILED" });
  }
  if (!res.ok) {
    return mockChatCompletions({ body, reason: `HTTP_${res.status}` });
  }
  try {
    const json = JSON.parse(text);
    if (!hasAssistantContent(json)) {
      return mockChatCompletions({ body, reason: "INVALID_RESPONSE_SHAPE" });
    }
    json.mock = false;
    return json;
  } catch {
    return mockChatCompletions({ body, reason: "NON_JSON_RESPONSE" });
  }
}

export function extractAssistantText(resp) {
  const c0 = resp?.choices?.[0];
  const msg = c0?.message?.content;
  if (typeof msg === "string") return msg;
  const text = c0?.text;
  return typeof text === "string" ? text : "";
}
