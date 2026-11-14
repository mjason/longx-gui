import type { StubRequest, StubResponse } from "nsh/test";
import { mockServer } from "./server";

/** Isolated in-memory writes and commits, never the person's repository. */
export function editorServer() {
  const files: Record<string, string> = {
    "App.tsx": "export const value = 1;\n",
    "src/index.ts": "export const other = 2;\n",
  };
  let changes = [
    { path: "App.tsx", status: "modified" },
    { path: "README.md", status: "untracked" },
  ];
  const options = {
    binary: false,
    truncated: false,
    csrf: true,
    failWrite: false,
    merging: false,
    failRead: false,
    failDiff: false,
  };
  const commits: { paths: string[]; message: string }[] = [];
  function serve(request: StubRequest): StubResponse {
    const url = new URL(request.url);
    if (request.method === "GET" && url.pathname === "/")
      return {
        headers: {
          "content-type": "text/html",
          "set-cookie": "test_session=app; Path=/; HttpOnly",
        },
        body: options.csrf ? '<meta name="csrf-token" content="fixture-token">' : "<html></html>",
      };
    if (request.method === "POST") {
      const body = JSON.parse(request.body ?? "{}") as {
        query: string;
        variables: { input: { path: string; content: string; paths: string[]; message: string } };
      };
      if (request.headers["x-csrf-token"] !== "fixture-token") return { status: 403 };
      if (body.query.includes("NativeWriteFile")) {
        if (options.failWrite) return { status: 500 };
        files[body.variables.input.path] = body.variables.input.content;
        return { body: { data: { writeFile: true } } };
      }
      if (body.query.includes("NativeGitCommit")) {
        commits.push({ paths: body.variables.input.paths, message: body.variables.input.message });
        changes = changes.filter((change) => !body.variables.input.paths.includes(change.path));
        return { body: { data: { gitCommit: { sha: "abcdef1234567890" } } } };
      }
      return { status: 400 };
    }
    const query = url.searchParams.get("query") ?? "";
    if (query.includes("NativeReadFile")) {
      if (options.failRead) return { status: 500 };
      const { path } = JSON.parse(url.searchParams.get("variables") ?? "{}") as { path: string };
      return {
        body: {
          data: {
            readFile: {
              path,
              content: options.binary ? null : (files[path] ?? ""),
              binary: options.binary,
              truncated: options.truncated,
              size: 24,
            },
          },
        },
      };
    }
    if (query.includes("NativeGitStatus"))
      return {
        body: {
          data: {
            gitChanges: {
              repository: true,
              branch: "main",
              head: "1234567890",
              merging: options.merging,
              changes,
              ahead: 0,
              behind: 0,
            },
          },
        },
      };
    if (query.includes("NativeGitFileVersions")) {
      if (options.failDiff) return { status: 500 };
      const { path } = JSON.parse(url.searchParams.get("variables") ?? "{}") as { path: string };
      return {
        body: {
          data: {
            gitFileVersions: {
              binary: options.binary,
              before: "export const value = 0;\n",
              after: options.binary ? null : (files[path] ?? ""),
            },
          },
        },
      };
    }
    return mockServer(request);
  }
  return { files, options, commits, serve };
}
