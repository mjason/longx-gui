import { type Project, query } from "./client";
import { OperationError, postGraphql } from "./session";

export interface DirectoryEntry {
  path: string;
  name: string;
  git: boolean;
}
export interface ServerDirectory {
  path: string;
  parent: string | null;
  git: boolean;
  entries: DirectoryEntry[];
  roots: DirectoryEntry[];
}
export interface ProjectDetails extends Project {
  description: string | null;
  modelId: string | null;
  webSearch: boolean;
  trustLocalAgent: boolean;
}
export const projectFields =
  "id name slug rootPath pinned description modelId webSearch trustLocalAgent";

function projectResult(value: unknown): ProjectDetails {
  const project = value as ProjectDetails;
  if (
    !project ||
    typeof project.id !== "string" ||
    typeof project.slug !== "string" ||
    typeof project.rootPath !== "string" ||
    typeof project.name !== "string" ||
    typeof project.pinned !== "boolean" ||
    typeof project.webSearch !== "boolean" ||
    typeof project.trustLocalAgent !== "boolean" ||
    (project.modelId !== null && typeof project.modelId !== "string") ||
    (project.description !== null && typeof project.description !== "string")
  )
    throw new OperationError("项目结果未确认，请刷新项目列表核对。");
  return project;
}
export async function directory(
  url: string,
  path: string | undefined,
  hidden: boolean,
  signal: AbortSignal,
) {
  const data = await query<{ listDirectory: ServerDirectory }>(
    url,
    `query NativeServerDirectory($path: String, $showHidden: Boolean) {
      listDirectory(path: $path, showHidden: $showHidden) { path parent git entries roots }
    }`,
    { path, showHidden: hidden },
    signal,
  );
  const result = data.listDirectory;
  if (
    !result ||
    typeof result.path !== "string" ||
    !Array.isArray(result.entries) ||
    !Array.isArray(result.roots) ||
    [...result.entries, ...result.roots].some(
      (entry) => typeof entry.path !== "string" || typeof entry.name !== "string",
    )
  )
    throw new Error("服务器目录数据不兼容。");
  return result;
}
export async function createDirectory(
  url: string,
  parent: string,
  name: string,
  signal: AbortSignal,
) {
  if (!parent || !name.trim() || name === "." || name === ".." || /[/\\\0]/.test(name))
    throw new Error("请输入单个有效文件夹名称。");
  const data = await postGraphql<{ createDirectory: DirectoryEntry }>(
    url,
    "mutation NativeCreateProjectDirectory($input: CreateDirectoryInput!) { createDirectory(input: $input) { path name git } }",
    { input: { parent, name } },
    signal,
  );
  if (
    !data.createDirectory ||
    typeof data.createDirectory.path !== "string" ||
    data.createDirectory.name !== name
  )
    throw new OperationError("创建目录结果未确认，请浏览目录核对，勿重复创建。");
  return data.createDirectory;
}
export async function createProject(
  url: string,
  input: { name: string; rootPath: string; initGit: boolean },
  signal: AbortSignal,
) {
  const data = await postGraphql<{
    createProject: { result: ProjectDetails | null; errors: unknown[] };
  }>(
    url,
    `mutation NativeCreateProject($input: CreateProjectInput!) { createProject(input: $input) { result { ${projectFields} } errors { message } } }`,
    { input: { ...input, trustLocalAgent: false } },
    signal,
  );
  if (data.createProject?.errors?.length)
    throw new OperationError(
      "服务器拒绝创建项目，请检查名称、目录权限或是否已存在项目。",
      false,
      true,
    );
  return projectResult(data.createProject?.result);
}
export async function getProject(url: string, slug: string, signal: AbortSignal) {
  const data = await query<{ getProject: ProjectDetails | null }>(
    url,
    `query NativeProjectSettings($slug: String!) { getProject(slug: $slug) { ${projectFields} } }`,
    { slug },
    signal,
  );
  if (!data.getProject) throw new Error("项目不存在或不可访问。");
  return projectResult(data.getProject);
}
export type ProjectUpdate = Pick<
  ProjectDetails,
  "name" | "description" | "modelId" | "pinned" | "webSearch" | "trustLocalAgent"
>;
export async function updateProject(
  url: string,
  id: string,
  input: Partial<ProjectUpdate>,
  signal: AbortSignal,
) {
  const data = await postGraphql<{
    updateProject: { result: ProjectDetails | null; errors: unknown[] };
  }>(
    url,
    `mutation NativeUpdateProject($id: ID!, $input: UpdateProjectInput) { updateProject(id: $id, input: $input) { result { ${projectFields} } errors { message } } }`,
    { id, input },
    signal,
  );
  if (data.updateProject?.errors?.length)
    throw new OperationError("服务器拒绝保存项目设置，请刷新后核对。", false, true);
  const project = projectResult(data.updateProject?.result);
  if (project.id !== id) throw new OperationError("项目响应不匹配，请刷新核对。");
  if (Object.entries(input).some(([key, value]) => project[key as keyof ProjectUpdate] !== value))
    throw new OperationError("服务端返回的设置与提交值不一致，请重新读取核对。");
  return project;
}
