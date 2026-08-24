<template>
  <div class="depth-relocator">
    <div class="inline-drawer">
      <div class="inline-drawer-toggle inline-drawer-header">
        <b>Depth 提示词重排</b>
        <div class="inline-drawer-icon fa-solid fa-circle-chevron-down down"></div>
      </div>

      <div class="inline-drawer-content">
        <div class="depth-relocator__status" :class="{ 'depth-relocator__status--warning': hasWarning }">
          <div><b>当前预设：</b>{{ panelState.presetName || '未选择' }}</div>
          <div>{{ panelState.statusMessage }}</div>
        </div>

        <div class="depth-relocator__hint">
          只处理 Chat Completion 的 Depth 注入；SillyTavern 扩展管理器的总开关仍然有效。
        </div>

        <div class="depth-relocator__row flex-container">
          <label for="st-depth-relocator-enabled">启用当前预设</label>
          <input id="st-depth-relocator-enabled" v-model="draft.enabled" type="checkbox" />
        </div>

        <div class="depth-relocator__row flex-container">
          <label for="st-depth-relocator-range-mode">拦截范围</label>
          <select id="st-depth-relocator-range-mode" v-model="draft.rangeMode" class="text_pole">
            <option value="le">D ≤ N</option>
            <option value="ge">D ≥ N</option>
            <option value="all">全部 Depth</option>
          </select>
        </div>

        <div v-if="draft.rangeMode !== 'all'" class="depth-relocator__row flex-container">
          <label for="st-depth-relocator-range-depth">范围 N</label>
          <input id="st-depth-relocator-range-depth" v-model.number="draft.rangeDepth" class="text_pole" min="0" type="number" />
        </div>

        <div class="depth-relocator__row flex-container">
          <label for="st-depth-relocator-split-depth">分割深度</label>
          <input id="st-depth-relocator-split-depth" v-model.number="draft.splitDepth" class="text_pole" min="0" type="number" />
        </div>

        <div class="depth-relocator__row flex-container">
          <input class="menu_button" type="button" value="保存当前预设" :disabled="!panelState.presetName" @click="save" />
          <input class="menu_button" type="button" value="修复 Maker" :disabled="!panelState.presetName" @click="repair" />
        </div>

        <div class="depth-relocator__status">
          <div>深度前 Maker：{{ panelState.markers.before ? '已存在' : '缺失' }}</div>
          <div>深度后 Maker：{{ panelState.markers.after ? '已存在' : '缺失' }}</div>
          <div>Chat History：{{ panelState.markers.chatHistory ? '已存在' : '缺失' }}</div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, reactive, watch } from 'vue';
import { DEFAULT_CONFIG, type DepthRelocatorConfig } from '@/core';
import { panelState, repairMarkers, saveConfig } from '@/depth-relocator';

const draft = reactive<DepthRelocatorConfig>({ ...DEFAULT_CONFIG });

watch(
  () => panelState.config,
  config => Object.assign(draft, config ?? DEFAULT_CONFIG),
  { immediate: true },
);

const hasWarning = computed(() => !panelState.apiSupported || !panelState.configured || panelState.statusMessage.includes('缺少') || panelState.squashSystemMessages);

async function save(): Promise<void> {
  if (!panelState.presetName) {
    toastr.warning('请先选择 Chat Completion 预设。');
    return;
  }
  await saveConfig({ ...draft });
  toastr.success('Depth 重排配置已保存到当前预设。');
}

async function repair(): Promise<void> {
  await repairMarkers();
  toastr.success('Maker 检查完成。');
}
</script>
