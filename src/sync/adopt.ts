import type { SyncMeta } from './engine';
import type { Snapshot } from './docs';

export type Adoption = 'continue' | 'ask-upload' | 'wipe-and-continue';

export function hasLocalData(s: Snapshot): boolean {
  return (
    s.history.length > 0 ||
    s.routines.length > 0 ||
    s.exercises.some((e) => e.isCustom) ||
    Object.keys(s.progression).length > 0
  );
}

/**
 * What to do with the data already on this device when `userId` signs in.
 * - Same account as last time: carry on.
 * - Device belonged to a different account: wipe it (that data lives on its own account's server)
 *   so it can never leak into the new account.
 * - Device has data but never synced: the person decides whether to upload it.
 */
export function decideAdoption(meta: SyncMeta, userId: string, localHasData: boolean): Adoption {
  if (meta.userId === userId) return 'continue';
  if (meta.userId !== null) return 'wipe-and-continue';
  return localHasData ? 'ask-upload' : 'continue';
}
