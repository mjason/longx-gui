import { postGraphql } from "./session";

export async function sendMessage(
  url: string,
  threadId: string,
  text: string,
  settings: {
    model?: string | null;
    effort?: string | null;
    images?: string[];
  } = {},
) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 90000);
  try {
    const data = await postGraphql<{
      sendMessage: { id: string; threadId: string; kernelTurnId: string | null } | null;
    }>(
      url,
      `mutation NativeSendMessage($input: SendMessageInput!) {
        sendMessage(input: $input) { id threadId kernelTurnId }
      }`,
      {
        input: {
          threadId,
          text,
          ...(settings.model ? { model: settings.model } : {}),
          ...(settings.effort ? { effort: settings.effort } : {}),
          ...(settings.images?.length ? { images: settings.images } : {}),
        },
      },
      controller.signal,
    );
    const turn = data.sendMessage;
    if (!turn?.id || turn.threadId !== threadId || !turn.kernelTurnId)
      throw new Error("invalid response");
    return turn;
  } catch {
    // A timeout or malformed response may follow a successful server-side send.
    throw new Error("发送结果未确认。请先核对会话记录，避免重复发送；草稿已保留。");
  } finally {
    clearTimeout(timeout);
  }
}
