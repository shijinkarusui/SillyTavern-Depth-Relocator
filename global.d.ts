declare const hljs: typeof import('highlight.js').default;
declare const Popper: typeof import('@popperjs/core');

declare module '*.vue' {
  import type { DefineComponent } from 'vue';
  const component: DefineComponent<Record<string, unknown>, Record<string, unknown>, unknown>;
  export default component;
}

declare module '@sillytavern/script' {
  export const eventSource: any;
  export const event_types: Record<string, string>;
  export const extension_prompt_roles: { SYSTEM: number; USER: number; ASSISTANT: number };
  export const extension_prompt_types: { NONE: number; IN_PROMPT: number; IN_CHAT: number; BEFORE_PROMPT: number };
  export const extension_prompts: Record<string, { position?: number; depth?: number; role?: number; value?: unknown }>;
  export const getExtensionPrompt: (...args: any[]) => Promise<string> | string;
  export const main_api: string;
}

declare module '@sillytavern/scripts/PromptManager' {
  export const INJECTION_POSITION: { RELATIVE: number; ABSOLUTE: number };
}

declare module '@sillytavern/scripts/openai' {
  export class Message {
    identifier: string;
    role: string;
    content: unknown;
    name?: string;
    tool_calls?: unknown;
  }
  export class MessageCollection {
    identifier: string;
    collection: Array<Message | MessageCollection | undefined>;
    constructor(identifier: string, ...items: Message[]);
    getCollection(): Array<Message | MessageCollection | undefined>;
    getItemByIdentifier(identifier: string): Message | MessageCollection | undefined;
    getChat(): Array<Record<string, unknown>>;
  }
  export const oai_settings: Record<string, unknown>;
  export const promptManager: any;
}
