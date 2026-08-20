/**
 * Lets the real tasks.ts / habits.ts / activity.ts run under plain Node.
 *
 * Two substitutions, both narrow: `$state` is a Svelte compiler rune, but the modules under
 * test only ever call it as a function on a plain object, so a passthrough is enough to
 * import them; and `db/lazy.ts` is pointed at an in-memory RxDB built from the real schemas,
 * since Dexie storage wants an IndexedDB that Node does not have.
 */
import { registerHooks } from 'node:module';

globalThis.$state = (v) => v;

const DB = new URL('./activity-e2e-db.ts', import.meta.url).href;

registerHooks({
	resolve(specifier, context, next) {
		if (specifier.endsWith('db/lazy.ts')) return { url: DB, shortCircuit: true };
		return next(specifier, context);
	}
});
