import { effect, signal } from "nsh";
import { readFile, writeFile } from "../../api/files";
import { OperationError } from "../../api/session";

export interface Document {
  key: string;
  url: string;
  projectId: string;
  path: string;
  text: string;
  saved: string;
  status: "loading" | "ready" | "error";
  binary: boolean;
  truncated: boolean;
  saving: boolean;
  error: string;
}
export function documentKey(url: string, projectId: string, path: string) {
  return JSON.stringify([url, projectId, path]);
}
export function createEditorState(onSaved: () => void) {
  const documents = signal<Record<string, Document>>({});
  const requests = new Set<AbortController>();
  let disposed = false;
  effect(() => () => {
    disposed = true;
    requests.forEach((request) => {
      request.abort();
    });
  });
  function patch(key: string, values: Partial<Document>) {
    if (!disposed && documents()[key])
      documents.update((all) => ({ ...all, [key]: { ...all[key], ...values } }));
  }
  async function request<T>(run: (signal: AbortSignal) => Promise<T>) {
    const controller = new AbortController();
    requests.add(controller);
    const timeout = setTimeout(() => controller.abort(), 15000);
    try {
      return await run(controller.signal);
    } finally {
      clearTimeout(timeout);
      requests.delete(controller);
    }
  }
  async function load(url: string, projectId: string, path: string, force = false) {
    const key = documentKey(url, projectId, path);
    const existing = documents()[key];
    if (
      existing &&
      (!force ||
        existing.status === "loading" ||
        existing.saving ||
        existing.text !== existing.saved)
    )
      return;
    documents.update((all) => ({
      ...all,
      [key]: {
        key,
        url,
        projectId,
        path,
        text: "",
        saved: "",
        status: "loading",
        binary: false,
        truncated: false,
        saving: false,
        error: "",
      },
    }));
    try {
      const file = await request((signal) => readFile(url, projectId, path, signal));
      patch(key, {
        text: file.content ?? "",
        saved: file.content ?? "",
        binary: file.binary,
        truncated: file.truncated,
        status: "ready",
      });
    } catch {
      patch(key, { status: "error", error: "无法读取文件，请检查路径或服务状态后重试。" });
    }
  }
  function dirty(key: string) {
    const doc = documents()[key];
    return !!doc && doc.text !== doc.saved;
  }
  return {
    documents,
    load,
    dirty,
    dirtyCount: () => Object.values(documents()).filter((doc) => doc.text !== doc.saved).length,
    edit(key: string, text: string) {
      const doc = documents()[key];
      if (doc?.status === "ready" && !doc.binary && !doc.truncated && !doc.saving)
        patch(key, { text, error: "" });
    },
    discard(key: string) {
      const doc = documents()[key];
      if (doc && !doc.saving) patch(key, { text: doc.saved, error: "" });
    },
    async save(key: string) {
      const doc = documents()[key];
      if (doc?.status !== "ready" || doc.binary || doc.truncated || doc.saving || !dirty(key))
        return;
      patch(key, { saving: true, error: "" });
      try {
        await request(async (signal) => {
          const latest = await readFile(doc.url, doc.projectId, doc.path, signal);
          if (latest.binary || latest.truncated || latest.content !== doc.saved) {
            throw new OperationError("磁盘文件已被外部修改，未覆盖。请保留草稿并核对外部版本。");
          }
          await writeFile(doc.url, doc.projectId, doc.path, doc.text, signal);
          const check = await readFile(doc.url, doc.projectId, doc.path, signal);
          if (check.content !== doc.text || check.truncated || check.binary) {
            throw new OperationError("保存结果未确认，草稿已保留。请核对磁盘文件，不要直接重试。");
          }
        });
        patch(key, { saved: doc.text });
        onSaved();
      } catch (error) {
        patch(key, {
          error:
            error instanceof OperationError
              ? error.message
              : "保存未确认，草稿已保留。请核对磁盘状态，不会自动重试。",
        });
      } finally {
        patch(key, { saving: false });
      }
    },
  };
}
export type EditorState = ReturnType<typeof createEditorState>;
