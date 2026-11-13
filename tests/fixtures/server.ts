import type { StubRequest, StubResponse } from "nsh/test";

/** Deterministic server contract for UI tests; never imported by the app. */
export function mockServer(request: StubRequest): StubResponse {
  const url = new URL(request.url);
  const query = url.searchParams.get("query") ?? "";
  const variables = JSON.parse(url.searchParams.get("variables") ?? "{}") as { projectId?: string; path?: string };
  if (request.method !== "GET" || url.pathname !== "/gql") return { status: 405 };
  if (query.includes("NativeProjects")) return { body: { data: { listProjects: [
    { id: "p1", name: "longx-gui", slug: "longx-gui", rootPath: "/workspace/longx-gui", pinned: true },
    { id: "p2", name: "worker", slug: "worker", rootPath: "/workspace/worker", pinned: false },
  ] } } };
  if (query.includes("NativeWorkspace")) return { body: { data: {
    listFiles: variables.path ? [{ name: "index.ts", path: "src/index.ts", kind: "file", size: 32 }] : [
      { name: "src", path: "src", kind: "dir", size: 0 },
      { name: "App.tsx", path: "App.tsx", kind: "file", size: 100 },
    ],
    listThreads: [{ id: "t1", title: variables.projectId === "p2" ? "后台工作" : "界面设计", status: "idle" }],
  } } };
  if (query.includes("NativeDirectory")) return { body: { data: { listFiles: [
    { name: "index.ts", path: `${variables.path}/index.ts`, kind: "file", size: 32 },
  ] } } };
  return { status: 400 };
}
