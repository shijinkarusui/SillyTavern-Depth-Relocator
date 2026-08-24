import type { DepthRelocatorConfig } from '@/core';

export interface PromptLike {
  identifier?: string;
  name?: string;
  role?: string;
  content?: unknown;
  system_prompt?: boolean;
  marker?: boolean;
  injection_position?: number;
  injection_depth?: number;
  injection_order?: number;
}

export interface PromptOrderEntry {
  identifier: string;
  enabled?: boolean;
  [key: string]: unknown;
}

export interface PromptOrderList {
  character_id: number | string;
  order: PromptOrderEntry[];
  [key: string]: unknown;
}

export interface PresetSettings {
  prompts?: PromptLike[];
  prompt_order?: PromptOrderList[];
  extensions?: Record<string, unknown>;
  preset_settings_openai?: string | null;
  squash_system_messages?: boolean;
  [key: string]: unknown;
}

export interface PromptReadyEvent {
  chat: Array<Record<string, unknown>>;
  dryRun?: boolean;
}

export interface PresetChangedBeforeEvent {
  preset: PresetSettings;
  presetName: string;
  savePreset?: (name: string, settings: PresetSettings, triggerUi?: boolean) => Promise<void>;
}

export interface GenerationContext {
  type: string;
  chatLength: number;
}

export interface PanelState {
  presetName: string;
  configured: boolean;
  apiSupported: boolean;
  squashSystemMessages: boolean;
  markers: {
    before: boolean;
    after: boolean;
    chatHistory: boolean;
  };
  config: DepthRelocatorConfig | null;
  statusMessage: string;
}
