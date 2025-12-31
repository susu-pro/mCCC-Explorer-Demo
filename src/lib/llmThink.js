export function splitThink(content) {
  const text = typeof content === "string" ? content : "";
  const m = text.match(/<think>([\s\S]*?)<\/think>/i);
  if (m) {
    const think = (m[1] ?? "").trim();
    const answer = text.replace(m[0], "").trim();
    return { think, answer };
  }

  // Some R1-style endpoints may accidentally drop the opening tag and only return `</think>`.
  const endIdx = text.toLowerCase().indexOf("</think>");
  if (endIdx !== -1) {
    const think = text.slice(0, endIdx).trim();
    const answer = text.slice(endIdx + "</think>".length).trim();
    return { think, answer };
  }

  return { think: "", answer: text.trim() };
}
