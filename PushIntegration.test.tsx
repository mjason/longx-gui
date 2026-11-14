import { expect, open, test } from "nsh/test";
import { mockServer } from "./tests/fixtures/server";

async function setup() {
  let head = "initial",
    added = false;
  const app = await open("./tests/fixtures/PushHarness.tsx", {
    platform: "macos",
    width: 800,
    height: 800,
    clock: {},
    network: {
      "*": (request) => {
        const query = new URL(request.url).searchParams.get("query") ?? "";
        const variables = JSON.parse(new URL(request.url).searchParams.get("variables") ?? "{}");
        if (query.includes("NativeGitStatus"))
          return {
            body: {
              data: {
                gitChanges: {
                  repository: true,
                  branch: "main",
                  head,
                  merging: false,
                  ahead: 0,
                  behind: 0,
                  changes: [{ path: "src/index.ts", status: "modified" }],
                },
              },
            },
          };
        if (query.includes("NativeDirectory"))
          return {
            body: {
              data: {
                listFiles:
                  variables.path === ""
                    ? [{ name: "src", path: "src", kind: "dir", size: 0 }]
                    : [
                        { name: "index.ts", path: "src/index.ts", kind: "file", size: 24 },
                        ...(added
                          ? [{ name: "new.ts", path: "src/new.ts", kind: "file", size: 10 }]
                          : []),
                      ],
              },
            },
          };
        return mockServer(request);
      },
    },
  });
  await app.waitFor("text:head:initial");
  const count = (query: string) =>
    app.requests().filter((request) => request.url.includes(query)).length;
  return {
    app,
    count,
    changeHead() {
      head = "committed";
    },
    add() {
      added = true;
    },
  };
}

test("a joined channel stops polling and a Git push updates external commits immediately", async () => {
  const { app, count, changeHead } = await setup();
  await app.press("id:join");
  await app.clock!.runFor(200);
  const reads = count("NativeGitStatus");
  await app.clock!.runFor(12000);
  expect(count("NativeGitStatus")).toBe(reads);
  changeHead();
  await app.press("id:git");
  await app.clock!.runFor(200);
  await app.waitFor("text:head:committed");
  expect(count("NativeGitStatus")).toBe(reads + 1);
});

test("files pushes coalesce and invalidate affected diff paths even with unchanged modified status", async () => {
  const { app, count, add } = await setup();
  await app.press("id:join");
  await app.clock!.runFor(200);
  await app.press("id:file-entry-src");
  await app.waitFor("id:file-entry-src/index.ts");
  const directories = count("NativeDirectory");
  add();
  await app.press("id:files");
  await app.clock!.runFor(200);
  await app.waitFor("id:file-entry-src/new.ts");
  expect(app.count("id:file-entry-src/index.ts")).toBe(1);
  expect(app.texts()).toContain("a:1,b:0");
  expect(count("NativeDirectory")).toBe(directories + 2);
  expect(app.texts()).toContain("revision:1");
});

test("disconnect falls back to checks and rejoin catches up loaded directories and diffs", async () => {
  const { app, count, add } = await setup();
  await app.press("id:join");
  await app.clock!.runFor(200);
  await app.press("id:file-entry-src");
  await app.waitFor("id:file-entry-src/index.ts");
  await app.press("id:disconnect");
  const reads = count("NativeGitStatus");
  await app.clock!.runFor(3100);
  expect(count("NativeGitStatus")).toBe(reads + 1);
  add();
  await app.press("id:reconnect");
  await app.clock!.runFor(200);
  await app.waitFor("id:file-entry-src/new.ts");
  expect(app.texts()).toContain("revision:2");
  const joined = count("NativeGitStatus");
  await app.clock!.runFor(4000);
  expect(count("NativeGitStatus")).toBe(joined);
});

test("project changes reject late channel callbacks without invalidating new project data", async () => {
  const { app, count } = await setup();
  await app.press("id:switch");
  await app.clock!.runFor(200);
  const requests = count("NativeGitStatus");
  await app.press("id:old-event");
  await app.clock!.runFor(200);
  expect(count("NativeGitStatus")).toBe(requests);
  expect(app.texts()).toContain("a:0,b:0");
  expect(count("NativeDirectory")).toBe(0);
});
