import fs from "node:fs/promises";
import Papa from "papaparse";
import { buildMcccDataInterpretationPrompt, buildTopRowsCsv } from "../src/lib/llmPrompts.js";
import { splitThink } from "../src/lib/llmThink.js";

function argValue(name) {
  const i = process.argv.indexOf(name);
  if (i === -1) return undefined;
  return process.argv[i + 1];
}

const filePath = argValue("--file") ?? new URL("../communication_result.tsv", import.meta.url).pathname;
const sender = argValue("--sender") ?? "";
const receiver = argValue("--receiver") ?? "";

const baseUrl = process.env.LLM_BASE_URL ?? process.env.VITE_LLM_API_URL ?? "";
const model = process.env.LLM_MODEL ?? "deepseek-ai/DeepSeek-R1-Distill-Llama-8B";
const apiKey = process.env.LLM_API_KEY ?? "sk-private-cloud";

function normalizeLabel(v) {
  if (v === null || v === undefined) return "";
  return String(v).replace(/\s+/g, " ").trim();
}

function toNumber(v) {
  if (v === null || v === undefined) return undefined;
  if (typeof v === "number" && Number.isFinite(v)) return v;
  const s = String(v).trim();
  if (!s) return undefined;
  const n = Number(s);
  return Number.isFinite(n) ? n : undefined;
}

function findHeader(headers, candidates) {
  const lower = headers.map((h) => [h, normalizeLabel(h).toLowerCase()]);
  for (const c of candidates) {
    const exact = lower.find(([, v]) => v === c);
    if (exact) return exact[0];
  }
  for (const c of candidates) {
    const partial = lower.find(([, v]) => v.includes(c));
    if (partial) return partial[0];
  }
  return undefined;
}

const tsv = await fs.readFile(filePath, "utf-8");
const parsed = Papa.parse(tsv, { header: true, skipEmptyLines: true, delimiter: "\t" });
if (parsed.errors?.length) throw new Error(parsed.errors[0].message);
const rows = parsed.data ?? [];
const headers = Object.keys(rows[0] ?? {});

const mapping = {
  sender: findHeader(headers, ["sender", "source", "from"]) ?? "Sender",
  receiver: findHeader(headers, ["receiver", "target", "to"]) ?? "Receiver",
  metabolite:
    findHeader(headers, ["metabolite_name", "metabolite"]) ??
    (headers.includes("Metabolite_Name") ? "Metabolite_Name" : headers.includes("Metabolite") ? "Metabolite" : undefined),
  fdr:
    findHeader(headers, ["permutation_test_fdr", "fdr", "qvalue", "padj"]) ??
    (headers.includes("permutation_test_fdr") ? "permutation_test_fdr" : headers.includes("FDR") ? "FDR" : undefined),
};

const events = [];
for (const raw of rows) {
  const s = normalizeLabel(raw[mapping.sender]);
  const r = normalizeLabel(raw[mapping.receiver]);
  if (!s || !r) continue;
  const met = mapping.metabolite ? normalizeLabel(raw[mapping.metabolite]) : "";
  let fdr = mapping.fdr ? toNumber(raw[mapping.fdr]) : undefined;
  if (typeof fdr === "number") {
    if (fdr < 0) fdr = undefined;
    if (fdr === 0) fdr = 1e-300;
    if (fdr > 1) fdr = undefined;
  }
  const weight = typeof fdr === "number" && fdr > 0 ? -Math.log10(fdr) : 1;
  events.push({ sender: s, receiver: r, metabolite: met || undefined, fdr, weight, raw });
}

const filters = {
  fdrMax: 0.05,
  includeSelfLoops: false,
  topEdges: 300,
  metaboliteQuery: "",
  sensorQuery: "",
  annotationQuery: "",
  fluxPass: "all",
  focusCell: undefined,
  focusMode: "any",
};

let filtered = events.filter((e) => {
  if (!filters.includeSelfLoops && e.sender === e.receiver) return false;
  if (typeof filters.fdrMax === "number" && typeof e.fdr === "number" && e.fdr > filters.fdrMax) return false;
  if (sender && e.sender !== sender) return false;
  if (receiver && e.receiver !== receiver) return false;
  return true;
});
if (typeof filters.topEdges === "number" && filters.topEdges > 0) {
  filtered = [...filtered].sort((a, b) => (b.weight ?? 0) - (a.weight ?? 0)).slice(0, filters.topEdges);
}

const prompt = buildMcccDataInterpretationPrompt({
  events: filtered,
  filters,
  weightMode: "neglog10_fdr",
  maxRows: 20,
});

const csv = buildTopRowsCsv(filtered, 20);
const metabolites = [...new Set(filtered.map((e) => e.metabolite).filter(Boolean))].slice(0, 15);

console.log(`Loaded ${rows.length} rows, mapped sender=${mapping.sender}, receiver=${mapping.receiver}, metabolite=${mapping.metabolite}, fdr=${mapping.fdr}`);
console.log(`Filtered events: ${filtered.length}`);
console.log(`Top metabolites (sample): ${metabolites.join(", ") || "NA"}`);
console.log("\n--- Prompt CSV (Top 20) ---\n");
console.log(csv);
console.log("\n--- LLM output ---\n");

if (!baseUrl) {
  throw new Error("Missing LLM_BASE_URL or VITE_LLM_API_URL for this script.");
}

const resp = await fetch(`${baseUrl.replace(/\\/+$/, "")}/chat/completions`, {
  method: "POST",
  headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
  body: JSON.stringify({
    model,
    messages: [{ role: "user", content: prompt }],
    max_tokens: 900,
    temperature: 0.2,
  }),
}).then(async (r) => {
  const t = await r.text();
  if (!r.ok) throw new Error(`HTTP ${r.status}: ${t.slice(0, 240)}`);
  return JSON.parse(t);
});

const text = extractAssistantText(resp);
const { think, answer } = splitThink(text);
if (think) {
  console.log("[think]\n" + think + "\n");
}
console.log(answer);
