/* eslint-disable import-x/no-unresolved */
import { reactive } from 'vue';
import {
  DEFAULT_CONFIG,
  getChatHistoryIdentifier,
  getDepthInsertionIndex,
  insertByPromptOrder,
  parseConfig,
  partitionDepthCandidates,
  replaceArrayContents,
  type DepthCandidate,
  type DepthRelocatorConfig,
} from '@/core';
import {
  AFTER_MARKER_ID,
  BEFORE_MARKER_ID,
  CHAT_COMPLETION_DUMMY_ID,
  CHAT_HISTORY_ID,
  ensureMarkersInSettings,
  getMarkerStatus,
  getPresetConfig,
  PLUGIN_KEY,
  type MarkerStatus,
} from '@/preset';
import type {
  GenerationContext,
  PanelState,
  PresetChangedBeforeEvent,
  PresetSettings,
  PromptLike,
  PromptReadyEvent,
} from '@/types';
import {
  eventSource,
  event_types,
  extension_prompt_roles,
  extension_prompt_types,
  extension_prompts,
  getExtensionPrompt,
  main_api,
} from '@sillytavern/script';
import { INJECTION_POSITION } from '@sillytavern/scripts/PromptManager';
import { Message, MessageCollection, oai_settings, promptManager } from '@sillytavern/scripts/openai';

const ROLE_ORDER = ['system', 'user', 'assistant'] as const;
const EXTENSION_ORDER = 100;

export const panelState = reactive<PanelState>({
  presetName: '',
  configured: false,
  apiSupported: false,
  squashSystemMessages: false,
  markers: { before: false, after: false, chatHistory: false },
  config: null,
  statusMessage: '正在等待 Chat Completion 设置加载…',
});

let generationContext: GenerationContext | null = null;
let lastWarning = '';

function currentSettings(): PresetSettings {
  return oai_settings as unknown as PresetSettings;
}

function activeCharacterId(): number | string {
  return (promptManager as unknown as { activeCharacter?: { id?: number | string } } | null)?.activeCharacter?.id ?? CHAT_COMPLETION_DUMMY_ID;
}

function warnOnce(message: string): void {
  if (lastWarning === message) return;
  lastWarning = message;
  toastr.warning(message, 'Depth 提示词重排');
}

function resetWarning(): void {
  lastWarning = '';
}

function textContent(value: unknown): string {
  if (typeof value === 'string') return value;
  if (Array.isArray(value)) return value.map(item => String(item)).join('');
  return value == null ? '' : String(value);
}

function extensionDepths(): number[] {
  const depths = new Set<number>();
  for (const value of Object.values(extension_prompts as Record<string, { position?: number; depth?: number; value?: unknown }>)) {
    if (value?.position !== extension_prompt_types.IN_CHAT) continue;
    if (!Number.isInteger(value.depth) || (value.depth ?? -1) < 0) continue;
    depths.add(value.depth as number);
  }
  return [...depths];
}

function promptDepths(prompts: PromptLike[]): number[] {
  return prompts
    .filter(prompt => prompt.injection_position === INJECTION_POSITION.ABSOLUTE)
    .map(prompt => prompt.injection_depth)
    .filter((depth): depth is number => typeof depth === 'number' && Number.isInteger(depth) && depth >= 0);
}

function roleNumber(role: string): number {
  if (role === 'user') return extension_prompt_roles.USER;
  if (role === 'assistant') return extension_prompt_roles.ASSISTANT;
  return extension_prompt_roles.SYSTEM;
}

