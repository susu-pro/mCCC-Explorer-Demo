import React from "react";
import MarkdownLite from "./MarkdownLite";
import TypewriterText from "./TypewriterText";

export default function TypewriterMarkdown({ markdown, cps = 90, entities, onEntityClick }) {
  const text = typeof markdown === "string" ? markdown : "";
  const [done, setDone] = React.useState(false);

  React.useEffect(() => {
    setDone(false);
  }, [text]);

  if (!text) return null;

  return (
    <div>
      {!done ? (
        <TypewriterText
          text={text}
          cps={cps}
          className="mono"
          style={{ margin: 0, whiteSpace: "pre-wrap", color: "rgba(15,23,42,0.86)", fontSize: 13 }}
          onDone={() => setDone(true)}
        />
      ) : (
        <div className="anim-in">
          <MarkdownLite markdown={text} entities={entities} onEntityClick={onEntityClick} />
        </div>
      )}
    </div>
  );
}
