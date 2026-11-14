import { computed, effect, signal } from "nsh";
import { query } from "../../api/client";

/** Web uses the same five-second projectJobs check; only active queued drafts need it here. */
export function createComposerWork(
  options: () => { url: string; projectId: string; threadId: string; active: boolean },
) {
  const pending = signal(false),
    known = signal(true);
  const scope = computed(() => JSON.stringify(options()));
  effect(() => {
    const target = JSON.parse(scope()) as ReturnType<typeof options>;
    if (!target.active || !target.threadId) {
      pending.set(false);
      known.set(true);
      return;
    }
    known.set(false);
    let current = true,
      timer: ReturnType<typeof setTimeout> | undefined,
      request: AbortController | undefined;
    async function read() {
      const controller = new AbortController();
      request = controller;
      const timeout = setTimeout(() => controller.abort(), 15000);
      try {
        const data = await query<{
          projectJobs: {
            jobs: {
              threadId: string;
              rootThreadId?: string;
              purpose: string;
              abandonedAt?: string;
              review?: unknown;
              activity: string;
            }[];
          };
        }>(
          target.url,
          "query NativeComposerWork($projectId: ID!) { projectJobs(projectId: $projectId) { jobs } }",
          { projectId: target.projectId },
          controller.signal,
        );
        if (!Array.isArray(data.projectJobs?.jobs)) throw new Error("invalid jobs");
        if (current) {
          pending.set(
            data.projectJobs.jobs.some(
              (job) =>
                (job.threadId === target.threadId || job.rootThreadId === target.threadId) &&
                job.purpose === "wait" &&
                !job.abandonedAt &&
                job.review == null &&
                job.activity !== "complete",
            ),
          );
          known.set(true);
        }
      } catch {
        if (current) known.set(false);
      } finally {
        clearTimeout(timeout);
        if (current) timer = setTimeout(() => void read(), 5000);
      }
    }
    void read();
    return () => {
      current = false;
      request?.abort();
      clearTimeout(timer);
    };
  });
  return { pending, known, blocked: () => !known() || pending() };
}
