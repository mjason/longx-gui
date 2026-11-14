export interface Completion {
  kind: "@" | "/";
  query: string;
  start: number;
  end: number;
}
export function composerCompletion(text: string, caret: number): Completion | null {
  const before = text.slice(0, caret),
    match = before.match(/(?:^|\s)([@/])([^\s]*)$/);
  if (!match || (match[1] === "@" && match[2].startsWith("session("))) return null;
  const token = match[1] + match[2];
  return { kind: match[1] as "@" | "/", query: match[2], start: caret - token.length, end: caret };
}
export const composerCommands = [
  { id: "new", title: "新建会话", detail: "打开新的会话输入区" },
  { id: "compact", title: "压缩上下文", detail: "压缩当前会话上下文" },
  { id: "init", title: "初始化项目说明", detail: "检查仓库并生成或完善 AGENTS.md" },
  { id: "goal", title: "设置目标", detail: "目标内容与可选 Token 预算" },
  { id: "git", title: "打开 Git", detail: "查看项目变更与历史" },
  { id: "files", title: "打开文件", detail: "显示文件侧栏" },
  { id: "settings", title: "打开设置", detail: "应用编辑器设置" },
];
export const initPrompt =
  "为这个仓库的根目录编写 AGENTS.md。先检查代码库：结构、构建／测试／运行命令、约定和常见陷阱。内容要简明、具体、能让以后在这里工作的智能体直接执行。如果已有 AGENTS.md，请改进而不是替换它。";
