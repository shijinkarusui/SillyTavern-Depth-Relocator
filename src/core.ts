export type RangeMode = 'le' | 'ge' | 'all';

export interface DepthRelocatorConfig {
  version: 1;
  enabled: boolean;
  rangeMode: RangeMode;
  rangeDepth: number;
  splitDepth: number;
}

export interface DepthCandidate {
  depth: number;
  role: string;
  content: string;
  identifier?: string;
}

export const DEFAULT_CONFIG: DepthRelocatorConfig = {
  version: 1,
  enabled: false,
  rangeMode: 'le',
  rangeDepth: 5,
  splitDepth: 5,
};

export function parseConfig(value: unknown): DepthRelocatorConfig | null {
  if (!value || typeof value !== 'object') return null;
  const candidate = value as Partial<DepthRelocatorConfig>;
  const rangeMode = candidate.rangeMode;
  const rangeDepth = candidate.rangeDepth;
  const splitDepth = candidate.splitDepth;
  if (rangeMode !== 'le' && rangeMode !== 'ge' && rangeMode !== 'all') return null;
  if (typeof candidate.enabled !== 'boolean') return null;
  if (typeof rangeDepth !== 'number' || !Number.isInteger(rangeDepth) || rangeDepth < 0) return null;
  if (typeof splitDepth !== 'number' || !Number.isInteger(splitDepth) || splitDepth < 0) return null;

  return {
    version: 1,
    enabled: candidate.enabled,
    rangeMode,
    rangeDepth,
    splitDepth,
  };
}

export function depthMatches(depth: number, config: DepthRelocatorConfig): boolean {
  if (config.rangeMode === 'all') return true;
  if (config.rangeMode === 'le') return depth <= config.rangeDepth;
  return depth >= config.rangeDepth;
}

/**
 * SillyTavern assigns chat history identifiers after reversing the final
 * message array. Depth injections are tracked before that reverse, so their
 * identifier is the total message count minus the pre-reverse index.
 */
export function getChatHistoryIdentifier(totalMessageCount: number, preReverseIndex: number): string {
  return `chatHistory-${totalMessageCount - preReverseIndex}`;
}

/** Match Array#splice's clamped insertion index for a Depth injection. */
export function getDepthInsertionIndex(baseChatLength: number, depth: number, insertedBefore: number): number {
  return Math.min(Math.max(0, depth), Math.max(0, baseChatLength)) + Math.max(0, insertedBefore);
}

export function partitionDepthCandidates(candidates: readonly DepthCandidate[], config: DepthRelocatorConfig) {
  const before: DepthCandidate[] = [];
  const after: DepthCandidate[] = [];

  for (const candidate of candidates) {
    if (!depthMatches(candidate.depth, config)) continue;
    if (candidate.depth <= config.splitDepth) after.push(candidate);
    else before.push(candidate);
  }

  return { before, after };
}
