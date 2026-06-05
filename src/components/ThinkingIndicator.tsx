import { useState, useEffect, useMemo } from "react";
import { useT } from "../lib/i18n";

/** Animated thinking indicator with elapsed timer.
 *  After ~10 s of silence the label gradually shifts toward red,
 *  reaching full red at ~40 s (like Claude Code). */
export function ThinkingIndicator() {
  const t = useT();
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    const t0 = Date.now();
    const id = setInterval(() => setElapsed(Math.floor((Date.now() - t0) / 1000)), 200);
    return () => clearInterval(id);
  }, []);

  const dots = ".".repeat((elapsed % 3) + 1);

  // 0-10s: normal muted color, 10-40s: lerp toward red
  const progress = Math.min(Math.max((elapsed - 10) / 30, 0), 1);

  const textColor = useMemo(() => {
    if (progress <= 0) return "var(--color-muted)";
    // Interpolate from #8a8a8a (muted) → #ef4444 (danger red)
    const r = Math.round(138 + (239 - 138) * progress);
    const g = Math.round(138 + (68 - 138) * progress);
    const b = Math.round(138 + (68 - 138) * progress);
    return `rgb(${r}, ${g}, ${b})`;
  }, [progress]);

  const dotColor = useMemo(() => {
    if (progress <= 0) return "var(--color-muted)";
    const r = Math.round(138 + (239 - 138) * progress);
    const g = Math.round(138 + (68 - 138) * progress);
    const b = Math.round(138 + (68 - 138) * progress);
    return `rgb(${r}, ${g}, ${b})`;
  }, [progress]);

  return (
    <div
      className="flex items-center gap-2 text-[13px] transition-colors duration-700"
      style={{ color: textColor }}
    >
      <span className="flex gap-[3px]">
        <span
          className="h-1.5 w-1.5 rounded-full animate-[pulse_1.2s_ease-in-out_infinite]"
          style={{ backgroundColor: dotColor }}
        />
        <span
          className="h-1.5 w-1.5 rounded-full animate-[pulse_1.2s_ease-in-out_0.3s_infinite]"
          style={{ backgroundColor: dotColor }}
        />
        <span
          className="h-1.5 w-1.5 rounded-full animate-[pulse_1.2s_ease-in-out_0.6s_infinite]"
          style={{ backgroundColor: dotColor }}
        />
      </span>
      <span>{t("Думаю")}{dots.padEnd(3, "\u00a0")} {elapsed}с</span>
    </div>
  );
}
