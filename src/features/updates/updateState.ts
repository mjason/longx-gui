import { signal } from "nsh";
import type { AppUpdate, PackageUpdate, UpdateProgress } from "nsh/updater";

export interface UpdateApi {
  supported: () => boolean;
  checkForPackage: () => Promise<PackageUpdate | null>;
  checkForUpdate: () => Promise<AppUpdate | null>;
  downloadPackage: (progress: (value: UpdateProgress) => void) => Promise<void>;
  downloadUpdate: (progress: (value: UpdateProgress) => void) => Promise<void>;
  restartToPackage: () => Promise<void>;
  installAndRestart: () => Promise<void>;
}
export type UpdateCandidate =
  | { kind: "package"; value: PackageUpdate }
  | { kind: "app"; value: AppUpdate };
export function createUpdateState(api: UpdateApi) {
  const phase = signal<
    | "idle"
    | "checking"
    | "available"
    | "downloading"
    | "ready"
    | "installing"
    | "error"
    | "unsupported"
  >("idle");
  const candidate = signal<UpdateCandidate | null>(null);
  const progress = signal<UpdateProgress>({ received: 0 });
  const checked = signal(false);
  const error = signal("");
  let locked = false;
  let users = 0;
  let startup: ReturnType<typeof setTimeout> | undefined;
  let interval: ReturnType<typeof setInterval> | undefined;
  async function check() {
    if (locked || phase() === "ready") return;
    if (!api.supported()) {
      phase.set("unsupported");
      return;
    }
    locked = true;
    error.set("");
    candidate.set(null);
    phase.set("checking");
    try {
      const pkg = await api.checkForPackage();
      if (pkg) candidate.set({ kind: "package", value: pkg });
      else {
        const app = await api.checkForUpdate();
        if (app) candidate.set({ kind: "app", value: app });
      }
      checked.set(true);
      phase.set(candidate() ? "available" : "idle");
    } catch {
      error.set("无法检查更新。请检查网络连接；签名或来源校验失败的更新不会安装。");
      phase.set("error");
    } finally {
      locked = false;
    }
  }
  return {
    phase,
    candidate,
    progress,
    checked,
    error,
    busy: () => ["checking", "downloading", "installing"].includes(phase()),
    check,
    async download() {
      const found = candidate();
      if (locked || !found || !["available", "error"].includes(phase())) return;
      if (found.kind === "app" && !found.value.canInstall) return;
      locked = true;
      error.set("");
      progress.set({ received: 0 });
      phase.set("downloading");
      try {
        const onProgress = (value: UpdateProgress) => progress.set(value);
        if (found.kind === "package") await api.downloadPackage(onProgress);
        else await api.downloadUpdate(onProgress);
        phase.set("ready");
      } catch {
        error.set("更新下载或校验失败，未安装。当前版本保持不变，可重新检查后再试。");
        candidate.set(null);
        phase.set("error");
      } finally {
        locked = false;
      }
    },
    /** Called only after a visible restart confirmation, never by background checks. */
    async install() {
      const found = candidate();
      if (locked || phase() !== "ready" || !found) return;
      locked = true;
      phase.set("installing");
      try {
        if (found.kind === "package") await api.restartToPackage();
        else await api.installAndRestart();
        // Successful native restart does not resolve. A stub/no-op is not proof of installation.
        error.set("重启未完成。更新仍已就绪，请稍后重试。");
      } catch {
        error.set("无法应用更新或重启。请保存工作后重试，或从 GitHub 下载整包。");
      } finally {
        locked = false;
        phase.set("ready");
      }
    },
    start() {
      users++;
      if (users === 1 && api.supported()) {
        startup = setTimeout(() => void check(), 10000);
        interval = setInterval(
          () => {
            if (phase() === "idle" || phase() === "error") void check();
          },
          6 * 60 * 60 * 1000,
        );
      }
      return () => {
        if (--users === 0) {
          clearTimeout(startup);
          clearInterval(interval);
        }
      };
    },
  };
}
export type UpdateState = ReturnType<typeof createUpdateState>;
