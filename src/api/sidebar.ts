import type { FileEntry, ThreadSummary } from "./client";
import { checkPath } from "./files";
import { OperationError, postGraphql } from "./session";

export function entryPath(value: string) {
  checkPath(value);
  if (value.includes("\\") || value.split("/").some((part) => !part || part === "."))
    throw new Error("请输入规范的项目相对路径，不要包含空段、反斜线或 .。");
  return value;
}

export async function changeEntry(
  url: string,
  projectId: string,
  operation: "create" | "rename" | "delete",
  path: string,
  value: string,
  kind: string,
  signal: AbortSignal,
): Promise<FileEntry | null> {
  entryPath(path);
  if (operation === "rename") entryPath(value);
  const field = { create: "createEntry", rename: "renameEntry", delete: "deleteEntry" }[operation];
  const type = {
    create: "CreateEntryInput",
    rename: "RenameEntryInput",
    delete: "DeleteEntryInput",
  }[operation];
  const input =
    operation === "rename"
      ? { projectId, from: path, to: value }
      : { projectId, path, ...(operation === "create" ? { kind } : {}) };
  const data = await postGraphql<Record<string, unknown>>(
    url,
    `mutation NativeEntry${operation}($input: ${type}!) { ${field}(input: $input) ${operation === "delete" ? "" : "{ name path kind size }"} }`,
    { input },
    signal,
  );
  if (operation === "delete") {
    if (data[field] !== true) throw new OperationError("删除未确认，请刷新目录核对。");
    return null;
  }
  const entry = data[field] as FileEntry;
  if (
    !entry ||
    entry.path !== (operation === "rename" ? value : path) ||
    typeof entry.name !== "string" ||
    typeof entry.kind !== "string"
  )
    throw new OperationError("文件操作未确认，请刷新目录核对。");
  return entry;
}

export async function changeThread(
  url: string,
  threadId: string,
  operation: "rename" | "archive" | "delete",
  title: string,
  signal: AbortSignal,
): Promise<ThreadSummary | null> {
  if (operation === "delete") {
    const data = await postGraphql<{ deleteThread: boolean }>(
      url,
      "mutation NativeDeleteThread($input: DeleteThreadInput!) { deleteThread(input: $input) }",
      { input: { threadId } },
      signal,
    );
    if (data.deleteThread !== true) throw new OperationError("删除未确认，请刷新会话列表核对。");
    return null;
  }
  const field = operation === "rename" ? "renameThread" : "archiveThread";
  const data = await postGraphql<
    Record<string, { result: ThreadSummary | null; errors: unknown[] }>
  >(
    url,
    operation === "rename"
      ? "mutation NativeRenameThread($id: ID!, $input: RenameThreadInput) { renameThread(id: $id, input: $input) { result { id title status } errors { message } } }"
      : "mutation NativeArchiveThread($id: ID!) { archiveThread(id: $id) { result { id title status } errors { message } } }",
    operation === "rename" ? { id: threadId, input: { title } } : { id: threadId },
    signal,
  );
  const response = data[field];
  if (response?.errors?.length)
    throw new OperationError("服务拒绝操作，请确认会话当前状态后再试。", false, true);
  if (response?.result?.id !== threadId || typeof response.result.status !== "string")
    throw new OperationError("会话操作未确认，请刷新列表核对。");
  return response.result;
}
