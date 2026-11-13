import { query } from "./client";
import { postGraphql } from "./session";

export interface FileContent { path: string; content: string | null; binary: boolean; truncated: boolean; size: number }
export function checkPath(path: string) {
  if (!path || path.startsWith("/") || path.split(/[\\/]/).some(part => part === "..") || path.includes("\0")) {
    throw new Error("仅支持项目内的相对文件路径。");
  }
}
export async function readFile(url: string, projectId: string, path: string, signal: AbortSignal) {
  checkPath(path);
  const data = await query<{ readFile: FileContent }>(url,
    `query NativeReadFile($projectId: ID!, $path: String!) {
      readFile(projectId: $projectId, path: $path) { path content binary truncated size }
    }`, { projectId, path }, signal);
  const file = data.readFile;
  if (!file || typeof file.binary !== "boolean" || typeof file.truncated !== "boolean" ||
    (file.content !== null && typeof file.content !== "string")) throw new Error("文件数据格式不兼容。");
  return file;
}
export async function writeFile(url: string, projectId: string, path: string, content: string, signal: AbortSignal) {
  checkPath(path);
  const data = await postGraphql<{ writeFile: boolean }>(url,
    "mutation NativeWriteFile($input: WriteFileInput!) { writeFile(input: $input) }",
    { input: { projectId, path, content } }, signal);
  if (data.writeFile !== true) throw new Error("保存未确认成功，请重新读取文件核对。");
}
