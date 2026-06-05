import { useState, useEffect } from "react";

/** Animated thinking indicator with elapsed timer. */
export function ThinkingIndicator() {
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    const t0 = Date.now();
    const id = setInterval(() => setElapsed(Math.floor((Date.now() - t0) / 1000)), 200);
    return () => clearInterval(id);
  }, []);

  const dots = ".".repeat((elapsed % 3) + 1);

  return (
    <div className="flex items-center gap-2 text-[13px] text-[var(--color-muted)]">
      <span className="flex gap-[3px]">
        <span className="h-1.5 w-1.5 rounded-full bg-[var(--color-muted)] animate-[pulse_1.2s_ease-in-out_infinite]" />
        <span className="h-1.5 w-1.5 rounded-full bg-[var(--color-muted)] animate-[pulse_1.2s_ease-in-out_0.3s_infinite]" />
        <span className="h-1.5 w-1.5 rounded-full bg-[var(--color-muted)] animate-[pulse_1.2s_ease-in-out_0.6s_infinite]" />
      </span>
      <span>Думаю{dots.padEnd(3, "\u00a0")} {elapsed}с</span>
    </div>
  );
}
