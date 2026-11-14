import { expect, open, test } from "nsh/test";
import { editorServer } from "./tests/fixtures/editorServer";

async function setupDiff() {
  const server = editorServer();
  const before = "alpha();\nbeta();\ngamma();\ndelta();\n";
  const after = "alpha();\ninserted();\nbeta();\ngamma();\ndelta();\n";
  const serve = (request: Parameters<typeof server.serve>[0]) => {
    if (new URL(request.url).searchParams.get("query")?.includes("NativeGitFileVersions")) {
      return { body: { data: { gitFileVersions: { before, after, binary: false } } } };
    }
    return server.serve(request);
  };
  const app = await open("./App.tsx", {
    platform: "macos",
    width: 1280,
    height: 840,
    network: { "*": serve },
  });
  await app.waitFor("id:file-entry-App.tsx");
  await app.press("id:nav-branch");
  await app.waitFor("id:git-diff-App.tsx");
  await app.press("id:git-diff-App.tsx");
  await app.waitFor("id:git-diff-view");
  return app;
}

test("anchors the paired highlight to either side's actual aligned row", async () => {
  const app = await setupDiff();
  const requests = app.requests().length;
  // Old line 2 corresponds to new line 3, not new line 2.
  await app.press("id:git-diff-view >> text:2 >> nth=0");
  await app.waitFor("id:diff-paired-line-old-1");
  // Selecting its new-side partner replaces, rather than duplicates, the band.
  await app.press("id:git-diff-view >> text:3 >> nth=1");
  await app.waitFor("id:diff-paired-line-new-2");
  expect(app.count("id:diff-paired-line-old-1")).toBe(0);
  // An inserted row uses its real new-side anchor and highlights the old filler.
  await app.press("id:git-diff-view >> text:2 >> nth=1");
  await app.waitFor("id:diff-paired-line-new-1");
  expect(app.count("id:diff-paired-line-new-2")).toBe(0);
  expect(app.requests().length).toBe(requests);
  expect(app.requests().every((request) => request.method === "GET")).toBe(true);
});

test("keeps normal unified selection and restores paired highlights in split mode", async () => {
  const app = await setupDiff();
  await app.press("id:git-diff-view >> text:2 >> nth=0");
  await app.waitFor("id:diff-paired-line-old-1");
  await app.press("id:diff-layout-unified");
  await app.waitFor("id:diff-mode-unified");
  expect(app.count("id:diff-paired-line-old-1")).toBe(0);
  await app.press("id:diff-layout-split");
  await app.waitFor("id:diff-mode-split");
  await app.waitFor("id:diff-paired-line-old-1");
  expect(app.texts()).toContain("beta();");
});

test("dragging line numbers gives every selected row a native paired anchor", async () => {
  const app = await setupDiff();
  await app.drag("id:git-diff-view >> text:2 >> nth=0", { x: 0, y: 40 });
  await app.waitFor("id:diff-paired-line-old-1");
  await app.waitFor("id:diff-paired-line-old-2");
  await app.waitFor("id:diff-paired-line-old-3");
});

test("refreshing versions clears stale selection while font changes preserve the anchor", async () => {
  const app = await setupDiff();
  await app.press("id:git-diff-view >> text:2 >> nth=0");
  await app.waitFor("id:diff-paired-line-old-1");
  await app.keyboard.press("mod+,");
  await app.waitFor("id:settings-dialog");
  await app.press("id:setting-fontSize >> text:+");
  await app.press("id:close-settings");
  await app.waitFor("id:diff-paired-line-old-1");
  expect(app.spanStyle("text:beta(); >> nth=0").fontSize).toBe(14);
  expect(app.spanStyle("text:beta(); >> nth=1").fontSize).toBe(14);
  await app.press("id:refresh-git");
  await app.waitFor("id:git-diff-view");
  await app.waitUntil(() => app.count("id:diff-paired-line-old-1") === 0);
});
