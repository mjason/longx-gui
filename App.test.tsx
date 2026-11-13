import { expect, open, test } from "nsh/test";

test("shows the top tab strip without business content or network requests", async () => {
  const app = await open("./App.tsx", { platform: "macos", width: 1280, height: 840 });
  expect(app.count("id:app-root")).toBe(1);
  expect(app.count("id:top-bar")).toBe(1);
  expect(app.count("id:empty-content")).toBe(1);
  expect(app.count("id:project-bar")).toBe(1);
  expect(app.texts().sort()).toEqual(["服务器 1", "服务器 2", "服务器 3", "+", "项目", "项目 1", "项目 2", "项目 3"].sort());
  expect(app.count("id:add-server")).toBe(1);
  await app.press("id:top-tab-2");
  expect(app.texts().sort()).toEqual(["服务器 1", "服务器 2", "服务器 3", "+", "项目", "项目 1", "项目 2", "项目 3"].sort());
  expect(app.requests()).toEqual([]);
  const window = app.window("main").state()!;
  expect(window.bounds.size.height - window.contentBounds.size.height).toBeLessThan(4);
});

test("remembers each server's local project selection", async () => {
  const app = await open("./App.tsx", { platform: "macos", width: 1280, height: 840 });
  await app.press("id:project-tab-3");
  expect(app.count("id:project-selected-3")).toBe(1);
  await app.press("id:top-tab-2");
  expect(app.count("id:project-selected-1")).toBe(1);
  await app.press("id:project-tab-2");
  await app.press("id:top-tab-1");
  expect(app.count("id:project-selected-3")).toBe(1);
  await app.press("id:top-tab-2");
  expect(app.count("id:project-selected-2")).toBe(1);
  await app.setViewport(640, 600);
  expect(app.count("id:project-bar")).toBe(1);
  expect(app.count("id:add-server")).toBe(1);
  expect(app.requests()).toEqual([]);
});

test("adds a local server tab through the plus without making a connection", async () => {
  const app = await open("./App.tsx", { platform: "macos", width: 1280, height: 840 });
  await app.press("id:add-server");
  await app.type("id:server-address", "file:///private");
  await app.press("id:confirm-add-server");
  expect(app.count("id:top-tab-4")).toBe(0);
  await app.clear("id:server-address");
  await app.type("id:server-name", "测试服务器");
  await app.type("id:server-address", "https://example.com");
  await app.press("id:confirm-add-server");
  expect(app.texts()).toContain("测试服务器");
  expect(app.count("id:top-tab-4")).toBe(1);
  expect(app.requests()).toEqual([]);
});

test("closes servers without selecting an inactive one and supports an empty strip", async () => {
  const app = await open("./App.tsx", { platform: "macos", width: 1280, height: 840 });
  expect(app.count("id:server-separator-1")).toBe(0);
  expect(app.count("id:server-separator-2")).toBe(1);
  await app.hover("id:top-tab-2");
  expect(app.count("id:server-separator-2")).toBe(0);
  await app.hover("id:titlebar-drag-region");
  expect(app.count("id:server-separator-2")).toBe(1);
  await app.press("id:close-server-3");
  expect(app.count("id:server-selected-1")).toBe(1);
  expect(app.count("id:top-tab-3")).toBe(0);
  await app.press("id:close-server-1");
  expect(app.count("id:server-selected-2")).toBe(1);
  await app.press("id:close-server-2");
  expect(app.count("id:project-bar")).toBe(0);
  expect(app.count("id:add-server")).toBe(1);
  await app.press("id:add-server");
  await app.type("id:server-address", "http://localhost:7788");
  await app.press("id:confirm-add-server");
  expect(app.count("id:server-selected-4")).toBe(1);
  expect(app.count("id:project-bar")).toBe(1);
  expect(app.requests()).toEqual([]);
});

test("closing the active server selects right then falls back to left", async () => {
  const app = await open("./App.tsx", { platform: "macos", width: 1280, height: 840 });
  await app.press("id:top-tab-2");
  await app.press("id:close-server-2");
  expect(app.count("id:server-selected-3")).toBe(1);
  await app.press("id:close-server-3");
  expect(app.count("id:server-selected-1")).toBe(1);
});

test("assigns distinct icons and keeps them stable through hover and selection", async () => {
  const app = await open("./App.tsx", { platform: "macos", width: 1280, height: 840 });
  const variants = [0, 1, 2, 3, 4, 5];
  const assigned = [1, 2, 3].map(id =>
    variants.find(variant => app.count(`id:server-icon-${id}-${variant}`) === 1));
  expect(new Set(assigned).size).toBe(3);
  await app.hover("id:top-tab-2");
  await app.press("id:top-tab-3");
  for (let index = 0; index < assigned.length; index++) {
    expect(app.count(`id:server-icon-${index + 1}-${assigned[index]}`)).toBe(1);
  }
});

test("resets the extracted dialog on reopen and selects duplicate server addresses", async () => {
  const app = await open("./App.tsx", { platform: "macos", width: 1280, height: 840 });
  await app.press("id:add-server");
  await app.type("id:server-name", "未保存");
  await app.type("id:server-address", "file:///private");
  await app.press("id:confirm-add-server");
  await app.press("text:取消");
  await app.press("id:add-server");
  expect(app.value("id:server-name")).toBe("");
  expect(app.value("id:server-address")).toBe("");
  expect(app.texts()).not.toContain("请填写有效的 HTTP / HTTPS 地址；不要包含账号、密码、查询参数或片段。");
  await app.type("id:server-address", "https://example.com/");
  await app.press("id:confirm-add-server");
  await app.press("id:top-tab-1");
  await app.press("id:add-server");
  await app.type("id:server-address", "https://example.com");
  await app.press("id:confirm-add-server");
  expect(app.count("id:server-selected-4")).toBe(1);
  expect(app.count("id:top-tab-5")).toBe(0);
  expect(app.requests()).toEqual([]);
});
