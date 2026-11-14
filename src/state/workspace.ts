import { batch, computed, effect, signal, untracked } from "nsh";
import {
  type FileEntry,
  listProjects,
  loadWorkspace,
  type Project,
  type ThreadSummary,
} from "../api/client";
import { createServerIcon } from "../features/servers/icons";
import type { Server } from "../features/servers/types";

type Status = "loading" | "ready" | "error";
interface Connection {
  status: Status;
  projects: Project[];
  error: string;
}
interface WorkspaceData {
  status: Status;
  files: FileEntry[];
  threads: ThreadSummary[];
  error: string;
}

/** Each window owns its server connections, selection and cancellable reads. */
export function createWorkspaceState() {
  const servers = signal<Server[]>([
    {
      id: 1,
      name: "本地服务器",
      url: "http://127.0.0.1:7788",
      icon: createServerIcon(1),
    },
  ]);
  const selectedServer = signal(1);
  const connections = signal<Record<number, Connection>>({});
  const selectedProjects = signal<Record<number, string>>({});
  const workspaceData = signal<WorkspaceData>({
    status: "loading",
    files: [],
    threads: [],
    error: "",
  });
  const projectRequests = new Map<number, AbortController>();
  const currentServer = computed(() => servers().find((server) => server.id === selectedServer()));
  const connection = computed(() => connections()[selectedServer()]);
  const projects = computed(() => connection()?.projects ?? []);
  const selectedProject = computed(() =>
    projects().find((project) => project.id === selectedProjects()[selectedServer()]),
  );
  let nextId = 2;
  let disposed = false;

  async function connect(id: number) {
    const server = servers().find((server) => server.id === id);
    if (!server || disposed) return;
    projectRequests.get(id)?.abort();
    const controller = new AbortController();
    projectRequests.set(id, controller);
    const timeout = setTimeout(() => controller.abort(), 10000);
    connections.update((values) => ({
      ...values,
      [id]: { status: "loading", projects: values[id]?.projects ?? [], error: "" },
    }));
    try {
      const values = await listProjects(server.url, controller.signal);
      if (
        disposed ||
        projectRequests.get(id) !== controller ||
        !servers().some((server) => server.id === id)
      )
        return;
      batch(() => {
        const selected = selectedProjects()[id];
        selectedProjects.update((previous) => ({
          ...previous,
          [id]: values.find((project) => project.id === selected)?.id ?? values[0]?.id ?? "",
        }));
        connections.update((previous) => ({
          ...previous,
          [id]: { status: "ready", projects: values, error: "" },
        }));
      });
    } catch {
      if (
        !disposed &&
        projectRequests.get(id) === controller &&
        servers().some((server) => server.id === id)
      ) {
        connections.update((values) => ({
          ...values,
          [id]: {
            status: "error",
            projects: values[id]?.projects ?? [],
            error: "无法连接服务器，请检查地址、服务状态或访问权限。",
          },
        }));
      }
    } finally {
      clearTimeout(timeout);
      if (projectRequests.get(id) === controller) projectRequests.delete(id);
    }
  }

  // A project/server change cancels the previous read. Late responses
  // may never populate a different project's or server's panel.
  const workspaceScope = computed(() =>
    JSON.stringify([currentServer()?.url, selectedProject()?.id, connection()?.status]),
  );
  const workspaces = new Map<string, WorkspaceData>();
  let activeWorkspace = "";
  effect(() => {
    const [serverUrl, projectId, status] = JSON.parse(workspaceScope()) as [
      string | null,
      string | null,
      string | null,
    ];
    const scope = JSON.stringify([serverUrl, projectId]);
    const cached = untracked(() => {
      if (activeWorkspace) workspaces.set(activeWorkspace, workspaceData());
      activeWorkspace = serverUrl && projectId ? scope : "";
      return workspaces.get(scope);
    });
    if (!serverUrl || !projectId) {
      workspaceData.set({ status: "loading", files: [], threads: [], error: "" });
      return;
    }
    workspaceData.set(cached ?? { status: "loading", files: [], threads: [], error: "" });
    if (status !== "ready") return;
    const controller = new AbortController();
    let active = true;
    const timeout = setTimeout(() => controller.abort(), 10000);
    void loadWorkspace(serverUrl, projectId, "", controller.signal)
      .then((data) => {
        if (active) {
          const next: WorkspaceData = { status: "ready", ...data, error: "" };
          workspaces.set(scope, next);
          workspaceData.set(next);
        }
      })
      .catch(() => {
        if (active)
          workspaceData.set({
            status: cached?.status === "ready" ? "ready" : "error",
            files: cached?.files ?? [],
            threads: cached?.threads ?? [],
            error: "工作区读取失败，请检查服务状态后重试。",
          });
      })
      .finally(() => clearTimeout(timeout));
    return () => {
      active = false;
      clearTimeout(timeout);
      controller.abort();
    };
  });
  effect(() => () => {
    disposed = true;
    for (const controller of projectRequests.values()) controller.abort();
    projectRequests.clear();
  });

  function selectServer(id: number) {
    if (!servers().some((server) => server.id === id)) return;
    selectedServer.set(id);
    if (!connections()[id]) void connect(id);
  }

  function closeServer(id: number) {
    const values = servers();
    const index = values.findIndex((server) => server.id === id);
    if (index < 0) return;
    projectRequests.get(id)?.abort();
    projectRequests.delete(id);
    batch(() => {
      servers.set(values.filter((server) => server.id !== id));
      selectedProjects.update((values) => {
        const copy = { ...values };
        delete copy[id];
        return copy;
      });
      connections.update((values) => {
        const copy = { ...values };
        delete copy[id];
        return copy;
      });
      if (selectedServer() === id) {
        selectedServer.set(values[index + 1]?.id ?? values[index - 1]?.id ?? 0);
      }
    });
  }

  function addServer(name: string, address: string) {
    const url = new URL(address.trim());
    if (
      !["http:", "https:"].includes(url.protocol) ||
      url.username ||
      url.password ||
      url.search ||
      url.hash
    ) {
      throw new Error("Invalid server address");
    }
    const normalized = url.href.replace(/\/+$/, "");
    const existing = servers().find((server) => server.url === normalized);
    if (existing) selectServer(existing.id);
    else {
      const id = nextId++;
      servers.update((values) => [
        ...values,
        {
          id,
          name: name.trim() || url.host,
          url: normalized,
          icon: createServerIcon(id),
        },
      ]);
      selectServer(id);
    }
  }

  void connect(1);
  return {
    servers,
    selectedServer,
    currentServer,
    connection,
    projects,
    selectedProject,
    workspaceData,
    selectServer,
    addServer,
    closeServer,
    selectProject: (id: string) => {
      if (!projects().some((project) => project.id === id)) return;
      batch(() => {
        selectedProjects.update((values) => ({ ...values, [selectedServer()]: id }));
      });
    },
    applyProject: (serverId: number, url: string, project: Project, select = false) => {
      if (!servers().some((server) => server.id === serverId && server.url === url)) return;
      batch(() => {
        connections.update((values) => {
          const connection = values[serverId];
          if (!connection) return values;
          return {
            ...values,
            [serverId]: {
              ...connection,
              projects: connection.projects.some((value) => value.id === project.id)
                ? connection.projects.map((value) => (value.id === project.id ? project : value))
                : [...connection.projects, project],
            },
          };
        });
        if (select && selectedServer() === serverId)
          selectedProjects.update((values) => ({ ...values, [serverId]: project.id }));
      });
    },
    refresh: () => {
      void connect(selectedServer());
    },
  };
}

export type WorkspaceState = ReturnType<typeof createWorkspaceState>;
