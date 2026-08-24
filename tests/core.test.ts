import { describe, expect, it } from 'vitest';
import { DEFAULT_CONFIG, getChatHistoryIdentifier, getDepthInsertionIndex, partitionDepthCandidates, type DepthCandidate } from '@/core';

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
