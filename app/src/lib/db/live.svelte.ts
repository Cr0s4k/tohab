import type { Db } from './index.ts';

/**
 * Reactive database handle populated only after the root layout has selected the physical
 * database for the current server/account pair. Importing this module must never open RxDB.
 */
export const live = $state({ db: null as Db | null, error: '' });
