/** Minimal line-level diff (LCS) for showing file edits in the chat. */

export interface DiffLine {
  type: "add" | "del" | "ctx";
  text: string;
}

export interface DiffStat {
  added: number;
  removed: number;
}

/** Compute an LCS-based line diff between two texts. */
export function diffLines(oldText: string, newText: string): DiffLine[] {
  const a = oldText.length === 0 ? [] : oldText.split("\n");
  const b = newText.length === 0 ? [] : newText.split("\n");
  const n = a.length;
  const m = b.length;

  // LCS table
  const dp: number[][] = Array.from({ length: n + 1 }, () =>
    new Array<number>(m + 1).fill(0),
  );
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      dp[i][j] =
        a[i] === b[j]
          ? dp[i + 1][j + 1] + 1
          : Math.max(dp[i + 1][j], dp[i][j + 1]);
    }
  }

  const out: DiffLine[] = [];
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (a[i] === b[j]) {
      out.push({ type: "ctx", text: a[i] });
      i++;
      j++;
    } else if (dp[i + 1][j] >= dp[i][j + 1]) {
      out.push({ type: "del", text: a[i] });
      i++;
    } else {
      out.push({ type: "add", text: b[j] });
      j++;
    }
  }
  while (i < n) out.push({ type: "del", text: a[i++] });
  while (j < m) out.push({ type: "add", text: b[j++] });
  return out;
}

export function diffStat(lines: DiffLine[]): DiffStat {
  let added = 0;
  let removed = 0;
  for (const l of lines) {
    if (l.type === "add") added++;
    else if (l.type === "del") removed++;
  }
  return { added, removed };
}

/**
 * Collapse long runs of unchanged context lines so a diff stays readable,
 * keeping `pad` lines of context around each change.
 */
export function collapseContext(lines: DiffLine[], pad = 2): DiffLine[] {
  const keep = new Array<boolean>(lines.length).fill(false);
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].type !== "ctx") {
      for (let k = Math.max(0, i - pad); k <= Math.min(lines.length - 1, i + pad); k++) {
        keep[k] = true;
      }
    }
  }
  const out: DiffLine[] = [];
  let skipping = false;
  for (let i = 0; i < lines.length; i++) {
    if (keep[i]) {
      out.push(lines[i]);
      skipping = false;
    } else if (!skipping) {
      out.push({ type: "ctx", text: "⋯" });
      skipping = true;
    }
  }
  return out;
}
