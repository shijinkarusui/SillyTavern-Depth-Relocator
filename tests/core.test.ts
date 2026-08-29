import { describe, expect, it } from 'vitest';
import {
  DEFAULT_CONFIG,
  getChatHistoryIdentifier,
  getDepthInsertionIndex,
  insertByPromptOrder,
  matchDepthCandidates,
  partitionDepthCandidates,
  replaceArrayContents,
  type DepthCandidate,
} from '@/core';

const candidates: DepthCandidate[] = Array.from({ length: 100 }, (_, depth) => ({
  depth,
  role: 'system',
  content: `D${depth}`,
}));

describe('Depth selection and partitioning', () => {
  it('matches SillyTavern chatHistory-N identifiers', () => {
    expect(getChatHistoryIdentifier(5, 0)).toBe('chatHistory-5');
    expect(getChatHistoryIdentifier(5, 4)).toBe('chatHistory-1');
  });

  it('clamps depths past the available history like Array#splice', () => {
    expect(getDepthInsertionIndex(3, 99, 0)).toBe(3);
    expect(getDepthInsertionIndex(3, 99, 2)).toBe(5);
  });

  it('inserts runtime markers without overwriting neighboring items', () => {
    const order = new Map([
      ['main', 0],
      ['stDepthRelocatorBefore', 1],
      ['chatHistory', 2],
      ['stDepthRelocatorAfter', 3],
    ]);
    const collection: Array<{ identifier: string } | undefined> = [
      { identifier: 'main' },
      { identifier: 'chatHistory' },
      { identifier: 'controlPrompts' },
    ];
    const getPromptIndex = (item: { identifier: string } | undefined): number | null => order.get(item?.identifier ?? '') ?? null;

    insertByPromptOrder(collection, 1, getPromptIndex, { identifier: 'stDepthRelocatorBefore' });
    insertByPromptOrder(collection, 3, getPromptIndex, { identifier: 'stDepthRelocatorAfter' });

    expect(collection.map(item => item?.identifier)).toEqual([
      'main',
      'stDepthRelocatorBefore',
      'chatHistory',
      'stDepthRelocatorAfter',
      'controlPrompts',
    ]);
  });

  it('replaces event arrays in place', () => {
    const target = ['old'];
    const reference = target;

    replaceArrayContents(target, ['new', 'value']);

    expect(target).toEqual(['new', 'value']);
    expect(reference).toBe(target);
  });

  it('routes D0-D5 to the after bucket and leaves other depths unselected', () => {
    const result = partitionDepthCandidates(candidates, {
      ...DEFAULT_CONFIG,
      enabled: true,
      rangeMode: 'le',
      rangeDepth: 5,
      splitDepth: 5,
    });

    expect(result.after.map(item => item.depth)).toEqual([0, 1, 2, 3, 4, 5]);
    expect(result.before).toEqual([]);
  });

  it('routes D30-D50 after and D51+ before in D>=30 mode', () => {
    const result = partitionDepthCandidates(candidates, {
      ...DEFAULT_CONFIG,
      enabled: true,
      rangeMode: 'ge',
      rangeDepth: 30,
      splitDepth: 50,
    });

    expect(result.after.map(item => item.depth)).toEqual(Array.from({ length: 21 }, (_, index) => index + 30));
    expect(result.before.map(item => item.depth)).toEqual(Array.from({ length: 49 }, (_, index) => index + 51));
  });

  it('preserves the original order for equal-depth entries', () => {
    const equalDepth = [
      { depth: 4, role: 'system', content: 'first' },
      { depth: 4, role: 'user', content: 'second' },
      { depth: 4, role: 'assistant', content: 'third' },
    ];
    const result = partitionDepthCandidates(equalDepth, {
      ...DEFAULT_CONFIG,
      enabled: true,
      rangeMode: 'all',
      splitDepth: 4,
    });

    expect(result.after.map(item => item.content)).toEqual(['first', 'second', 'third']);
  });

  it('keeps matching candidates when another Depth message was omitted at runtime', () => {
    const selected = [
      { depth: 1, role: 'system', content: 'kept', identifier: 'chatHistory-3' },
      { depth: 2, role: 'system', content: 'omitted', identifier: 'chatHistory-2' },
    ];
    const messages = [{ identifier: 'chatHistory-3', role: 'system', content: 'kept' }];

    const matches = matchDepthCandidates(selected, messages);

    expect(matches.get(selected[0])).toBe(messages[0]);
    expect(matches.has(selected[1])).toBe(false);
  });

  it('does not match a candidate to a message with the same identifier but different content', () => {
    const selected = [{ depth: 1, role: 'system', content: 'expected', identifier: 'chatHistory-3' }];
    const messages = [{ identifier: 'chatHistory-3', role: 'system', content: 'changed' }];

    expect(matchDepthCandidates(selected, messages).size).toBe(0);
  });

  it('supports selecting every Depth', () => {
    const result = partitionDepthCandidates(candidates, {
      ...DEFAULT_CONFIG,
      enabled: true,
      rangeMode: 'all',
      splitDepth: 5,
    });

    expect(result.after.map(item => item.depth)).toEqual([0, 1, 2, 3, 4, 5]);
    expect(result.before.map(item => item.depth)).toEqual(Array.from({ length: 94 }, (_, index) => index + 6));
  });
});
