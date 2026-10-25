import { createLocalStorageRepository } from './localStorageRepository';
import { DEFAULT_SEED, EMPTY_SEED } from './seeds';

/**
 * New installs start empty. Set VITE_DEMO_SEED=1 to start from the bundled sample log instead.
 * (Data already stored on a device always wins over the seed.)
 */
const useDemo = (import.meta as any).env?.VITE_DEMO_SEED === '1';

/** App-wide repository. */
export const repository = createLocalStorageRepository(undefined, useDemo ? DEFAULT_SEED : EMPTY_SEED);
export type { AppRepository, AppSeed } from './repository';
