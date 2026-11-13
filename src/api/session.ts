/** A fresh app-owned session, never the person's browser cookie jar. */
export class OperationError extends Error {}
export async function postGraphql<T>(baseUrl: string, document: string, variables: Record<string, unknown>, signal: AbortSignal): Promise<T> {
  try { return await send<T>(baseUrl, document, variables, signal); }
  catch (error) {
    if (error instanceof OperationError) throw error;
    throw new OperationError("网络中断，写入结果未确认。请核对文件／仓库状态，不会自动重试。");
  }
}
async function send<T>(baseUrl: string, document: string, variables: Record<string, unknown>, signal: AbortSignal): Promise<T> {
  // Do not cache CSRF tokens or credentials on disk, log them, or follow
  // bootstrap redirects to a different login origin. A refusal stays a refusal.
  const page = await fetch(`${baseUrl}/`, { credentials: "include", redirect: "error", signal });
  if (!page.ok) throw new OperationError("无法建立服务会话，未执行写入。");
  const html = await page.text();
  const tag = html.match(/<meta\b[^>]*name=["']csrf-token["'][^>]*>/i)?.[0];
  const token = tag?.match(/content=["']([^"']+)["']/i)?.[1];
  if (!token) throw new OperationError("服务未提供 CSRF 会话，未执行写入。");
  const headers: Record<string, string> = {
    "content-type": "application/json", accept: "application/json", "x-csrf-token": token,
  };
  // Native fetch exposes Set-Cookie but does not promise a cookie jar.
  // Return only this origin's just-issued cookies to the same origin.
  const cookies = page.headers.get("set-cookie");
  if (cookies) headers.cookie = cookies.split(/,(?=\s*[^;,=\s]+=)/).map(part => part.trim().split(";")[0]).join("; ");
  const response = await fetch(`${baseUrl}/gql`, {
    method: "POST", headers, credentials: "include", redirect: "error", signal,
    body: JSON.stringify({ query: document, variables }),
  });
  if (!response.ok) throw new OperationError("服务拒绝写入或连接中断，请核对文件／仓库状态后再试。");
  const result = await response.json() as { data?: T; errors?: unknown[] };
  if (result.errors?.length || !result.data) throw new OperationError("操作未确认成功，请刷新核对；不会自动重试。");
  return result.data;
}
