import { expect, open, test } from "nsh/test";
import { composerServer } from "./tests/fixtures/composer";

async function setup() {
  const app = await open("./tests/fixtures/ComposerHarness.tsx", {
    width: 1000,
    height: 850,
    platform: "macos",
    network: { "*": composerServer, "POST *": composerServer },
  });
  await app.waitFor("text:pro");
  return app;
}
test("system file picking supports image-only sends and small inline text attachments", async () => {
  const app = await setup();
  const bytes = new TextEncoder().encode(
    '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20"><rect width="20" height="20" fill="olive"/></svg>',
  );
  app.onPick(() => [
    { name: "photo.svg", type: "image/svg+xml", data: bytes },
    {
      name: "notes.md",
      type: "text/markdown",
      data: new TextEncoder().encode("# Small document\nhello"),
    },
  ]);
  await app.press("id:composer-attach");
  await app.waitFor("id:composer-attachment-photo.svg");
  await app.waitFor("id:composer-attachment-notes.md");
  expect(app.requests().filter((request) => request.method === "POST").length).toBe(0);
  await app.press("id:thread-send");
  await app.waitFor("text:已发送，正在同步会话…");
  const input = JSON.parse(app.requests().find((request) => request.method === "POST")!.body!)
    .variables.input;
  expect(input.images[0].startsWith("data:image/svg+xml;base64,")).toBe(true);
  expect(input.text).toContain("<attachment");
  expect(input.text).toContain("# Small document\nhello");
  expect(app.count("id:composer-attachment-photo.svg")).toBe(0);
});

test("dropped file paths denied by the sandbox use the system picker confirmation without broadening permissions", async () => {
  const app = await setup();
  app.onPick(() => [
    {
      name: "composer-note.md",
      type: "text/markdown",
      data: new TextEncoder().encode("# 附件测试文档\n已通过系统选择器确认"),
    },
  ]);
  const source = new URL("./tests/fixtures/composer-note.md", import.meta.url);
  const uri = source.protocol === "asset:" ? `file://${source.pathname}` : source.href;
  await app.dropFiles("id:thread-composer", [uri]);
  await app.waitFor("id:composer-attachment-composer-note.md");
  expect(app.requests().filter((request) => request.method === "POST").length).toBe(0);
  await app.press("id:thread-send");
  await app.waitFor("text:已发送，正在同步会话…");
  const input = JSON.parse(app.requests().find((request) => request.method === "POST")!.body!)
    .variables.input;
  expect(input.text).toContain("已通过系统选择器确认");
});
test("large text and arbitrary files upload with the same CSRF session before sending server references", async () => {
  const app = await setup();
  app.onPick(() => [
    { name: "large.md", type: "text/markdown", data: new Uint8Array(40000).fill(97) },
  ]);
  await app.press("id:composer-attach");
  await app.waitUntil(() =>
    app.requests().some((request) => request.url.includes("/attachments/")),
  );
  await app.waitFor("text:39 KiB");
  const upload = app.requests().find((request) => request.url.includes("/attachments/"))!;
  expect(upload.method).toBe("POST");
  expect(upload.headers["x-csrf-token"]).toBe("fixture-csrf");
  expect(upload.headers.cookie).toBe("fixture=session");
  await app.press("id:thread-send");
  await app.waitFor("text:已发送，正在同步会话…");
  const input = JSON.parse(
    app.requests().find((request) => request.method === "POST" && request.url.endsWith("/gql"))!
      .body!,
  ).variables.input;
  expect(input.text).toContain("/server/attachments/uploaded.bin");
  expect(input.images).toBe(undefined);
});
test("failed uploads block sending until the broken attachment is removed", async () => {
  const app = await open("./tests/fixtures/ComposerHarness.tsx", {
    network: {
      "*": composerServer,
      "POST */attachments/*": () => ({ status: 413 }),
      "POST */gql": composerServer,
    },
  });
  app.onPick(() => [
    { name: "broken.pdf", type: "application/pdf", data: new Uint8Array([37, 80, 68, 70]) },
  ]);
  await app.press("id:composer-attach");
  await app.waitFor("text:附件上传失败（413），可移除后重新添加。");
  await app.type("id:thread-input", "文字草稿仍然保留");
  await expect(app.press("id:thread-send")).rejects.toMatchObject({
    code: "ERR_NSH_TEST_DISABLED",
  });
  await app.press("id:composer-remove-broken.pdf");
  expect(app.value("id:thread-input")).toBe("文字草稿仍然保留");
  await app.press("id:thread-send");
  await app.waitFor("text:已发送，正在同步会话…");
});