async function buildDepthCandidates(promptCollection: { collection: PromptLike[] }, baseChatLength: number): Promise<DepthCandidate[]> {
  const prompts = promptCollection.collection;
  const depths = [...new Set([...promptDepths(prompts), ...extensionDepths()])].sort((a, b) => a - b);
  const pendingCandidates: Array<DepthCandidate & { preReverseIndex: number }> = [];
  let totalInsertedMessages = 0;

  for (const depth of depths) {
    const depthPrompts = prompts.filter(
      prompt => prompt.injection_position === INJECTION_POSITION.ABSOLUTE && prompt.injection_depth === depth && textContent(prompt.content),
    );
    const orderGroups = new Map<number, PromptLike[]>();
    orderGroups.set(EXTENSION_ORDER, []);
    for (const prompt of depthPrompts) {
      const order = Number.isFinite(prompt.injection_order) ? (prompt.injection_order as number) : EXTENSION_ORDER;
      const group = orderGroups.get(order) ?? [];
      group.push(prompt);
      orderGroups.set(order, group);
    }

    const orders = [...orderGroups.keys()].sort((a, b) => b - a);
    const roleMessages: Array<{ role: string; content: string }> = [];
    for (const order of orders) {
      const orderPrompts = orderGroups.get(order) ?? [];
      for (const role of ROLE_ORDER) {
        const rolePrompts = orderPrompts
          .filter(prompt => prompt.role === role)
          .map(prompt => textContent(prompt.content))
          .join('\n');
        const extensionPrompt = order === EXTENSION_ORDER
          ? await getExtensionPrompt(extension_prompt_types.IN_CHAT, depth, '\n', roleNumber(role), false)
          : '';
        const jointPrompt = [rolePrompts, textContent(extensionPrompt)]
          .filter(Boolean)
          .map(value => value.trim())
          .join('\n');
        if (jointPrompt) roleMessages.push({ role, content: jointPrompt });
      }
    }

    // Array#splice clamps an insertion point past the end to the current
    // array length. This matters when D is larger than the available history.
    const insertionIndex = getDepthInsertionIndex(baseChatLength, depth, totalInsertedMessages);
    roleMessages.forEach((message, index) => {
      pendingCandidates.push({
        depth,
        role: message.role,
        content: message.content,
        preReverseIndex: insertionIndex + index,
      });
    });
    totalInsertedMessages += roleMessages.length;
  }

  const totalMessageCount = Math.max(0, baseChatLength) + totalInsertedMessages;
  return pendingCandidates.map(({ preReverseIndex, ...candidate }) => ({
    ...candidate,
    identifier: getChatHistoryIdentifier(totalMessageCount, preReverseIndex),
  }));
}

function getRootMessages(): MessageCollection | null {
  const manager = promptManager as unknown as { messages?: MessageCollection } | null;
  return manager?.messages instanceof MessageCollection ? manager.messages : null;
}

function sameContent(message: Message, candidate: DepthCandidate): boolean {
  return message.role === candidate.role && textContent(message.content) === candidate.content;
}

function runtimePromptIndex(item: Message | MessageCollection, promptCollection: { index(identifier: string): number }): number | null {
  const index = promptCollection.index(item.identifier);
  return index >= 0 ? index : null;
}

function replaceRuntimeMarkers(
  root: MessageCollection,
  promptCollection: { index(identifier: string): number },
  beforeMessages: Message[],
  afterMessages: Message[],
): void {
  const markerIdentifiers = new Set([BEFORE_MARKER_ID, AFTER_MARKER_ID]);
  const rootCollection = root.getCollection().filter(
    (item): item is Message | MessageCollection => item !== undefined
      && !(item instanceof MessageCollection && markerIdentifiers.has(item.identifier)),
  );
  const getPromptIndex = (item: Message | MessageCollection): number | null => runtimePromptIndex(item, promptCollection);

  insertByPromptOrder(
    rootCollection,
    promptCollection.index(BEFORE_MARKER_ID),
    getPromptIndex,
    new MessageCollection(BEFORE_MARKER_ID, ...beforeMessages),
  );
  insertByPromptOrder(
    rootCollection,
    promptCollection.index(AFTER_MARKER_ID),
    getPromptIndex,
    new MessageCollection(AFTER_MARKER_ID, ...afterMessages),
  );
  root.collection = rootCollection;
}

function flattenRoot(root: MessageCollection): Array<Record<string, unknown>> {
  const result: Array<Record<string, unknown>> = [];
  for (const item of root.getCollection()) {
    if (item instanceof MessageCollection) {
      result.push(...item.getChat() as Array<Record<string, unknown>>);
    } else if (item instanceof Message && (item.content || item.tool_calls)) {
      result.push({
        role: item.role,
        content: item.content,
        ...(item.name ? { name: item.name } : {}),
        ...(item.tool_calls ? { tool_calls: item.tool_calls } : {}),
        ...(item.role === 'tool' ? { tool_call_id: item.identifier } : {}),
      });
    }
  }
  return result;
}

