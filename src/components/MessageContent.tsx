import { useState, useMemo, type ReactNode } from "react";

/* ────────── AST types ────────── */

type Block =
  | { type: "heading"; level: number; children: Inline[] }
  | { type: "paragraph"; children: Inline[] }
  | { type: "code"; lang: string; content: string }
  | { type: "list"; ordered: boolean; items: Block[][] }
  | { type: "blockquote"; children: Block[] }
  | { type: "hr" }
  | { type: "table"; headers: Inline[][]; rows: Inline[][][] };

type Inline =
  | { type: "text"; text: string }
  | { type: "bold"; children: Inline[] }
  | { type: "italic"; children: Inline[] }
  | { type: "code"; text: string }
  | { type: "link"; href: string; children: Inline[] }
  | { type: "br" };

/* ────────── Block parser ────────── */

function parseBlocks(src: string): Block[] {
  const lines = src.split("\n");
  const blocks: Block[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    // Fenced code block
    const fenceMatch = line.match(/^(`{3,})([\w+-]*)/);
    if (fenceMatch) {
      const fence = fenceMatch[1];
      const lang = fenceMatch[2] || "";
      const codeLines: string[] = [];
      i++;
      while (i < lines.length && !lines[i].startsWith(fence)) {
        codeLines.push(lines[i]);
        i++;
      }
      if (i < lines.length) i++; // skip closing fence
      blocks.push({ type: "code", lang, content: codeLines.join("\n") });
      continue;
    }

    // Heading
    const hMatch = line.match(/^(#{1,6})\s+(.+)$/);
    if (hMatch) {
      blocks.push({
        type: "heading",
        level: hMatch[1].length,
        children: parseInline(hMatch[2]),
      });
      i++;
      continue;
    }

    // Horizontal rule
    if (/^(-{3,}|\*{3,}|_{3,})\s*$/.test(line)) {
      blocks.push({ type: "hr" });
      i++;
      continue;
    }

    // Table (simple GFM)
    if (
      i + 1 < lines.length &&
      line.includes("|") &&
      /^\|?\s*:?-+:?\s*(\|\s*:?-+:?\s*)*\|?\s*$/.test(lines[i + 1])
    ) {
      const parseRow = (r: string) =>
        r
          .replace(/^\|/, "")
          .replace(/\|$/, "")
          .split("|")
          .map((c) => parseInline(c.trim()));
      const headers = parseRow(line);
      i += 2; // skip header + separator
      const rows: Inline[][][] = [];
      while (i < lines.length && lines[i].includes("|") && lines[i].trim() !== "") {
        rows.push(parseRow(lines[i]));
        i++;
      }
      blocks.push({ type: "table", headers, rows });
      continue;
    }

    // Blockquote
    if (line.startsWith("> ") || line === ">") {
      const bqLines: string[] = [];
      while (i < lines.length && (lines[i].startsWith("> ") || lines[i] === ">")) {
        bqLines.push(lines[i].replace(/^>\s?/, ""));
        i++;
      }
      blocks.push({ type: "blockquote", children: parseBlocks(bqLines.join("\n")) });
      continue;
    }

    // Unordered list
    if (/^[\s]*[-*+]\s/.test(line)) {
      const items: Block[][] = [];
      while (i < lines.length && /^[\s]*[-*+]\s/.test(lines[i])) {
        const itemText = lines[i].replace(/^[\s]*[-*+]\s/, "");
        items.push([{ type: "paragraph", children: parseInline(itemText) }]);
        i++;
        // Collect continuation lines (indented)
        while (i < lines.length && /^  /.test(lines[i]) && !/^[\s]*[-*+]\s/.test(lines[i])) {
          const last = items[items.length - 1];
          if (last.length === 1 && last[0].type === "paragraph") {
            last[0].children.push({ type: "br" });
            last[0].children.push(...parseInline(lines[i].replace(/^\s+/, "")));
          }
          i++;
        }
      }
      blocks.push({ type: "list", ordered: false, items });
      continue;
    }

    // Ordered list
    if (/^[\s]*\d+[.)]\s/.test(line)) {
      const items: Block[][] = [];
      while (i < lines.length && /^[\s]*\d+[.)]\s/.test(lines[i])) {
        const itemText = lines[i].replace(/^[\s]*\d+[.)]\s/, "");
        items.push([{ type: "paragraph", children: parseInline(itemText) }]);
        i++;
        while (i < lines.length && /^  /.test(lines[i]) && !/^[\s]*\d+[.)]\s/.test(lines[i])) {
          const last = items[items.length - 1];
          if (last.length === 1 && last[0].type === "paragraph") {
            last[0].children.push({ type: "br" });
            last[0].children.push(...parseInline(lines[i].replace(/^\s+/, "")));
          }
          i++;
        }
      }
      blocks.push({ type: "list", ordered: true, items });
      continue;
    }

    // Empty line
    if (line.trim() === "") {
      i++;
      continue;
    }

    // Paragraph — collect consecutive non-empty lines
    const paraLines: string[] = [];
    while (
      i < lines.length &&
      lines[i].trim() !== "" &&
      !lines[i].match(/^(#{1,6}\s|```|>|\s*[-*+]\s|\s*\d+[.)]\s|-{3,}|\*{3,}|_{3,})/)
    ) {
      paraLines.push(lines[i]);
      i++;
    }
    if (paraLines.length > 0) {
      blocks.push({ type: "paragraph", children: parseInline(paraLines.join("\n")) });
    }
  }

  return blocks;
}

/* ────────── Inline parser ────────── */

