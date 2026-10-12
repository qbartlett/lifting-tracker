import { createLocalStorageRepository } from './localStorageRepository';

/** App-wide repository. Swap this one line when a remote backend exists. */
export const repository = createLocalStorageRepository();
export type { AppRepository, AppSeed } from './repository';
