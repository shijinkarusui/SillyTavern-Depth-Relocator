import { DEFAULT_CONFIG, type DepthRelocatorConfig } from '@/core';

export const useSettingsStore = defineStore('depth-relocator-settings', () => {
  const settings = reactive<DepthRelocatorConfig>({ ...DEFAULT_CONFIG });

  return { settings };
});
