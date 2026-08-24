import Panel from '@/Panel.vue';
import { App } from 'vue';

const app = createApp(Panel);

const pinia = createPinia();
app.use(pinia);

declare module 'vue' {
  interface ComponentCustomProperties {
    t: typeof t;
  }
}

const i18n = {
  install: (installedApp: App) => {
    installedApp.config.globalProperties.t = t;
  },
};
app.use(i18n);

export function initPanel() {
  if (document.getElementById('st_depth_relocator')) return;
  const root = $('<div id="st_depth_relocator">').appendTo('#extensions_settings2');
  app.mount(root[0]);
}
