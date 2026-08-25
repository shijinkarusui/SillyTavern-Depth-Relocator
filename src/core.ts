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

/** Insert an item according to prompt order without treating it as a runtime array index. */
export function insertByPromptOrder<T>(
  collection: T[],
  targetIndex: number,
  getPromptIndex: (item: T) => number | null,
  item: T,
): void {
  let lastKnownIndex = -1;
  let firstUnknownIndex = -1;
  let insertionIndex = collection.length;

  for (let index = 0; index < collection.length; index++) {
    const promptIndex = getPromptIndex(collection[index]);
    if (promptIndex === null) {
      if (firstUnknownIndex < 0) firstUnknownIndex = index;
      continue;
    }
    if (promptIndex > targetIndex) {
      insertionIndex = index;
      break;
    }
    lastKnownIndex = index;
  }

  if (insertionIndex === collection.length) {
    insertionIndex =
      lastKnownIndex >= 0 ? lastKnownIndex + 1 : firstUnknownIndex >= 0 ? firstUnknownIndex : collection.length;
  }
  collection.splice(insertionIndex, 0, item);
}

/** Preserve an event-owned array reference while replacing its contents. */
export function replaceArrayContents<T>(target: T[], source: readonly T[]): void {
  target.splice(0, target.length, ...source);
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
