import { fileDataUrl } from "./attachments";
import { sessionHeaders } from "./session";

/** Private attachment URLs need the app's same-origin session, not the native image loader's jar. */
export function isThreadAttachment(source: string, baseUrl: string) {
  try {
    const url = new URL(source);
    return (
      !url.username &&
      !url.password &&
      url.origin === new URL(baseUrl).origin &&
      /^\/files\/[^/]+\/_attachments\//.test(url.pathname)
    );
  } catch {
    return false;
  }
}
export async function loadThreadAttachment(source: string, baseUrl: string, signal: AbortSignal) {
  if (!isThreadAttachment(source, baseUrl)) throw new Error("附件来源不匹配。");
  const headers = await sessionHeaders(baseUrl.replace(/\/+$/, ""), signal);
  const response = await fetch(source, {
    headers,
    signal,
    credentials: "include",
    redirect: "error",
  });
  if (!response.ok) throw new Error("附件图片无法读取。");
  const mime = (response.headers.get("content-type") ?? "").split(";")[0].trim().toLowerCase();
  if (!/^image\/(?:png|jpeg|gif|webp|svg\+xml|avif|heic|heif|bmp|tiff)$/.test(mime))
    throw new Error("附件不是支持的图片。");
  const limit = 20 * 1024 * 1024;
  if (Number(response.headers.get("content-length")) > limit) throw new Error("图片超过 20 MiB。");
  const reader = response.body?.getReader();
  if (!reader) throw new Error("附件没有图片数据。");
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    for (;;) {
      const result = await reader.read();
      if (result.done) break;
      size += result.value.byteLength;
      if (size > limit) throw new Error("图片超过 20 MiB。");
      chunks.push(result.value);
    }
  } finally {
    await reader.cancel().catch(() => {});
  }
  return fileDataUrl(new File(chunks, "preview", { type: mime }));
}
