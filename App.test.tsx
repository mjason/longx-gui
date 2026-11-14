import { type App, expect, open, test } from "nsh/test";
import { mockServer } from "./tests/fixtures/server";

async function openApp() {
  const app = await open("./App.tsx", {
    platform: "macos",
    width: 1280,
    height: 840,
    clock: {},
    network: { "*": mockServer },
  });
  await app.waitFor("id:file-entry-App.tsx");
  return app;
}

async function addServer(app: App, address: string, name = "测试服务器") {
  await app.press("id:add-server");
  await app.type("id:server-name", name);
  await app.type("id:server-address", address);
  await app.press("id:confirm-add-server");
  await app.waitFor("id:file-entry-App.tsx");
}

test("switches themes live without resetting workspace or refetching files", async () => {
  const app = await openApp();
  await app.press("id:file-entry-src");
  await app.waitFor("id:file-entry-src/index.ts");
  const requests = app.requests().length;
  expect(app.texts()).toContain("浅色");
  await app.press("id:theme-menu");
  await app.press("id:theme-dark");
  expect(app.texts()).toContain("深色");
  expect(app.count("id:file-entry-src/index.ts")).toBe(1);
  expect(app.count("id:project-selected-p1")).toBe(1);
  expect(app.requests().length).toBe(requests);
  expect(app.storage()["appearance.theme"]).toBe("dark");
  await app.press("id:add-server");
  expect(app.texts()).toContain("添加服务器");
  await app.press("text:取消");
  await app.wait(200);
  await app.press("id:theme-menu");
  await app.press("id:theme-light");
  expect(app.texts()).toContain("浅色");
  expect(app.count("id:file-entry-src/index.ts")).toBe(1);
});

test("restores saved theme and falls back safely for unknown preferences", async () => {
  const app = await open("./App.tsx", {
    platform: "macos",
    width: 1280,
    height: 840,
    storage: { "appearance.theme": "dark" },
    network: { "*": mockServer },
  });
  await app.waitFor("text:深色");
  expect(app.storage()["appearance.theme"]).toBe("dark");
  const fallback = await open("./App.tsx", {
    platform: "macos",
    width: 1280,
    height: 840,
    storage: { "appearance.theme": "removed-theme" },
    network: { "*": mockServer },
  });
  await fallback.waitFor("id:file-entry-App.tsx");
  expect(fallback.texts()).toContain("浅色");
});

test("keeps legacy theme preferences after removing the old theme name", async () => {
  const app = await open("./App.tsx", {
    platform: "macos",
    storage: { "appearance.theme": "monokai-dark" },
    network: { "*": mockServer },
  });
  await app.waitFor("text:深色");
  expect(app.texts().some((text) => text.includes("Monokai"))).toBe(false);
});

test("retains separate file and conversation tabs with selection and close behavior", async () => {
  const app = await openApp();
  await app.press("id:file-entry-App.tsx");
  await app.keyboard.press("enter");
  await app.press("id:thread-entry-t1");
  await app.press("id:thread-entry-t1");
  expect(app.count("id:content-tab-file:App.tsx")).toBe(1);
  expect(app.count("id:content-tab-chat:t1")).toBe(1);
  // Reopening a closed chat now reads its metadata; document/cache operations
  // must still avoid unrelated reads.
  const documentRequests = () =>
    app
      .requests()
      .filter(
        (request) =>
          !request.url.includes("NativeThread") && !request.url.includes("NativeComposerCatalog"),
      ).length;
  const requests = documentRequests();
  await app.press("id:content-tab-file:App.tsx");
  await app.waitFor("id:file-editor");
  expect(app.count("id:file-editor")).toBe(1);
  await app.press("id:theme-menu");
  await app.press("id:theme-dark");
  expect(app.count("id:content-tab-chat:t1")).toBe(1);
  expect(app.count("id:workspace-dock")).toBe(1);
  await app.press("id:close-content-chat:t1");
  await app.waitFor("id:file-editor");
  expect(app.count("id:file-editor")).toBe(1);
  await app.press("id:thread-entry-t1");
  await app.press("id:close-content-chat:t1");
  await app.waitFor("id:file-editor");
  expect(app.count("id:file-editor")).toBe(1);
  await app.press("id:close-content-file:App.tsx");
  expect(app.texts()).toContain("从左侧选择文件或会话，或在当前项目开始新会话。");
  expect(app.count("id:content-tab-file:App.tsx")).toBe(0);
  expect(documentRequests()).toBe(requests);
  await app.press("id:thread-entry-t1");
  await app.press("id:project-tab-p2");
  await app.waitFor("id:project-selected-p2");
  expect(app.count("id:content-tab-chat:t1")).toBe(0);
});