function parseInline(src: string): Inline[] {
  const nodes: Inline[] = [];
  // Regex for inline elements: bold, italic, code, links
  const re =
    /(\*\*\*(.+?)\*\*\*|\*\*(.+?)\*\*|\*(.+?)\*|`([^`\n]+)`|\[([^\]]+)\]\(([^)]+)\))/g;
  let last = 0;
  let m: RegExpExecArray | null;

  while ((m = re.exec(src)) !== null) {
    if (m.index > last) {
      nodes.push({ type: "text", text: src.slice(last, m.index) });
    }

    if (m[2]) {
      // bold+italic ***text***
      nodes.push({
        type: "bold",
        children: [{ type: "italic", children: [{ type: "text", text: m[2] }] }],
      });
    } else if (m[3]) {
      // bold **text**
      nodes.push({ type: "bold", children: parseInline(m[3]) });
    } else if (m[4]) {
      // italic *text*
      nodes.push({ type: "italic", children: parseInline(m[4]) });
    } else if (m[5]) {
      // inline code
      nodes.push({ type: "code", text: m[5] });
    } else if (m[6] && m[7]) {
      // link
      nodes.push({ type: "link", href: m[7], children: parseInline(m[6]) });
    }
    last = re.lastIndex;
  }

  if (last < src.length) {
    nodes.push({ type: "text", text: src.slice(last) });
  }

  return nodes;
}

/* ────────── React renderers ────────── */

function renderInline(nodes: Inline[], keyPrefix = ""): ReactNode[] {
  return nodes.map((n, i) => {
    const key = `${keyPrefix}${i}`;
    switch (n.type) {
      case "text":
        return <span key={key}>{n.text}</span>;
      case "bold":
        return <strong key={key} className="font-semibold text-white">{renderInline(n.children, `${key}-`)}</strong>;
      case "italic":
        return <em key={key}>{renderInline(n.children, `${key}-`)}</em>;
      case "code":
        return (
          <code
            key={key}
            className="rounded bg-[var(--color-surface-2)] px-1.5 py-0.5 font-mono text-[12px] text-[#e0a0f0]"
          >
            {n.text}
          </code>
        );
      case "link":
        return (
          <a
            key={key}
            href={n.href}
            target="_blank"
            rel="noopener noreferrer"
            className="text-[#7db4ff] underline decoration-[#7db4ff]/30 hover:decoration-[#7db4ff]"
          >
            {renderInline(n.children, `${key}-`)}
          </a>
        );
      case "br":
        return <br key={key} />;
      default:
        return null;
    }
  });
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

function renderBlock(block: Block, key: string): ReactNode {
  switch (block.type) {
    case "heading": {
      const cls: Record<number, string> = {
        1: "text-[17px] font-bold text-white mt-4 mb-2",
        2: "text-[15px] font-bold text-white mt-3 mb-1.5",
        3: "text-[14px] font-semibold text-white mt-2.5 mb-1",
        4: "text-[13.5px] font-semibold text-[#ddd] mt-2 mb-1",
        5: "text-[13px] font-semibold text-[#ccc] mt-1.5 mb-0.5",
        6: "text-[12.5px] font-semibold text-[#bbb] mt-1.5 mb-0.5",
      };
      const cn = cls[block.level] || cls[4];
      const children = renderInline(block.children, `${key}-`);
      if (block.level === 1) return <h1 key={key} className={cn}>{children}</h1>;
      if (block.level === 2) return <h2 key={key} className={cn}>{children}</h2>;
      if (block.level === 3) return <h3 key={key} className={cn}>{children}</h3>;
      if (block.level === 4) return <h4 key={key} className={cn}>{children}</h4>;
      if (block.level === 5) return <h5 key={key} className={cn}>{children}</h5>;
      return <h6 key={key} className={cn}>{children}</h6>;
    }
    case "paragraph":
      return (
        <p key={key} className="mb-1.5 last:mb-0">
          {renderInline(block.children, `${key}-`)}
        </p>
      );
    case "code":
      return <CodeBlock key={key} lang={block.lang} content={block.content} />;
    case "hr":
      return <hr key={key} className="my-3 border-[var(--color-border)]" />;
    case "blockquote":
      return (
        <blockquote
          key={key}
          className="my-2 border-l-2 border-[var(--color-muted)] pl-3 text-[var(--color-muted)]"
        >
          {block.children.map((b, j) => renderBlock(b, `${key}-${j}`))}
        </blockquote>
      );
    case "list": {
      const Tag = block.ordered ? "ol" : "ul";
      return (
        <Tag
          key={key}
          className={`my-1.5 pl-5 ${block.ordered ? "list-decimal" : "list-disc"}`}
        >
          {block.items.map((item, j) => (
            <li key={`${key}-${j}`} className="mb-0.5">
              {item.map((b, k) => renderBlock(b, `${key}-${j}-${k}`))}
            </li>
          ))}
        </Tag>
      );
    }
    case "table":
      return (
        <div key={key} className="my-2 overflow-x-auto">
          <table className="min-w-full border-collapse text-[13px]">
            <thead>
              <tr className="border-b border-[var(--color-border)]">
                {block.headers.map((h, j) => (
                  <th
                    key={j}
                    className="px-2.5 py-1.5 text-left font-semibold text-[var(--color-text)]"
                  >
                    {renderInline(h, `th-${j}-`)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {block.rows.map((row, j) => (
                <tr key={j} className="border-b border-[var(--color-border)]/40">
                  {row.map((cell, k) => (
                    <td key={k} className="px-2.5 py-1.5 text-[var(--color-text)]">
                      {renderInline(cell, `td-${j}-${k}-`)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
    default:
      return null;
  }
}

/* ────────── Main component ────────── */

export function MessageContent({ text }: { text: string }) {
  const blocks = useMemo(() => parseBlocks(text), [text]);
  return (
    <div className="selectable break-words leading-relaxed">
      {blocks.map((b, i) => renderBlock(b, String(i)))}
    </div>
  );
}
