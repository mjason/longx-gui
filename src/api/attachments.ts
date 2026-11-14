import { sessionHeaders } from "./session";

export interface ComposerAttachment {
  id: string;
  name: string;
  size: number;
  type: string;
  status: "preparing" | "ready" | "failed";
  image?: string;
  text?: string;
  error?: string;
}
const inlineTypes = new Set([
  "application/json",
  "text/plain",
  "text/html",
  "text/markdown",
  "text/csv",
  "text/xml",
  "text/json",
  "text/css",
]);
export function attachmentKind(file: Pick<File, "type" | "size">) {
  if (file.type.startsWith("image/")) return "image";
  return inlineTypes.has(file.type) && file.size <= 32 * 1024 ? "text" : "upload";
}
export async function fileDataUrl(file: File) {
  const bytes = new Uint8Array(await file.arrayBuffer());
  let binary = "";
  for (let index = 0; index < bytes.length; index += 32768)
    binary += String.fromCharCode(...bytes.subarray(index, index + 32768));
  return `data:${file.type || "application/octet-stream"};base64,${btoa(binary)}`;
}
export async function prepareAttachment(
  url: string,
  projectId: string,
  file: File,
  signal: AbortSignal,
) {
  const kind = attachmentKind(file);
  if (kind === "image") return { image: await fileDataUrl(file) };
  if (kind === "text")
    return {
      text: `<attachment name=${JSON.stringify(file.name)}>\n${await file.text()}\n</attachment>`,
    };
  const headers = await sessionHeaders(url, signal),
    body = new FormData();
  body.append("file", file, file.name);
  const response = await fetch(
    `${url.replace(/\/+$/, "")}/attachments/${encodeURIComponent(projectId)}`,
    {
      method: "POST",
      headers,
      body,
      signal,
      redirect: "error",
      credentials: "include",
    },
  );
  if (!response.ok) throw new Error(`附件上传失败（${response.status}），可移除后重新添加。`);
  const result = (await response.json()) as { path?: string; name?: string; bytes?: number };
  if (typeof result.path !== "string" || !result.path) throw new Error("附件上传结果不兼容。");
  return {
    text: `<attachment name=${JSON.stringify(result.name || file.name)} path=${JSON.stringify(result.path)} size="${result.bytes ?? file.size}" />（文件已存到服务器上的这个路径，需要时直接读取或解压）`,
  };
}
