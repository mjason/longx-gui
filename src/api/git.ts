import { query } from "./client";
import { checkPath } from "./files";
import { postGraphql } from "./session";

export interface GitChange {
  path: string;
  status: string;
}
export interface GitStatus {
  repository: boolean;
  branch: string | null;
  head: string | null;
  merging: boolean;
  changes: GitChange[];
  ahead: number | null;
  behind: number | null;
}
export interface GitLog {
  sha: string;
  subject: string;
  author: string;
  at: string;
}
export async function gitIgnoredPaths(url: string, projectId: string, signal: AbortSignal) {
  const data = await query<{ ignoredPaths: string[] }>(
    url,
    "query NativeGitIgnored($projectId: ID!) { ignoredPaths(projectId: $projectId) }",
    { projectId },
    signal,
  );
  if (
    !Array.isArray(data.ignoredPaths) ||
    data.ignoredPaths.some((path) => typeof path !== "string")
  )
    throw new Error("Git 忽略路径格式不兼容。");
  return data.ignoredPaths;
}
export async function gitStatus(url: string, projectId: string, signal: AbortSignal) {
  const data = await query<{ gitChanges: GitStatus }>(
    url,
    `query NativeGitStatus($projectId: ID!) {
      gitChanges(projectId: $projectId) { repository branch head merging changes ahead behind }
    }`,
    { projectId },
    signal,
  );
  const status = data.gitChanges;
  if (
    !status ||
    typeof status.repository !== "boolean" ||
    typeof status.merging !== "boolean" ||
    !Array.isArray(status.changes) ||
    status.changes.some(
      (change) => typeof change.path !== "string" || typeof change.status !== "string",
    )
  ) {
    throw new Error("Git 状态格式不兼容。");
  }
  return status;
}
export async function gitHistory(url: string, projectId: string, signal: AbortSignal) {
  const data = await query<{ gitLog: GitLog[] }>(
    url,
    "query NativeGitLog($projectId: ID!) { gitLog(projectId: $projectId, limit: 20) { sha subject author at } }",
    { projectId },
    signal,
  );
  if (!Array.isArray(data.gitLog)) throw new Error("Git 历史格式不兼容。");
  return data.gitLog;
}
export interface GitFileVersions {
  before: string | null;
  after: string | null;
  binary: boolean;
}
export async function gitFileVersions(
  url: string,
  projectId: string,
  path: string,
  signal: AbortSignal,
) {
  checkPath(path);
  const data = await query<{ gitFileVersions: GitFileVersions }>(
    url,
    `query NativeGitFileVersions($projectId: ID!, $path: String!) {
      gitFileVersions(projectId: $projectId, path: $path) { before after binary }
    }`,
    { projectId, path },
    signal,
  );
  const versions = data.gitFileVersions;
  if (
    !versions ||
    typeof versions.binary !== "boolean" ||
    (versions.before !== null && typeof versions.before !== "string") ||
    (versions.after !== null && typeof versions.after !== "string")
  )
    throw new Error("Git 完整文件版本格式不兼容。");
  return versions;
}
export async function gitCommit(
  url: string,
  projectId: string,
  paths: string[],
  message: string,
  signal: AbortSignal,
) {
  if (!paths.length || !message.trim()) throw new Error("请选择文件并填写提交说明。");
  paths.forEach(checkPath);
  const data = await postGraphql<{ gitCommit: { sha: string } }>(
    url,
    "mutation NativeGitCommit($input: GitCommitInput!) { gitCommit(input: $input) { sha } }",
    { input: { projectId, paths, message: message.trim() } },
    signal,
  );
  if (!data.gitCommit?.sha) throw new Error("提交未确认成功，请查看仓库历史；不会自动重试。");
  return data.gitCommit.sha;
}
