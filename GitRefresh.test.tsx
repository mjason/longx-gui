import { expect, open, test } from "nsh/test";
import { treeDecorations } from "./src/features/git/treeDecorations";
import { mockServer } from "./tests/fixtures/server";

test("propagates Git colors by path segments with deterministic mixed-directory precedence", () => {
  const decoration = treeDecorations(
    [
      { path: "src/new/a.ts", status: "untracked" },
      { path: "src/modified.ts", status: "modified" },
      { path: "src/conflict.ts", status: "unmerged" },
      { path: "other/deleted.ts", status: "deleted" },
    ],
    [".cache/", "ignored.txt"],
  );
  expect(decoration("src")).toBe("conflict");
  expect(decoration("src/new")).toBe("added");
  expect(decoration("src/modified.ts")).toBe("modified");
  expect(decoration("other")).toBe("conflict");
  expect(decoration(".cache/nested/file")).toBe("ignored");
  expect(decoration("ignored.txt")).toBe("ignored");
  expect(decoration(".cache-other")).toBe(undefined);
  expect(decoration("src/newer")).toBe(undefined);
});

async function setup() {
  let head = "one";
  let changes = [{ path: "src/index.ts", status: "modified" }];
  let fail = false;
  const app = await open("./App.tsx", {
    platform: "macos",
    width: 1280,
    height: 840,
    clock: {},
    network: {
      "*": (request) => {
        const query = new URL(request.url).searchParams.get("query") ?? "";
        if (query.includes("NativeGitStatus"))
          return fail
            ? { status: 500 }
            : {
                body: {
                  data: {
                    gitChanges: {
                      repository: true,
                      branch: "main",
                      head,
                      merging: false,
                      ahead: 0,
                      behind: 0,
                      changes,
                    },
                  },
                },
              };
        if (query.includes("NativeGitIgnored"))
          return { body: { data: { ignoredPaths: ["App.tsx"] } } };
        return mockServer(request);
      },
    },
  });
  await app.waitFor("id:file-entry-src");
  await app.waitUntil(() => app.spanStyle("text:src").color === "#936312ff");
  const count = (name: string) =>
    app
      .requests()
      .filter((request) => new URL(request.url).searchParams.get("query")?.includes(name)).length;
  return {
    app,
    count,
    commit() {
      head = "two";
      changes = [];
    },
    fail(value: boolean) {
      fail = value;
    },
  };
}

test("polls external commits while files are visible and preserves expanded native tree rows", async () => {
  const { app, count, commit } = await setup();
  expect(app.spanStyle("text:App.tsx").color).toBe("#7c786dff");
  await app.press("id:file-entry-src");
  await app.waitFor("id:file-entry-src/index.ts");
  expect(app.spanStyle("text:index.ts").color).toBe("#936312ff");
  const history = count("NativeGitLog");
  const files = count("NativeDirectory");
  await app.clock!.runFor(3100);
  expect(count("NativeGitLog")).toBe(history);
  commit();
  await app.clock!.runFor(3100);
  await app.waitUntil(() => app.spanStyle("text:src").color === "#35332fff");
  expect(app.count("id:file-entry-src/index.ts")).toBe(1);
  expect(count("NativeDirectory")).toBe(files);
  expect(count("NativeGitLog")).toBe(history + 1);
});

test("pauses hidden polling and checks immediately when returning to the app", async () => {
  const { app, count, commit } = await setup();
  await app.setLifecycle("background");
  const requests = count("NativeGitStatus");
  commit();
  await app.clock!.runFor(12000);
  expect(count("NativeGitStatus")).toBe(requests);
  await app.setLifecycle("active");
  await app.waitUntil(() => app.spanStyle("text:src").color === "#35332fff");
  expect(count("NativeGitStatus")).toBe(requests + 1);
});

test("unchanged polling preserves paired diff selection and does not reload versions or history", async () => {
  const { app, count } = await setup();
  await app.press("id:nav-branch");
  await app.waitFor("id:git-diff-src/index.ts");
  await app.press("id:git-diff-src/index.ts");
  await app.waitFor("id:git-diff-view");
  await app.press("id:git-diff-view >> text:1 >> nth=0");
  await app.waitFor("id:diff-paired-line-old-0");
  const versions = count("NativeGitFileVersions");
  const history = count("NativeGitLog");
  await app.clock!.runFor(9200);
  expect(count("NativeGitFileVersions")).toBe(versions);
  expect(count("NativeGitLog")).toBe(history);
  expect(app.count("id:diff-paired-line-old-0")).toBe(1);
});

test("backs off failed checks, retains last-known colors, and recovers automatically", async () => {
  const { app, count, fail, commit } = await setup();
  fail(true);
  await app.clock!.runFor(3100);
  const requests = count("NativeGitStatus");
  expect(app.spanStyle("text:src").color).toBe("#936312ff");
  await app.clock!.runFor(3100);
  expect(count("NativeGitStatus")).toBe(requests);
  fail(false);
  commit();
  await app.clock!.runFor(3100);
  await app.waitUntil(() => app.spanStyle("text:src").color === "#35332fff");
});