test("connects the local server and renders the real-data workspace layout", async () => {
  const app = await openApp();
  for (const id of [
    "app-root",
    "top-bar",
    "project-bar",
    "workspace-layout",
    "panel-bar",
    "workspace-dock",
    "workspace-main",
    "workspace-status",
  ]) {
    expect(app.count(`id:${id}`)).toBe(1);
  }
  expect(app.count("id:top-tab-1")).toBe(1);
  expect(app.count("id:activity-bar")).toBe(0);
  expect(app.count("id:files-dock")).toBe(1);
  expect(app.count("id:conversations-dock")).toBe(1);
  expect(app.count("id:files-header-title")).toBe(1);
  expect(app.count("id:conversations-header-count")).toBe(1);
  expect(app.texts()).not.toContain("文件");
  expect(app.texts()).not.toContain("1 个会话");
  expect(app.count("id:workspace-context")).toBe(1);
  expect(app.count("id:sidebar-search")).toBe(0);
  expect(app.count("id:top-tab-2")).toBe(0);
  expect(app.texts()).toContain("本地服务器");
  expect(app.texts()).toContain("longx-gui");
  expect(app.texts()).toContain("已连接");
  expect(app.requests().length).toBeGreaterThan(1);
  expect(
    app
      .requests()
      .every(
        (request) =>
          request.method === "GET" && request.url.startsWith("http://127.0.0.1:7788/gql?"),
      ),
  ).toBe(true);
  const window = app.window("main").state()!;
  expect(window.bounds.size.height - window.contentBounds.size.height).toBeLessThan(4);
});

test("toggles independent bottom-bar docks without clearing file cache or content tabs", async () => {
  const app = await openApp();
  await app.press("id:file-entry-src");
  await app.waitFor("id:file-entry-src/index.ts");
  await app.press("id:thread-entry-t1");
  const directoryReads = () =>
    app.requests().filter((request) => request.url.includes("NativeDirectory")).length;
  const requests = directoryReads();
  await app.press("id:nav-folder");
  expect(app.count("id:files-dock")).toBe(0);
  expect(app.count("id:conversations-dock")).toBe(1);
  await app.press("id:nav-folder");
  await app.waitFor("id:file-entry-src/index.ts");
  await app.press("id:nav-chat");
  expect(app.count("id:conversations-dock")).toBe(0);
  expect(app.count("id:file-tree")).toBe(1);
  await app.press("id:nav-chat");
  expect(app.count("id:thread-entry-t1")).toBe(1);
  await app.press("id:nav-branch");
  await app.waitFor("id:git-branch");
  expect(app.count("id:git-panel")).toBe(1);
  await app.press("id:nav-folder");
  await app.waitFor("id:file-entry-src/index.ts");
  await app.press("id:file-root-toggle");
  expect(app.count("id:file-tree")).toBe(0);
  await app.press("id:file-root-toggle");
  await app.waitFor("id:file-entry-src/index.ts");
  await app.press("id:toggle-sidebar");
  expect(app.count("id:files-dock")).toBe(0);
  await app.press("id:toggle-sidebar");
  await app.waitFor("id:file-entry-src/index.ts");
  expect(app.count("id:conversations-dock")).toBe(1);
  expect(app.count("id:content-tab-chat:t1")).toBe(1);
  await app.press("id:search-files");
  await app.type("id:sidebar-search", "index");
  await app.press("id:toggle-sidebar");
  await app.press("id:toggle-sidebar");
  expect(app.count("id:sidebar-search")).toBe(1);
  expect(app.count("id:file-entry-App.tsx")).toBe(0);
  expect(app.count("id:file-entry-src/index.ts")).toBe(1);
  await app.clear("id:sidebar-search");
  expect(app.count("id:file-entry-App.tsx")).toBe(1);
  expect(directoryReads()).toBe(requests);
});

test("keeps project selection separate for each server", async () => {
  const app = await openApp();
  await app.press("id:project-tab-p2");
  await app.waitFor("id:project-selected-p2");
  await addServer(app, "https://other.example");
  expect(app.count("id:project-selected-p1")).toBe(1);
  await app.press("id:top-tab-1");
  expect(app.count("id:project-selected-p2")).toBe(1);
  expect(app.texts()).toContain("后台工作");
  await app.setViewport(640, 600);
  expect(app.count("id:workspace-main")).toBe(1);
  await app.press("id:close-sidebar");
  expect(app.count("id:files-dock")).toBe(0);
  await app.press("id:nav-folder");
  expect(app.count("id:files-dock")).toBe(1);
});

