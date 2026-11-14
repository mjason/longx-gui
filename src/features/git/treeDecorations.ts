import type { GitChange } from "../../api/git";

export type GitDecoration = "added" | "modified" | "conflict" | "ignored";
const priority = { ignored: 0, added: 1, modified: 2, conflict: 3 };
export const gitColor = {
  added: "primary",
  modified: "ochre",
  conflict: "destructive",
  ignored: "quiet",
} as const;

/** Segment-based ancestor propagation; an ignored folder also covers unloaded descendants. */
export function treeDecorations(changes: GitChange[], ignored: string[]) {
  const map = new Map<string, GitDecoration>();
  const addedDirectories = new Set(
    changes
      .filter(
        (change) => change.path.endsWith("/") && ["added", "untracked"].includes(change.status),
      )
      .map((change) => change.path.replace(/\/+$/, "")),
  );
  for (const change of changes) {
    const decoration: GitDecoration = ["unmerged", "conflicted", "deleted"].includes(change.status)
      ? "conflict"
      : ["added", "untracked"].includes(change.status)
        ? "added"
        : "modified";
    const parts = change.path.replace(/\/+$/, "").split("/");
    while (parts.length) {
      const path = parts.join("/");
      const previous = map.get(path);
      if (!previous || priority[decoration] > priority[previous]) map.set(path, decoration);
      parts.pop();
    }
  }
  const ignoredSet = new Set(ignored.map((path) => path.replace(/\/+$/, "")));
  return (path: string): GitDecoration | undefined => {
    const changed = map.get(path);
    if (changed) return changed;
    const parts = path.split("/");
    while (parts.length) {
      if (addedDirectories.has(parts.join("/"))) return "added";
      if (ignoredSet.has(parts.join("/"))) return "ignored";
      parts.pop();
    }
    return undefined;
  };
}
