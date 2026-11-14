import { query } from "./client";
import { OperationError, postGraphql } from "./session";

export interface SettingsModel {
  id: string;
  slug: string;
  name: string;
  provider: { name: string };
}
export interface RuntimeSettings {
  modelRetries: number;
  maxDepth: number;
  maxChildren: number;
  idleMinutes: number;
}
export interface ServerPreferences {
  listModels: SettingsModel[];
  modelAliases: { name: string; label: string }[];
  defaultModelSetting: { name: string; kind: string; slug: string | null };
  agentSettings: RuntimeSettings;
}
export async function settingsModels(url: string, signal: AbortSignal) {
  const data = await query<{ listModels: SettingsModel[] }>(
    url,
    "query NativeSettingsModels { listModels { id slug name provider { name } } }",
    {},
    signal,
  );
  if (!Array.isArray(data.listModels)) throw new Error("模型目录格式不兼容。");
  return data.listModels;
}
export async function serverPreferences(url: string, signal: AbortSignal) {
  const data = await query<ServerPreferences>(
    url,
    `query NativeServerPreferences {
      listModels { id slug name provider { name } }
      modelAliases { name label }
      defaultModelSetting { name kind slug }
      agentSettings { modelRetries maxDepth maxChildren idleMinutes }
    }`,
    {},
    signal,
  );
  if (
    !Array.isArray(data.listModels) ||
    !Array.isArray(data.modelAliases) ||
    !data.defaultModelSetting ||
    !data.agentSettings
  )
    throw new Error("服务器设置格式不兼容。");
  return data;
}
export async function saveDefaultModel(url: string, name: string, signal: AbortSignal) {
  const data = await postGraphql<{ setDefaultModel: { name: string } }>(
    url,
    "mutation NativeSetDefaultModel($input: SetDefaultModelInput!) { setDefaultModel(input: $input) { name kind slug } }",
    { input: { name } },
    signal,
  );
  if (data.setDefaultModel?.name !== name)
    throw new OperationError("默认模型未确认，请重新读取核对。");
}
export async function saveRuntime(
  url: string,
  input: Partial<RuntimeSettings>,
  signal: AbortSignal,
) {
  const data = await postGraphql<{ setAgentSettings: RuntimeSettings }>(
    url,
    "mutation NativeSetRuntime($input: SetAgentSettingsInput) { setAgentSettings(input: $input) { modelRetries maxDepth maxChildren idleMinutes } }",
    { input },
    signal,
  );
  if (
    !data.setAgentSettings ||
    Object.entries(input).some(
      ([key, value]) => data.setAgentSettings[key as keyof RuntimeSettings] !== value,
    )
  )
    throw new OperationError("运行设置未确认，请重新读取核对。");
  return data.setAgentSettings;
}
