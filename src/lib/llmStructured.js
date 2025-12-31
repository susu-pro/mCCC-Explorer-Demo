function stripJsonCodeFence(s) {
  const t = String(s ?? "").trim();
  const m = t.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  return m ? m[1].trim() : t;
}

function safeParseJson(s) {
  const t = stripJsonCodeFence(s);
  if (!t) return null;
  try {
    return JSON.parse(t);
  } catch {
    return null;
  }
}

export function parseStructuredLlmAnswer(answer) {
  const text = String(answer ?? "");

  const mdStart = text.indexOf("[REPORT_MD]");
  const mdEnd = text.indexOf("[/REPORT_MD]");
  const jsonStart = text.indexOf("[PAYLOAD_JSON]");
  const jsonEnd = text.indexOf("[/PAYLOAD_JSON]");

  // Fallback: no structure
  if (mdStart === -1 || mdEnd === -1) {
    return { markdown: text.trim(), payload: null, raw: text.trim(), structured: false };
  }

  const markdown = text.slice(mdStart + "[REPORT_MD]".length, mdEnd).trim();

  let payload = null;
  if (jsonStart !== -1 && jsonEnd !== -1 && jsonEnd > jsonStart) {
    const jsonText = text.slice(jsonStart + "[PAYLOAD_JSON]".length, jsonEnd).trim();
    payload = safeParseJson(jsonText);
  }

  return { markdown, payload, raw: text.trim(), structured: true };
}

