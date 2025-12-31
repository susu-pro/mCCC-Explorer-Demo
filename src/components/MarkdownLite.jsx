import React from "react";

function escapeText(s) {
  return String(s ?? "");
}

function parseInline(text) {
  const s = escapeText(text);
  const nodes = [];
  let i = 0;

  const pushText = (t) => {
    if (!t) return;
    nodes.push(t);
  };

  while (i < s.length) {
    // inline code: `...`
    if (s[i] === "`") {
      const j = s.indexOf("`", i + 1);
      if (j !== -1) {
        const code = s.slice(i + 1, j);
        nodes.push(
          <code key={`code-${i}`} className="md-code">
            {code}
          </code>,
        );
        i = j + 1;
        continue;
      }
    }

    // bold: **...**
    if (s[i] === "*" && s[i + 1] === "*") {
      const j = s.indexOf("**", i + 2);
      if (j !== -1) {
        const inner = s.slice(i + 2, j);
        nodes.push(
          <strong key={`b-${i}`} className="md-strong">
            {inner}
          </strong>,
        );
        i = j + 2;
        continue;
      }
    }

    // plain text run
    let next = s.length;
    const n1 = s.indexOf("`", i);
    if (n1 !== -1) next = Math.min(next, n1);
    const n2 = s.indexOf("**", i);
    if (n2 !== -1) next = Math.min(next, n2);
    const chunk = s.slice(i, next);
    pushText(chunk);
    i = next;
  }

  return nodes;
}

function normalizeEntities(entities) {
  const out = [];
  for (const e of Array.isArray(entities) ? entities : []) {
    if (!e || typeof e !== "object") continue;
    const kind = typeof e.kind === "string" ? e.kind.trim() : "";
    const value = typeof e.value === "string" ? e.value.trim() : "";
    if (!kind || !value) continue;
    out.push({ kind, value });
  }
  // longest-first to reduce partial matches
  out.sort((a, b) => b.value.length - a.value.length);
  return out;
}

function splitByEntities(text, entities) {
  const s = String(text ?? "");
  if (!s || !entities.length) return [s];
  const parts = [];
  let i = 0;
  while (i < s.length) {
    let best = null;
    for (const e of entities) {
      const idx = s.indexOf(e.value, i);
      if (idx === -1) continue;
      if (!best || idx < best.idx || (idx === best.idx && e.value.length > best.e.value.length)) best = { idx, e };
    }
    if (!best) {
      parts.push(s.slice(i));
      break;
    }
    if (best.idx > i) parts.push(s.slice(i, best.idx));
    parts.push({ kind: best.e.kind, value: best.e.value });
    i = best.idx + best.e.value.length;
  }
  return parts;
}

function enhanceInline(nodes, entities, onEntityClick) {
  const es = normalizeEntities(entities);
  if (!es.length) return nodes;

  const out = [];
  for (let idx = 0; idx < nodes.length; idx += 1) {
    const n = nodes[idx];
    if (typeof n !== "string") {
      out.push(n);
      continue;
    }
    const parts = splitByEntities(n, es);
    for (let j = 0; j < parts.length; j += 1) {
      const p = parts[j];
      if (typeof p === "string") {
        out.push(p);
        continue;
      }
      out.push(
        <button
          key={`ent-${idx}-${j}-${p.kind}-${p.value}`}
          type="button"
          className={`md-entity md-entity-${p.kind}`}
          onClick={() => (typeof onEntityClick === "function" ? onEntityClick(p.kind, p.value) : null)}
          title={`Click to focus: ${p.kind}`}
        >
          {p.value}
        </button>,
      );
    }
  }
  return out;
}

function parseBlocks(md) {
  const lines = String(md ?? "").replaceAll("\r\n", "\n").split("\n");
  const blocks = [];
  let i = 0;

  let inCode = false;
  let codeBuf = [];
  let codeLang = "";

  const flushCode = () => {
    if (!codeBuf.length) return;
    blocks.push({ type: "code", lang: codeLang, text: codeBuf.join("\n") });
    codeBuf = [];
    codeLang = "";
  };

  const flushParagraph = (buf) => {
    const t = buf.join(" ").trim();
    if (t) blocks.push({ type: "p", text: t });
    buf.length = 0;
  };

  const para = [];
  while (i < lines.length) {
    const raw = lines[i];
    const line = raw.replace(/\s+$/, "");
    i += 1;

    if (line.startsWith("```")) {
      const lang = line.slice(3).trim();
      if (!inCode) {
        flushParagraph(para);
        inCode = true;
        codeLang = lang;
      } else {
        inCode = false;
        flushCode();
      }
      continue;
    }

    if (inCode) {
      codeBuf.push(raw);
      continue;
    }

    if (!line.trim()) {
      flushParagraph(para);
      continue;
    }

    // heading
    const hm = line.match(/^(#{1,3})\s+(.*)$/);
    if (hm) {
      flushParagraph(para);
      blocks.push({ type: "h", level: hm[1].length, text: hm[2].trim() });
      continue;
    }

    // list item (ordered / unordered)
    const um = line.match(/^\s*[-*]\s+(.*)$/);
    const om = line.match(/^\s*(\d+)\.\s+(.*)$/);
    if (um || om) {
      flushParagraph(para);
      const items = [];
      const ordered = !!om;
      const first = (um ? um[1] : om[2]).trim();
      items.push(first);
      // consume following list items of same kind
      while (i < lines.length) {
        const l2 = lines[i].replace(/\s+$/, "");
        const um2 = l2.match(/^\s*[-*]\s+(.*)$/);
        const om2 = l2.match(/^\s*(\d+)\.\s+(.*)$/);
        if (ordered && om2) {
          items.push(om2[2].trim());
          i += 1;
          continue;
        }
        if (!ordered && um2) {
          items.push(um2[1].trim());
          i += 1;
          continue;
        }
        break;
      }
      blocks.push({ type: "list", ordered, items });
      continue;
    }

    para.push(line.trim());
  }

  if (inCode) flushCode();
  flushParagraph(para);
  return blocks;
}

export default function MarkdownLite({ markdown, entities, onEntityClick }) {
  const blocks = React.useMemo(() => parseBlocks(markdown), [markdown]);
  return (
    <div className="md">
      {blocks.map((b, idx) => {
        if (b.type === "h") {
          const Tag = b.level === 1 ? "h2" : b.level === 2 ? "h3" : "h4";
          return (
            <Tag key={idx} className={`md-h md-h${b.level}`}>
              {enhanceInline(parseInline(b.text), entities, onEntityClick)}
            </Tag>
          );
        }
        if (b.type === "list") {
          const L = b.ordered ? "ol" : "ul";
          return (
            <L key={idx} className="md-list">
              {b.items.map((it, j) => (
                <li key={j} className="md-li">
                  {enhanceInline(parseInline(it), entities, onEntityClick)}
                </li>
              ))}
            </L>
          );
        }
        if (b.type === "code") {
          return (
            <pre key={idx} className="md-pre">
              <code>{b.text}</code>
            </pre>
          );
        }
        return (
          <p key={idx} className="md-p">
            {enhanceInline(parseInline(b.text), entities, onEntityClick)}
          </p>
        );
      })}
    </div>
  );
}