test("uses a native lazy Tree and opens files on keyboard activation", async () => {
  const app = await openApp();
  expect(app.count("id:file-tree")).toBe(1);
  await app.press("id:file-entry-src");
  await app.waitFor("id:file-entry-src/index.ts");
  expect(app.count("id:file-entry-App.tsx")).toBe(1);
  const directoryRequests = () =>
    app.requests().filter((request) => request.url.includes("NativeDirectory")).length;
  expect(directoryRequests()).toBe(1);
  await app.press("id:file-entry-src");
  expect(app.count("id:file-entry-src/index.ts")).toBe(0);
  await app.press("id:file-entry-src");
  await app.waitFor("id:file-entry-src/index.ts");
  expect(directoryRequests()).toBe(1);
  await app.press("id:search-files");
  await app.type("id:sidebar-search", "index");
  expect(app.count("id:file-entry-src")).toBe(1);
  expect(app.count("id:file-entry-src/index.ts")).toBe(1);
  expect(app.count("id:file-entry-App.tsx")).toBe(0);
  await app.clear("id:sidebar-search");
  await app.type("id:sidebar-search", "App");
  expect(app.count("id:file-entry-src")).toBe(0);
  await app.press("id:file-entry-App.tsx");
  expect(app.count("id:file-editor")).toBe(0);
  await app.keyboard.press("enter");
  await app.waitFor("id:file-editor");
  expect(app.count("id:file-editor")).toBe(1);
  await app.press("id:thread-entry-t1");
  expect(app.texts()).toContain("界面设计");
  expect(app.count("id:thread-pane")).toBe(1);
  expect(app.count("id:composer-placeholder")).toBe(0);
  expect(app.requests().every((request) => request.method === "GET")).toBe(true);
});

test("uses Tree arrow keys for selection and Enter for file activation", async () => {
  const app = await openApp();
  await app.press("id:file-entry-src");
  await app.keyboard.press("right");
  expect(app.count("id:file-editor")).toBe(0);
  await app.keyboard.press("enter");
  await app.waitFor("id:file-editor");
  expect(app.count("id:file-editor")).toBe(1);
  expect(app.texts()).toContain("src/index.ts");
});

test("filters a large loaded native tree after focusing a document panel", async () => {
  const app = await open("./App.tsx", {
    platform: "macos",
    width: 1280,
    height: 840,
    network: {
      "*": (request) => {
        const query = new URL(request.url).searchParams.get("query") ?? "";
        if (query.includes("NativeDirectory"))
          return {
            body: {
              data: {
                listFiles: Array.from({ length: 200 }, (_, index) => ({
                  name: `item-${index}.ts`,
                  path: `src/item-${index}.ts`,
                  kind: "file",
                  size: 10,
                })),
              },
            },
          };
        return mockServer(request);
      },
    },
  });
  await app.waitFor("id:file-entry-App.tsx");
  await app.press("id:file-entry-App.tsx");
  await app.keyboard.press("enter");
  await app.waitFor("id:file-editor");
  await app.press("id:file-entry-src");
  await app.waitFor("id:file-entry-src/item-0.ts");
  await app.press("id:search-files");
  await app.type("id:sidebar-search", "item-199");
  await app.waitFor("id:file-entry-src/item-199.ts");
  expect(app.count("id:file-entry-src/item-0.ts")).toBe(0);
  await app.clear("id:sidebar-search");
  await app.waitFor("id:file-entry-src/item-0.ts");
  expect(app.requests().filter((request) => request.url.includes("NativeDirectory")).length).toBe(
    1,
  );
});

test("rejects invalid addresses and deduplicates normalized servers", async () => {
  const app = await openApp();
  const before = app.requests().length;
  await app.press("id:add-server");
  await app.type("id:server-address", "file:///private");
  await app.press("id:confirm-add-server");
  expect(app.count("id:top-tab-2")).toBe(0);
  expect(app.requests().length).toBe(before);
  await app.clear("id:server-address");
  await app.type("id:server-address", "http://127.0.0.1:7788/");
  await app.press("id:confirm-add-server");
  expect(app.count("id:top-tab-2")).toBe(0);
  expect(app.count("id:server-selected-1")).toBe(1);
  await app.press("id:add-server");
  expect(app.value("id:server-address")).toBe("");
  expect(app.value("id:server-name")).toBe("");
});

