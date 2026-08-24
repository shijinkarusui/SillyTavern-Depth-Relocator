import { DEFAULT_CONFIG, parseConfig, type DepthRelocatorConfig } from '@/core';
import type { PresetSettings, PromptLike, PromptOrderEntry, PromptOrderList } from '@/types';

export const PLUGIN_KEY = 'st_depth_relocator';
export const BEFORE_MARKER_ID = 'stDepthRelocatorBefore';
export const AFTER_MARKER_ID = 'stDepthRelocatorAfter';
export const BEFORE_MARKER_NAME = '深度前';
export const AFTER_MARKER_NAME = '深度后';
export const CHAT_HISTORY_ID = 'chatHistory';
export const CHAT_COMPLETION_DUMMY_ID = 100001;

export interface MarkerStatus {
  before: boolean;
  after: boolean;
  chatHistory: boolean;
}

export interface EnsureMarkersResult {
  changed: boolean;
  status: MarkerStatus;
}

function markerPrompt(identifier: string, name: string): PromptLike {
  return {
    identifier,
    name,
    role: 'system',
    content: '',
    // Keep custom markers out of SillyTavern's relative prompt auto-placement.
    // The relocator owns their runtime collections and inserts them safely.
    system_prompt: true,
    injection_position: 0,
    marker: true,
  };
}

function ensurePrompt(prompts: PromptLike[], identifier: string, name: string): boolean {
  const prompt = prompts.find(item => item?.identifier === identifier);
  if (!prompt) {
    prompts.push(markerPrompt(identifier, name));
    return true;
  }

  let changed = false;
  if (prompt.name !== name) {
    prompt.name = name;
    changed = true;
  }
  if (prompt.role !== 'system') {
    prompt.role = 'system';
    changed = true;
  }
  if (prompt.content !== '') {
    prompt.content = '';
    changed = true;
  }
  if (prompt.system_prompt !== true) {
    prompt.system_prompt = true;
    changed = true;
  }
  if (prompt.injection_position !== 0) {
    prompt.injection_position = 0;
    changed = true;
  }
  if (prompt.marker !== true) {
    prompt.marker = true;
    changed = true;
  }
  return changed;
}

function getOrder(settings: PresetSettings, activeCharacterId: number | string): { list: PromptOrderList; created: boolean } | null {
  settings.prompt_order ??= [];
  const existing = settings.prompt_order.find(item => String(item.character_id) === String(activeCharacterId));
  if (existing) return { list: existing, created: false };

  const fallback: PromptOrderList = {
    character_id: activeCharacterId,
    order: (settings.prompts ?? []).map(prompt => ({ identifier: prompt.identifier ?? '', enabled: true })),
  };
  settings.prompt_order.push(fallback);
  return { list: fallback, created: true };
}

function insertAdjacent(order: PromptOrderEntry[], markerId: string, chatHistoryIndex: number, after: boolean): boolean {
  if (order.some(entry => entry.identifier === markerId)) return false;
  order.splice(after ? chatHistoryIndex + 1 : chatHistoryIndex, 0, { identifier: markerId, enabled: true });
  return true;
}

function ensureMarkerEnabled(order: PromptOrderEntry[], markerId: string): boolean {
  const entry = order.find(item => item.identifier === markerId);
  if (!entry || entry.enabled !== false) return false;
  entry.enabled = true;
  return true;
}

export function ensureMarkersInSettings(settings: PresetSettings, activeCharacterId: number | string = CHAT_COMPLETION_DUMMY_ID): EnsureMarkersResult {
  settings.prompts ??= [];
  const chatHistory = settings.prompts.some(prompt => prompt.identifier === CHAT_HISTORY_ID);
  if (!chatHistory) {
    return { changed: false, status: getMarkerStatus(settings, activeCharacterId) };
  }
  const changedBefore = ensurePrompt(settings.prompts, BEFORE_MARKER_ID, BEFORE_MARKER_NAME);
  const changedAfter = ensurePrompt(settings.prompts, AFTER_MARKER_ID, AFTER_MARKER_NAME);
  const orderResult = getOrder(settings, activeCharacterId);
  let changed = changedBefore || changedAfter || orderResult?.created === true;

  if (orderResult) {
    const order = orderResult.list.order;
    const chatHistoryIndex = order.findIndex(entry => entry.identifier === CHAT_HISTORY_ID);
    if (chatHistoryIndex >= 0) {
      changed = ensureMarkerEnabled(order, BEFORE_MARKER_ID) || changed;
      changed = ensureMarkerEnabled(order, AFTER_MARKER_ID) || changed;
      changed = insertAdjacent(order, BEFORE_MARKER_ID, chatHistoryIndex, false) || changed;
      const updatedChatHistoryIndex = order.findIndex(entry => entry.identifier === CHAT_HISTORY_ID);
      changed = insertAdjacent(order, AFTER_MARKER_ID, updatedChatHistoryIndex, true) || changed;
    }
  }

  const status = getMarkerStatus(settings, activeCharacterId);
  return { changed, status: { ...status, chatHistory } };
}

export function getMarkerStatus(settings: PresetSettings, activeCharacterId: number | string = CHAT_COMPLETION_DUMMY_ID): MarkerStatus {
  const order = settings.prompt_order?.find(item => String(item.character_id) === String(activeCharacterId))?.order ?? [];
  return {
    before: order.some(entry => entry.identifier === BEFORE_MARKER_ID),
    after: order.some(entry => entry.identifier === AFTER_MARKER_ID),
    chatHistory: order.some(entry => entry.identifier === CHAT_HISTORY_ID),
  };
}

export function getPresetConfig(settings: PresetSettings): DepthRelocatorConfig | null {
  return parseConfig(settings.extensions?.[PLUGIN_KEY]);
}

export function getDraftConfig(settings: PresetSettings): DepthRelocatorConfig {
  return getPresetConfig(settings) ?? { ...DEFAULT_CONFIG };
}
