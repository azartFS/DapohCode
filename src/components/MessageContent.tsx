import { useState } from "react";

interface Segment {
  type: "text" | "code";
  content: string;
  lang?: string;
}

/** Split message text into prose and fenced code blocks (```lang ... ```). */
function parseSegments(text: string): Segment[] {
  const segments: Segment[] = [];
  const re = /```(\w*)\n?([\s\S]*?)```/g;
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) {
      segments.push({ type: "text", content: text.slice(last, m.index) });
    }
    segments.push({ type: "code", lang: m[1] || "", content: m[2] });
    last = re.lastIndex;
  }
  let rest = text.slice(last);
  // Handle a dangling, still-streaming open fence.
  const open = rest.indexOf("```");
  if (open !== -1) {
    if (open > 0) segments.push({ type: "text", content: rest.slice(0, open) });
    let code = rest.slice(open + 3);
    const nl = code.indexOf("\n");
    let lang = "";
    if (nl !== -1 && /^\w*$/.test(code.slice(0, nl))) {
      lang = code.slice(0, nl);
      code = code.slice(nl + 1);
    }
    segments.push({ type: "code", lang, content: code });
    rest = "";
  }
  if (rest.length > 0) segments.push({ type: "text", content: rest });
  return segments;
}

function CodeBlock({ lang, content }: { lang: string; content: string }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(content);
      setCopied(true);
      setTimeout(() => setCopied(false), 1200);
    } catch {
      /* ignore */
    }
  };
  return (
    <div className="my-2 overflow-hidden rounded-lg border border-[var(--color-border)] bg-[var(--color-bg)]">
      <div className="flex items-center justify-between border-b border-[var(--color-border)] bg-[var(--color-surface-2)] px-3 py-1.5">
        <span className="font-mono text-[11px] text-[var(--color-faint)]">
          {lang || "code"}
        </span>
        <button
          onClick={copy}
          className="text-[11px] text-[var(--color-muted)] transition-colors hover:text-white"
        >
          {copied ? "скопировано" : "копировать"}
        </button>
      </div>
      <pre className="selectable overflow-x-auto px-3 py-2.5 font-mono text-[12.5px] leading-relaxed text-[#e6e6e6]">
        <code>{content.replace(/\n$/, "")}</code>
      </pre>
    </div>
  );
}

export function MessageContent({ text }: { text: string }) {
  const segments = parseSegments(text);
  return (
    <div className="selectable whitespace-pre-wrap break-words leading-relaxed">
      {segments.map((seg, i) =>
        seg.type === "code" ? (
          <CodeBlock key={i} lang={seg.lang || ""} content={seg.content} />
        ) : (
          <span key={i}>{seg.content}</span>
        ),
      )}
    </div>
  );
}
