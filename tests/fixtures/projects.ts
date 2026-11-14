import type { StubRequest, StubResponse } from "nsh/test";
import type { ProjectDetails } from "../../src/api/projects";
import { composerCatalog } from "./composer";
import { mockServer } from "./server";

export function projectsServer() {
  let projects: ProjectDetails[] = [
    {
      id: "p1",
      name: "longx-gui",
      slug: "longx-gui",
      rootPath: "/workspace/longx-gui",
      pinned: true,
      description: "原生界面",
      modelId: null,
      webSearch: true,
      trustLocalAgent: false,
    },
    {
      id: "p2",
      name: "worker",
      slug: "worker",
      rootPath: "/workspace/worker",
      pinned: false,
      description: null,
      modelId: null,
      webSearch: true,
      trustLocalAgent: false,
    },
  ];
  const directories: Record<string, string[]> = {
    "/work": ["existing", "other"],
    "/work/existing": [],
    "/work/other": ["nested"],
    "/work/other/nested": [],
    "/workspace/longx-gui": [],
    "/workspace/worker": [],
    "/": ["work"],
  };
  const writes: { query: string; variables: Record<string, unknown> }[] = [];
  const options = { failProject: false, failWrite: false, failRead: false, directoryDelay: 0 };
  let runtime = { modelRetries: 2, maxDepth: 3, maxChildren: 4, idleMinutes: 15 };
  let defaultModel = "plus";
  const catalog = [
    { id: "m1", slug: "sol", name: "Sol", provider: { name: "Fixture" } },
    { id: "m2", slug: "luna", name: "Luna", provider: { name: "Fixture" } },
  ];
  function serve(request: StubRequest): StubResponse {
    const url = new URL(request.url);
    if (request.method === "GET" && url.pathname === "/")
      return {
        body: '<meta name="csrf-token" content="project-csrf">',
        headers: { "set-cookie": "project_session=fixture; Path=/; HttpOnly" },
      };
    const body =
      request.method === "POST"
        ? JSON.parse(request.body || "{}")
        : {
            query: url.searchParams.get("query") || "",
            variables: JSON.parse(url.searchParams.get("variables") || "{}"),
          };
    const { query, variables } = body;
    if (request.method === "GET") {
      if (query.includes("NativeComposerCatalog")) {
        const catalog = composerCatalog(
          variables.hasThread ? variables.id : "",
          variables.projectId,
        );
        return {
          body: {
            data: {
              ...catalog,
              agentDefinition: { model: null, effort: null },
              modelAliases: [
                ...catalog.modelAliases,
                {
                  name: "plus",
                  label: "普通",
                  models: ["sol"],
                  efforts: ["medium"],
                  builtin: true,
                },
              ],
              defaultModelSetting: { name: defaultModel, kind: "tier", slug: "sol" },
            },
          },
        };
      }
      if (options.failRead && /Native(ProjectSettings|ServerPreferences)/.test(query))
        return { status: 503 };
      if (query.includes("NativeProjects")) return { body: { data: { listProjects: projects } } };
      if (query.includes("NativeProjectSettings"))
        return {
          body: {
            data: {
              getProject: projects.find((project) => project.slug === variables.slug) || null,
            },
          },
        };
      if (query.includes("NativeSettingsModels"))
        return { body: { data: { listModels: catalog } } };
      if (query.includes("NativeServerPreferences"))
        return {
          body: {
            data: {
              listModels: catalog,
              modelAliases: [
                { name: "plus", label: "普通" },
                { name: "pro", label: "高级" },
              ],
              defaultModelSetting: { name: defaultModel, kind: "alias", slug: "luna" },
              agentSettings: runtime,
            },
          },
        };
      if (query.includes("NativeServerDirectory")) {
        const path = variables.path || "/work";
        if (!(path in directories)) return { status: 404 };
        const entry = (path: string) => ({
          path,
          name: path.split("/").pop() || "/",
          git: path === "/work/existing",
        });
        return {
          delay: options.directoryDelay,
          body: {
            data: {
              listDirectory: {
                path,
                parent: path === "/" ? null : path.split("/").slice(0, -1).join("/") || "/",
                git: path === "/work/existing",
                entries: directories[path].map((name) =>
                  entry(`${path === "/" ? "" : path}/${name}`),
                ),
                roots: [entry("/work"), entry("/")],
              },
            },
          },
        };
      }
      return mockServer(request);
    }
    if (
      request.method !== "POST" ||
      !/Native(CreateProject|UpdateProject|SetDefaultModel|SetRuntime)/.test(query)
    )
      return mockServer(request);
    if (request.headers["x-csrf-token"] !== "project-csrf") return { status: 403 };
    writes.push(body);
    if (options.failWrite) return { status: 503 };
    const input = variables.input || {};
    if (query.includes("NativeCreateProjectDirectory")) {
      const path = `${input.parent.replace(/\/$/, "")}/${input.name}`;
      directories[path] = [];
      directories[input.parent].push(input.name);
      return { body: { data: { createDirectory: { path, name: input.name, git: false } } } };
    }
    if (query.includes("NativeCreateProject")) {
      if (options.failProject)
        return {
          body: {
            data: { createProject: { result: null, errors: [{ message: "fixture rejected" }] } },
          },
        };
      const project: ProjectDetails = {
        id: `p${projects.length + 1}`,
        name: input.name,
        rootPath: input.rootPath,
        slug: `project-${projects.length + 1}`,
        pinned: false,
        description: null,
        modelId: null,
        trustLocalAgent: false,
        webSearch: true,
      };
      projects = [...projects, project];
      return { body: { data: { createProject: { result: project, errors: [] } } } };
    }
    if (query.includes("NativeUpdateProject")) {
      projects = projects.map((project) =>
        project.id === variables.id ? { ...project, ...input } : project,
      );
      return {
        body: {
          data: {
            updateProject: {
              result: projects.find((project) => project.id === variables.id),
              errors: [],
            },
          },
        },
      };
    }
    if (query.includes("NativeSetDefaultModel")) {
      defaultModel = input.name;
      return {
        body: { data: { setDefaultModel: { name: defaultModel, kind: "alias", slug: "luna" } } },
      };
    }
    runtime = { ...runtime, ...input };
    return { body: { data: { setAgentSettings: runtime } } };
  }
  return { serve, writes, options };
}
