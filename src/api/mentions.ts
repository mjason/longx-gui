import { query } from "./client";

export interface Mention {
  value: string;
  title: string;
  detail: string;
  group: string;
}
export const sessionDirective =
  "（成果接收会话：请先在当前会话完成用户要求的内容，再调用 send_message，将完整正文或成果材料发送到此会话地址，由对方按其项目规范保存并回复路径。不要只发送当前项目的文件路径，也不要自行寻找或修改对方应用；收到回复后转告用户。）";
export async function searchMentions(
  url: string,
  projectId: string,
  threadId: string,
  search: string,
  signal: AbortSignal,
) {
  const [files, directory] = await Promise.allSettled([
    search
      ? query<{ searchFiles: { path: string; fileName: string; matchType: string }[] }>(
          url,
          `query NativeMentionFiles($id: ID!, $query: String!) {
        searchFiles(id: $id, query: $query) { path fileName matchType }
      }`,
          { id: projectId, query: search },
          signal,
        )
      : Promise.resolve({ searchFiles: [] }),
    query<{
      directory: {
        sessions: {
          threadId: string;
          address: string;
          onDuty: boolean;
          state: string;
          title: string | null;
          preview: string | null;
          handle: string | null;
          projectSlug: string | null;
        }[];
      };
    }>(
      url,
      `query NativeMentionSessions($projectId: ID!) {
        directory(projectId: $projectId, scope: "all") { sessions }
      }`,
      { projectId },
      signal,
    ),
  ]);
  if (files.status === "rejected" && directory.status === "rejected")
    throw new Error("引用搜索失败，请重试。");
  const result: Mention[] = [];
  if (directory.status === "fulfilled") {
    const term = search.toLowerCase();
    for (const item of directory.value.directory.sessions ?? []) {
      if (
        !item.onDuty ||
        item.threadId === threadId ||
        ["archived", "unrecoverable"].includes(item.state)
      )
        continue;
      if (
        ![item.address, item.title, item.preview, item.handle].some((value) =>
          value?.toLowerCase().includes(term),
        )
      )
        continue;
      const address = item.address.includes(":")
        ? item.address
        : item.projectSlug
          ? `${item.projectSlug}:${item.address}`
          : item.address;
      result.push({
        value: `@session(${JSON.stringify(address)})${sessionDirective}`,
        title: item.title || item.preview || item.address,
        detail: address,
        group: "会话",
      });
    }
  }
  if (files.status === "fulfilled")
    for (const file of files.value.searchFiles) {
      result.push({
        value: /\s/.test(file.path) ? `@${JSON.stringify(file.path)}` : `@${file.path}`,
        title: file.fileName || file.path,
        detail: file.path,
        group: file.matchType === "skill" ? "技能" : "文件",
      });
    }
  return result.slice(0, 40);
}