test("closes tabs, hides separators at selected/hover boundaries and recovers from an empty strip", async () => {
  const app = await openApp();
  await addServer(app, "https://two.example", "服务器 2");
  await addServer(app, "https://three.example", "服务器 3");
  await app.press("id:top-tab-1");
  expect(app.count("id:server-separator-1")).toBe(0);
  expect(app.count("id:server-separator-2")).toBe(1);
  await app.hover("id:top-tab-2");
  expect(app.count("id:server-separator-2")).toBe(0);
  await app.hover("id:titlebar-drag-region");
  expect(app.count("id:server-separator-2")).toBe(1);
  await app.press("id:close-server-3");
  expect(app.count("id:server-selected-1")).toBe(1);
  await app.press("id:close-server-1");
  expect(app.count("id:server-selected-2")).toBe(1);
  await app.press("id:close-server-2");
  expect(app.count("id:project-bar")).toBe(0);
  expect(app.texts()).toContain("添加服务器开始使用");
  await addServer(app, "http://127.0.0.1:7788");
  expect(app.count("id:server-selected-4")).toBe(1);
  expect(app.count("id:project-bar")).toBe(1);
});

test("closing the active last tab selects its left neighbor", async () => {
  const app = await openApp();
  await addServer(app, "https://two.example");
  await app.press("id:close-server-2");
  expect(app.count("id:server-selected-1")).toBe(1);
});

test("assigns distinct stable server icons", async () => {
  const app = await openApp();
  await addServer(app, "https://two.example");
  await addServer(app, "https://three.example");
  const variants = [0, 1, 2, 3, 4, 5];
  const assigned = [1, 2, 3].map((id) =>
    variants.find((variant) => app.count(`id:server-icon-${id}-${variant}`) === 1),
  );
  expect(new Set(assigned).size).toBe(3);
  await app.hover("id:top-tab-2");
  await app.press("id:top-tab-1");
  for (let index = 0; index < assigned.length; index++) {
    expect(app.count(`id:server-icon-${index + 1}-${assigned[index]}`)).toBe(1);
  }
});

test("shows connection failure and supports retry without fake projects", async () => {
  let fail = true;
  const app = await open("./App.tsx", {
    platform: "macos",
    width: 1280,
    height: 840,
    network: { "*": (request) => (fail ? { status: 503 } : mockServer(request)) },
  });
  await app.waitFor("id:retry-connection");
  expect(app.count("id:project-tab-p1")).toBe(0);
  expect(app.texts()).toContain("连接失败");
  fail = false;
  await app.press("id:retry-connection");
  await app.waitFor("id:file-entry-App.tsx");
  expect(app.texts()).toContain("已连接");
});

test("handles an empty project list without requesting a made-up project", async () => {
  const app = await open("./App.tsx", {
    platform: "macos",
    width: 1280,
    height: 840,
    network: { "*": { body: { data: { listProjects: [] } } } },
  });
  await app.waitFor("text:还没有项目，新建或打开一个目录开始使用。");
  expect(app.enabled("id:new-project")).toBe(true);
  expect(app.enabled("id:open-project-directory")).toBe(true);
  expect(app.requests().length).toBe(1);
  expect(app.count("id:composer-placeholder")).toBe(0);
});

test("shows workspace query failure without retaining another project's files", async () => {
  const app = await open("./App.tsx", {
    platform: "macos",
    width: 1280,
    height: 840,
    network: {
      "*": (request) =>
        request.url.includes("NativeWorkspace")
          ? { body: { errors: [{ message: "access denied" }] } }
          : mockServer(request),
    },
  });
  await app.waitFor("text:工作区读取失败，请检查服务状态后重试。");
  expect(app.count("id:file-entry-App.tsx")).toBe(0);
  expect(app.texts()).not.toContain("access denied");
});

test("keeps empty folders in the Tree and retries failed child reads", async () => {
  let fail = true;
  const app = await open("./App.tsx", {
    platform: "macos",
    width: 1280,
    height: 840,
    network: {
      "*": (request) =>
        request.url.includes("NativeDirectory")
          ? fail
            ? { status: 503 }
            : { body: { data: { listFiles: [] } } }
          : mockServer(request),
    },
  });
  await app.waitFor("id:file-entry-src");
  await app.press("id:file-entry-src");
  await app.waitFor("text:读取失败，收起后展开重试");
  fail = false;
  await app.press("id:file-entry-src");
  await app.press("id:file-entry-src");
  await app.waitFor("text:空文件夹");
  expect(app.count("id:file-entry-App.tsx")).toBe(1);
});

test("keeps directory caches isolated when switching projects", async () => {
  const app = await openApp();
  await app.press("id:file-entry-src");
  await app.waitFor("id:file-entry-src/index.ts");
  await app.press("id:project-tab-p2");
  await app.waitFor("id:file-entry-App.tsx");
  expect(app.count("id:file-entry-src/index.ts")).toBe(0);
  await app.press("id:file-entry-src");
  await app.waitFor("id:file-entry-src/index.ts");
  const requests = app.requests().filter((request) => request.url.includes("NativeDirectory"));
  expect(requests.length).toBe(2);
  expect(new URL(requests[1].url).searchParams.get("variables")).toContain('"projectId":"p2"');
});
