/** GraphQL contract: ../longx/priv/schema.graphql. Reads use GET. */
export interface Project {
  id: string;
  name: string;
  slug: string;
  rootPath: string;
  pinned: boolean;
}

export interface FileEntry {
  name: string;
  path: string;
  kind: string;
  size: number;
}

export interface ThreadSummary {
  id: string;
  title: string | null;
  status: string;
}

export async function query<T>(
  baseUrl: string,
  document: string,
  variables: Record<string, unknown>,
  signal: AbortSignal,
): Promise<T> {
  // GET is a standard GraphQL query transport. No browser cookies or CSRF
  // token are needed for these read-only calls; never send mutations here.
  const url = `${baseUrl}/gql?${new URLSearchParams({ query: document, variables: JSON.stringify(variables) })}`;
  const response = await fetch(url, {
    headers: { accept: "application/json" },
    signal,
    credentials: "omit",
  });
  if (!response.ok) throw new Error("无法读取服务器数据，请检查服务状态或访问权限。");
  const result = (await response.json()) as { data?: T; errors?: unknown[] };
  if (result.errors?.length || !result.data)
    throw new Error("服务器接口返回错误，请确认服务版本或访问权限。");
  return result.data;
}

export async function listProjects(baseUrl: string, signal: AbortSignal): Promise<Project[]> {
  const data = await query<{ listProjects: Project[] }>(
    baseUrl,
    "query NativeProjects { listProjects { id name slug rootPath pinned } }",
    {},
    signal,
  );
  if (
    !Array.isArray(data.listProjects) ||
    data.listProjects.some(
      (project) =>
        typeof project.id !== "string" ||
        typeof project.name !== "string" ||
        typeof project.slug !== "string" ||
        typeof project.rootPath !== "string",
    )
  ) {
    throw new Error("服务器项目数据格式不兼容。");
  }
  return data.listProjects;
}

export async function loadWorkspace(
  baseUrl: string,
  projectId: string,
  path: string,
  signal: AbortSignal,
) {
  const data = await query<{ listFiles: FileEntry[]; listThreads: ThreadSummary[] }>(
    baseUrl,
    `query NativeWorkspace($projectId: ID!, $path: String!) {
      listFiles(projectId: $projectId, path: $path) { name path kind size }
      listThreads(projectId: $projectId) { id title status }
    }`,
    { projectId, path },
    signal,
  );
  if (
    !Array.isArray(data.listFiles) ||
    !Array.isArray(data.listThreads) ||
    data.listFiles.some(
      (file) =>
        typeof file.name !== "string" ||
        typeof file.path !== "string" ||
        typeof file.kind !== "string",
    ) ||
    data.listThreads.some(
      (thread) => typeof thread.id !== "string" || typeof thread.status !== "string",
    )
  ) {
    throw new Error("服务器工作区数据格式不兼容。");
  }
  return { files: data.listFiles, threads: data.listThreads };
}

export async function listFiles(
  baseUrl: string,
  projectId: string,
  path: string,
  signal: AbortSignal,
): Promise<FileEntry[]> {
  const data = await query<{ listFiles: FileEntry[] }>(
    baseUrl,
    `query NativeDirectory($projectId: ID!, $path: String!) {
      listFiles(projectId: $projectId, path: $path) { name path kind size }
    }`,
    { projectId, path },
    signal,
  );
  if (
    !Array.isArray(data.listFiles) ||
    data.listFiles.some(
      (file) =>
        typeof file.path !== "string" ||
        typeof file.name !== "string" ||
        typeof file.kind !== "string",
    )
  ) {
    throw new Error("服务器目录数据格式不兼容。");
  }
  return data.listFiles;
}
