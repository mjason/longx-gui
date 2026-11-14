import type { StubRequest, StubResponse } from "nsh/test";

/** Deterministic server contract for UI tests; never imported by the app. */
export function mockServer(request: StubRequest): StubResponse {
  const url = new URL(request.url);
  const query = url.searchParams.get("query") ?? "";
  const variables = JSON.parse(url.searchParams.get("variables") ?? "{}") as {
    projectId?: string;
    path?: string;
  };
  if (request.method !== "GET" || url.pathname !== "/gql") return { status: 405 };
  if (query.includes("NativeProjects"))
    return {
      body: {
        data: {
          listProjects: [
            {
              id: "p1",
              name: "longx-gui",
              slug: "longx-gui",
              rootPath: "/workspace/longx-gui",
              pinned: true,
            },
            {
              id: "p2",
              name: "worker",
              slug: "worker",
              rootPath: "/workspace/worker",
              pinned: false,
            },
          ],
        },
      },
    };
  if (query.includes("NativeWorkspace"))
    return {
      body: {
        data: {
          listFiles: variables.path
            ? [{ name: "index.ts", path: "src/index.ts", kind: "file", size: 32 }]
            : [
                { name: "src", path: "src", kind: "dir", size: 0 },
                { name: "App.tsx", path: "App.tsx", kind: "file", size: 100 },
              ],
          listThreads: [
            {
              id: "t1",
              title: variables.projectId === "p2" ? "后台工作" : "界面设计",
              status: "idle",
            },
          ],
        },
      },
    };
  if (query.includes("NativeDirectory"))
    return {
      body: {
        data: {
          listFiles: [
            { name: "index.ts", path: `${variables.path}/index.ts`, kind: "file", size: 32 },
          ],
        },
      },
    };
  if (query.includes("NativeReadFile"))
    return {
      body: {
        data: {
          readFile: {
            path: variables.path,
            content: "export const value = 1;\n",
            binary: false,
            truncated: false,
            size: 24,
          },
        },
      },
    };
  if (query.includes("NativeGitStatus"))
    return {
      body: {
        data: {
          gitChanges: {
            repository: true,
            branch: "main",
            head: "1234567890",
            merging: false,
            ahead: 0,
            behind: 0,
            changes: [
              { path: "App.tsx", status: "modified" },
              { path: "README.md", status: "untracked" },
            ],
          },
        },
      },
    };
  if (query.includes("NativeGitLog"))
    return {
      body: {
        data: {
          gitLog: [
            {
              sha: "1234567890",
              subject: "Initial workspace",
              author: "Test",
              at: "2026-11-13T12:00:00Z",
            },
          ],
        },
      },
    };
  if (query.includes("NativeGitFileVersions"))
    return {
      body: {
        data: {
          gitFileVersions: {
            binary: false,
            before: "export const value = 0;\n",
            after: "export const value = 1;\n",
          },
        },
      },
    };
  return { status: 400 };
}
