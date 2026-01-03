import React from "react";

function clamp(n, a, b) {
  return Math.max(a, Math.min(b, n));
}

export default function TypewriterText({ text, cps = 80, updateIntervalMs = 100, className, style, onDone }) {
  const full = typeof text === "string" ? text : "";
  const [shown, setShown] = React.useState(full);

  React.useEffect(() => {
    if (!full) {
      setShown("");
      return;
    }

    const targetCps = clamp(Number(cps) || 80, 20, 220);
    const interval = clamp(Number(updateIntervalMs) || 100, 50, 500);
    const start = performance.now();
    let doneCalled = false;

    setShown("");

    const tick = () => {
      const now = performance.now();
      const n = Math.floor(((now - start) * targetCps) / 1000);
      if (n >= full.length) {
        setShown((prev) => (prev === full ? prev : full));
        if (!doneCalled && typeof onDone === "function") {
          doneCalled = true;
          onDone();
        }
        return;
      }
      const next = full.slice(0, Math.max(0, n));
      setShown((prev) => (prev === next ? prev : next));
    };

    tick();
    const t = setInterval(tick, interval);
    return () => clearInterval(t);
  }, [full, cps, updateIntervalMs, onDone]);

  return (
    <pre className={className} style={style}>
      {shown}
      {shown.length < full.length ? <span className="type-caret" aria-hidden="true" /> : null}
    </pre>
  );
}