async function rewriteReadyPrompt(event: PromptReadyEvent): Promise<void> {
  if (event.dryRun || main_api !== 'openai') return;
  const capturedContext = generationContext;
  generationContext = null;
  const settings = currentSettings();
  const config = getPresetConfig(settings);
  if (!config?.enabled) return;
  if (settings.squash_system_messages) {
    warnOnce('当前预设启用了“合并连续系统消息”，Depth 边界已不可安全识别，本次不重排。');
    return;
  }

  const root = getRootMessages();
  const chatHistory = root?.getItemByIdentifier(CHAT_HISTORY_ID);
  const runtimeChatLength = chatHistory instanceof MessageCollection
    ? chatHistory.getCollection().filter(item => item instanceof Message).length
    : event.chat.length;
  const context = capturedContext && capturedContext.chatLength > 0
    ? capturedContext
    : {
      type: capturedContext?.type || 'normal',
      chatLength: runtimeChatLength,
    };
  const promptCollection = promptManager?.getPromptCollection(context.type);
  if (!root || !promptCollection) {
    warnOnce('无法取得当前 Chat Completion 的内部提示词结构，本次不重排。');
    return;
  }

  if (!(chatHistory instanceof MessageCollection)) {
    warnOnce('当前提示词中没有可识别的 chatHistory Maker，本次不重排。');
    return;
  }
  const beforeIndex = promptCollection.index(BEFORE_MARKER_ID);
  const afterIndex = promptCollection.index(AFTER_MARKER_ID);
  if (beforeIndex < 0 || afterIndex < 0) {
    warnOnce('当前预设缺少“深度前”或“深度后”Maker，请在扩展面板中修复。');
    return;
  }

  const continuePrefill = context.type === 'continue'
    && Boolean((oai_settings as unknown as { continue_prefill?: boolean }).continue_prefill);
  const baseChatLength = Math.max(0, context.chatLength - (continuePrefill ? 1 : 0));
  const candidates = await buildDepthCandidates(promptCollection, baseChatLength);
  const partition = partitionDepthCandidates(candidates, config);
  const chatHistoryMessages = chatHistory.getCollection().filter(item => item instanceof Message) as Message[];
  const byIdentifier = new Map(chatHistoryMessages.map(message => [message.identifier, message]));
  const usedMessages = new Set<Message>();
  const findCandidateMessage = (candidate: DepthCandidate): Message | undefined => {
    const identified = candidate.identifier ? byIdentifier.get(candidate.identifier) : undefined;
    if (identified && !usedMessages.has(identified) && sameContent(identified, candidate)) return identified;
    return chatHistoryMessages.find(message => !usedMessages.has(message) && sameContent(message, candidate));
  };
  const selected = [...partition.before, ...partition.after];

  for (const candidate of selected) {
    const message = findCandidateMessage(candidate);
    if (!message) {
      warnOnce('Depth 消息定位结果缺少对应的 chatHistory 消息，本次保持原提示词不变。');
      return;
    }
    usedMessages.add(message);
  }

  usedMessages.clear();
  const beforeMessages = partition.before
    .map(candidate => findCandidateMessage(candidate))
    .filter((message): message is Message => message !== undefined);
  const afterMessages = partition.after
    .map(candidate => findCandidateMessage(candidate))
    .filter((message): message is Message => message !== undefined);
  if (beforeMessages.length === 0 && afterMessages.length === 0) return;

  const movedIds = new Set([...beforeMessages, ...afterMessages].map(message => message.identifier));
  chatHistory.collection = chatHistory.getCollection().filter(item => !(item instanceof Message && movedIds.has(item.identifier)));

  replaceRuntimeMarkers(root, promptCollection, beforeMessages, afterMessages);
  replaceArrayContents(event.chat, flattenRoot(root));
  resetWarning();
}

function currentMarkerStatus(): MarkerStatus {
  return getMarkerStatus(currentSettings(), activeCharacterId());
}

export function refreshPanelState(): void {
  const settings = currentSettings();
  const config = getPresetConfig(settings);
  const markers = currentMarkerStatus();
  const apiSupported = main_api === 'openai';
  let statusMessage = '';

  if (!apiSupported) statusMessage = '当前 API 不是 Chat Completion，插件不会生效。';
  else if (!settings.preset_settings_openai) statusMessage = '当前没有选中的 Chat Completion 预设。';
  else if (!config) statusMessage = '当前预设尚未配置，插件不会生效。';
  else if (!markers.chatHistory || !markers.before || !markers.after) statusMessage = '当前预设缺少 Maker，请点击“修复 Maker”。';
  else if (settings.squash_system_messages) statusMessage = '当前预设启用了系统消息合并，重排会自动跳过。';
  else statusMessage = config.enabled ? '插件已启用。' : '插件已配置但处于关闭状态。';

  Object.assign(panelState, {
    presetName: String(settings.preset_settings_openai ?? ''),
    configured: config !== null,
    apiSupported,
    squashSystemMessages: settings.squash_system_messages === true,
    markers,
    config,
    statusMessage,
  });
}

