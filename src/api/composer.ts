import { query } from "./client";
import { postGraphql } from "./session";

export interface ComposerModel {
  slug: string;
  name: string;
  default: boolean;
  contextWindow: number;
  reasoningLevels: string[];
  reasoningEffort: string | null;
  provider: { name: string };
}
export interface ComposerAlias {
  name: string;
  label: string;
  models: string[];
  efforts: (string | null)[];
  builtin: boolean;
}
export interface ComposerCatalog {
  listModels: ComposerModel[];
  modelAliases: ComposerAlias[];
  defaultModelSetting: { name: string; slug: string | null; kind: string };
  agentDefinition?: { model: string | null; effort: string | null };
  getThread: {
    id: string;
    projectId: string;
    modelSlug: string | null;
    reasoningEffort: string | null;
    status: string;
  } | null;
}
export async function loadComposerCatalog(
  url: string,
  projectId: string,
  threadId: string,
  signal: AbortSignal,
) {
  const data = await query<ComposerCatalog>(
    url,
    `query NativeComposerCatalog($id: ID!, $hasThread: Boolean!, $projectId: ID!) {
    listModels { slug name default contextWindow reasoningLevels reasoningEffort provider { name } }
    modelAliases { name label models efforts builtin }
    defaultModelSetting { name slug kind }
    agentDefinition(id: $projectId) { model effort }
    getThread(id: $id) @include(if: $hasThread) { id projectId modelSlug reasoningEffort status }
  }`,
    { id: threadId || "new", hasThread: !!threadId, projectId },
    signal,
  );
  if (
    !Array.isArray(data.listModels) ||
    !Array.isArray(data.modelAliases) ||
    !data.defaultModelSetting ||
    (threadId &&
      (!data.getThread || data.getThread.id !== threadId || data.getThread.projectId !== projectId))
  )
    throw new Error("模型或会话设置不兼容，请刷新重试。");
  data.listModels = data.listModels.filter(
    (model) => typeof model.slug === "string" && !!model.slug,
  );
  if (
    data.listModels.some((model) => !Array.isArray(model.reasoningLevels)) ||
    data.modelAliases.some((alias) => !Array.isArray(alias.models) || !Array.isArray(alias.efforts))
  )
    throw new Error("模型档位格式不兼容。");
  return data;
}
export function resolvedModel(catalog: ComposerCatalog, selected: string | null) {
  const name =
    selected ??
    catalog.getThread?.modelSlug ??
    catalog.agentDefinition?.model ??
    catalog.defaultModelSetting.name;
  const alias = catalog.modelAliases.find((item) => item.name === name);
  const slug = alias ? alias.models[0] || catalog.defaultModelSetting.slug : name;
  const model = catalog.listModels.find((item) => item.slug === slug);
  return { name, alias, model };
}
export function modelEfforts(catalog: ComposerCatalog, selected: string | null) {
  const resolved = resolvedModel(catalog, selected);
  return resolved.model?.reasoningLevels ?? [];
}
export async function interruptTurn(
  url: string,
  threadId: string,
  kernelTurnId: string,
  signal: AbortSignal,
) {
  const data = await postGraphql<{ interruptTurn: boolean }>(
    url,
    "mutation NativeInterruptTurn($input: InterruptTurnInput!) { interruptTurn(input: $input) }",
    { input: { threadId, kernelTurnId } },
    signal,
  );
  if (data.interruptTurn !== true) throw new Error("停止结果未确认，请核对会话状态。");
}
export async function retractTurn(
  url: string,
  threadId: string,
  kernelTurnId: string,
  signal: AbortSignal,
) {
  const data = await postGraphql<{ retractTurn: { text: string } | null }>(
    url,
    "mutation NativeRetractTurn($input: RetractTurnInput!) { retractTurn(input: $input) { text } }",
    { input: { threadId, kernelTurnId } },
    signal,
  );
  if (!data.retractTurn || typeof data.retractTurn.text !== "string")
    throw new Error("撤回结果未确认。");
  return data.retractTurn.text;
}
export async function steerTurn(
  url: string,
  threadId: string,
  text: string,
  images: string[],
  signal: AbortSignal,
) {
  const data = await postGraphql<{ steerTurn: { kernelTurnId: string } }>(
    url,
    "mutation NativeSteerTurn($input: SteerTurnInput!) { steerTurn(input: $input) { kernelTurnId } }",
    { input: { threadId, text, ...(images.length ? { images } : {}) } },
    signal,
  );
  if (!data.steerTurn?.kernelTurnId) throw new Error("插入结果未确认。");
  return data.steerTurn;
}
export async function startThread(
  url: string,
  projectId: string,
  model: string | null,
  effort: string | null,
  signal: AbortSignal,
) {
  const data = await postGraphql<{
    startThread: {
      id: string;
      kernelThreadId: string;
      title: string | null;
      status: string;
      projectId: string;
    };
  }>(
    url,
    `mutation NativeStartThread($input: StartThreadInput!) {
      startThread(input: $input) { id kernelThreadId title status projectId }
    }`,
    { input: { projectId, ...(model ? { model } : {}), ...(effort ? { effort } : {}) } },
    signal,
  );
  if (
    !data.startThread?.id ||
    !data.startThread.kernelThreadId ||
    data.startThread.projectId !== projectId
  )
    throw new Error("新会话创建结果未确认，请核对会话列表。");
  return data.startThread;
}
export async function setThreadGoal(
  url: string,
  threadId: string,
  objective: string,
  tokenBudget: number | undefined,
  signal: AbortSignal,
) {
  const data = await postGraphql<{
    setGoal: { objective: string; status: string; tokenBudget: number | null } | null;
  }>(
    url,
    "mutation NativeSetGoal($input: SetGoalInput!) { setGoal(input: $input) { objective status tokenBudget } }",
    { input: { threadId, objective, ...(tokenBudget === undefined ? {} : { tokenBudget }) } },
    signal,
  );
  if (!data.setGoal || data.setGoal.objective !== objective)
    throw new Error("目标设置结果未确认。");
  return data.setGoal;
}
export async function compactThread(url: string, threadId: string, signal: AbortSignal) {
  const data = await postGraphql<{ compactThread: boolean }>(
    url,
    "mutation NativeCompactThread($input: CompactThreadInput!) { compactThread(input: $input) }",
    { input: { threadId } },
    signal,
  );
  if (data.compactThread !== true) throw new Error("压缩结果未确认，请核对会话。");
}
export async function releaseWaiting(
  url: string,
  threadId: string,
  waitingId: string | undefined,
  signal: AbortSignal,
) {
  const data = await postGraphql<Record<string, boolean>>(
    url,
    waitingId
      ? "mutation NativeReleaseWaiting($input: ReleaseWaitingInput!) { releaseWaiting(input: $input) }"
      : "mutation NativeReleaseWaitingBatch($input: ReleaseWaitingBatchInput!) { releaseWaitingBatch(input: $input) }",
    { input: { threadId, ...(waitingId ? { waitingId } : {}) } },
    signal,
  );
  if (!(waitingId ? data.releaseWaiting : data.releaseWaitingBatch))
    throw new Error("待处理消息插入结果未确认，请核对会话。");
}
