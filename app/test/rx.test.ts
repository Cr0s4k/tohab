import { Subject } from 'rxjs';
import { createReporter } from '../../test/assertions.ts';
import { subscribeSource, type RxBox } from '../src/lib/rx.ts';

const reporter = createReporter();
const check = reporter.check;
const box: RxBox<number[]> = { value: [99], loading: false, error: null };
const first = new Subject<number[]>();

const stopFirst = subscribeSource(first, box, []);
check('new source clears stale values', box.value, []);
check('new source starts loading', box.loading, true);

first.next([1]);
check('source updates the value', box.value, [1]);
check('first value ends loading', box.loading, false);

stopFirst?.();
const second = new Subject<number[]>();
subscribeSource(second, box, []);
first.next([2]);
check('unsubscribed source cannot overwrite state', box.value, []);

second.error(new Error('query failed'));
check('observable errors are exposed', box.error?.message, 'query failed');
check('observable errors end loading', box.loading, false);

subscribeSource(null, box, []);
check('missing source resets the value', box.value, []);
check('missing source is not loading', box.loading, false);
check('missing source clears prior errors', box.error, null);

reporter.finish('Rx lifecycle assertions passed');