async function saveCurrentPreset(): Promise<void> {
  const button = document.querySelector('#update_oai_preset');
  if (button instanceof HTMLElement) {
    $(button).trigger('click');
    return;
  }
  await promptManager?.saveServiceSettings?.();
}

export async function saveConfig(config: DepthRelocatorConfig): Promise<void> {
  const settings = currentSettings();
  const normalizedRangeDepth = Number.isFinite(Number(config.rangeDepth)) ? Math.max(0, Math.trunc(Number(config.rangeDepth))) : DEFAULT_CONFIG.rangeDepth;
  const normalizedSplitDepth = Number.isFinite(Number(config.splitDepth)) ? Math.max(0, Math.trunc(Number(config.splitDepth))) : DEFAULT_CONFIG.splitDepth;
  settings.extensions ??= {};
  settings.extensions[PLUGIN_KEY] = {
    version: 1,
    enabled: config.enabled,
    rangeMode: config.rangeMode,
    rangeDepth: normalizedRangeDepth,
    splitDepth: normalizedSplitDepth,
  } satisfies DepthRelocatorConfig;
  ensureMarkersInSettings(settings, activeCharacterId());
  await saveCurrentPreset();
  refreshPanelState();
}

export async function repairMarkers(): Promise<void> {
  const settings = currentSettings();
  const result = ensureMarkersInSettings(settings, activeCharacterId());
  if (result.changed) await saveCurrentPreset();
  refreshPanelState();
}

async function bootstrapCurrentPreset(): Promise<void> {
  const settings = currentSettings();
  if (!settings.prompts?.some(prompt => prompt.identifier === CHAT_HISTORY_ID)) {
    refreshPanelState();
    return;
  }
  const result = ensureMarkersInSettings(settings, activeCharacterId());
  if (result.changed) await saveCurrentPreset();
  promptManager?.render(false);
  refreshPanelState();
}

async function onPresetChangedBefore(event: PresetChangedBeforeEvent): Promise<void> {
  const result = ensureMarkersInSettings(event.preset, activeCharacterId());
  if (result.changed) await event.savePreset?.(event.presetName, event.preset, false);
}

function captureGeneration(chat: unknown, _contextSize: unknown, _abort: unknown, type: unknown): void {
  generationContext = {
    type: String(type || 'normal'),
    chatLength: Array.isArray(chat) ? chat.length : 0,
  };
}

export function initDepthRelocator(): void {
  const interceptorKey = 'stDepthRelocatorGenerateInterceptor';
  (globalThis as Record<string, unknown>)[interceptorKey] = captureGeneration;
  // SillyTavern resolves generate_interceptor callbacks from the page window.
  // Explicitly bridge the module realm so third-party module loading cannot hide the callback.
  if (typeof window !== 'undefined') {
    (window as unknown as Record<string, unknown>)[interceptorKey] = captureGeneration;
  }
  eventSource.on(event_types.SETTINGS_LOADED, () => void bootstrapCurrentPreset());
  eventSource.on(event_types.OAI_PRESET_CHANGED_BEFORE, (event: unknown) => void onPresetChangedBefore(event as PresetChangedBeforeEvent));
  eventSource.on(event_types.OAI_PRESET_CHANGED_AFTER, () => {
    generationContext = null;
    refreshPanelState();
  });
  eventSource.on(event_types.GENERATION_STARTED, (type: unknown, _params: unknown, dryRun: unknown) => {
    if (dryRun) {
      generationContext = null;
      return;
    }
    generationContext = { type: String(type || 'normal'), chatLength: 0 };
  });
  eventSource.on(event_types.CHAT_COMPLETION_PROMPT_READY, (event: unknown) => void rewriteReadyPrompt(event as PromptReadyEvent));
  eventSource.on(event_types.GENERATION_STOPPED, () => {
    generationContext = null;
  });
  eventSource.on(event_types.GENERATION_ENDED, () => {
    generationContext = null;
  });
  setTimeout(() => void bootstrapCurrentPreset(), 0);
  refreshPanelState();
}

export function getCurrentDraftConfig(): DepthRelocatorConfig {
  return parseConfig(panelState.config) ?? { ...DEFAULT_CONFIG };
}
