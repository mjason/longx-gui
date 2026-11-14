import { contentText, type ThreadItem } from "./threadModel";

export interface ReasoningBlock {
  kind: "title" | "paragraph" | "bullet" | "code";
  text: string;
  marker?: string;
}
export interface ReasoningRun {
  text: string;
  kind: "plain" | "strong" | "code";
}

/** A small presentation grammar for provider-supplied reasoning summaries, not a document renderer. */
export function reasoningRuns(value: string): ReasoningRun[] {
  const runs: ReasoningRun[] = [];
  const pattern = /(\*\*|__|`)([^\n]+?)\1/g;
  let start = 0;
  for (const match of value.matchAll(pattern)) {
    const index = match.index!;
    if (index > start) runs.push({ kind: "plain", text: value.slice(start, index) });
    runs.push({ kind: match[1] === "`" ? "code" : "strong", text: match[2] });
    start = index + match[0].length;
  }
  if (start < value.length) runs.push({ kind: "plain", text: value.slice(start) });
  return runs;
}
export function reasoningPresentation(item: ThreadItem) {
  const source = contentText(item.summary) || contentText(item.content);
  const limited = source.slice(0, 24000).replace(/\r\n?/g, "\n");
  const blocks: ReasoningBlock[] = [];
  let paragraph: string[] = [],
    code: string[] = [];
  let fence: string | null = null;
  function flush() {
    if (paragraph.length) blocks.push({ kind: "paragraph", text: paragraph.join("\n") });
    paragraph = [];
  }
  for (const line of limited.split("\n")) {
    const fenced = line.match(/^\s*(`{3,}|~{3,})/);
    if (fence) {
      if (fenced && fenced[1][0] === fence[0] && fenced[1].length >= fence.length) {
        blocks.push({ kind: "code", text: code.join("\n") });
        code = [];
        fence = null;
      } else code.push(line);
      continue;
    }
    if (fenced) {
      flush();
      fence = fenced[1];
      continue;
    }
    if (!line.trim()) {
      flush();
      continue;
    }
    const heading = line.match(/^\s{0,3}#{1,6}\s+(.+?)(?:\s+#+)?\s*$/);
    const strong = line.trim().match(/^(?:\*\*(.+)\*\*|__(.+)__)$/);
    const openingTitle = line.trim().match(/^(\*\*|__)([^*_]+)$/);
    const bullet = line.match(/^\s*(?:([-+*])|(\d+[.)]))\s+(.+)$/);
    if (heading || strong || openingTitle) {
      flush();
      blocks.push({
        kind: "title",
        text: heading?.[1] ?? strong?.[1] ?? strong?.[2] ?? openingTitle![2],
      });
    } else if (bullet) {
      flush();
      blocks.push({ kind: "bullet", marker: bullet[2] || "•", text: bullet[3] });
    } else paragraph.push(line);
  }
  flush();
  if (fence && code.length) blocks.push({ kind: "code", text: code.join("\n") });
  const compact =
    blocks.length === 1 &&
    ["title", "paragraph"].includes(blocks[0].kind) &&
    !blocks[0].text.includes("\n") &&
    blocks[0].text.length <= 160 &&
    source.length <= 24000;
  return { blocks, compact, truncated: source.length > 24000 };
}
