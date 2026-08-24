import { describe, expect, it } from 'vitest';
import { ensureMarkersInSettings, getMarkerStatus } from '@/preset';

function settings() {
  return {
    prompts: [
      { identifier: 'main', name: 'Main', marker: true },
      { identifier: 'chatHistory', name: 'Chat History', marker: true },
    ],
    prompt_order: [
      {
        character_id: 100001,
        order: [
          { identifier: 'main', enabled: true },
          { identifier: 'chatHistory', enabled: true },
        ],
      },
    ],
  };
}

describe('Maker bootstrap', () => {
  it('inserts both markers around chatHistory', () => {
    const preset = settings();
    const result = ensureMarkersInSettings(preset);
    const order = preset.prompt_order[0].order.map(item => item.identifier);

    expect(result.changed).toBe(true);
    expect(order).toEqual(['main', 'stDepthRelocatorBefore', 'chatHistory', 'stDepthRelocatorAfter']);
    expect(result.status).toEqual({ before: true, after: true, chatHistory: true });
  });

  it('is idempotent and does not move existing markers', () => {
    const preset = settings();
    ensureMarkersInSettings(preset);
    const order = preset.prompt_order[0].order;
    order.push(order.splice(1, 1)[0]);
    const before = order.map(item => item.identifier);
    const result = ensureMarkersInSettings(preset);

    expect(result.changed).toBe(false);
    expect(order.map(item => item.identifier)).toEqual(before);
  });

  it('does not modify a preset without chatHistory', () => {
    const preset = { prompts: [{ identifier: 'main' }], prompt_order: [] };
    const result = ensureMarkersInSettings(preset);

    expect(result.changed).toBe(false);
    expect(getMarkerStatus(preset)).toEqual({ before: false, after: false, chatHistory: false });
  });
});
