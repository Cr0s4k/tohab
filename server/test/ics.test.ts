import { buildCalendar, feedToken, resolveFeedToken, type FeedTask } from '../src/ics.ts';

let failures = 0;

function check(label: string, got: unknown, want: unknown) {
	const a = JSON.stringify(got);
	const b = JSON.stringify(want);
	if (a !== b) {
		failures++;
		console.log(`FAIL  ${label}\n        want ${b}\n        got  ${a}`);
	} else {
		console.log(`ok    ${label}`);
	}
}

function task(over: Partial<FeedTask> = {}): FeedTask {
	return {
		id: 'a1',
		title: 'Pay rent',
		notes: '',
		done: false,
		due: '2026-08-20',
		dueTime: '',
		priority: 4,
		projectId: '',
		updatedAt: 1_700_000_000_000,
		...over
	};
}

const NOW = 1_755_400_000_000;
const opts = { now: NOW, alarmMinutes: 10 };

const allDay = buildCalendar([task()], opts).split('\r\n');
check('all-day start', allDay.includes('DTSTART;VALUE=DATE:20260820'), true);
check('all-day end is exclusive next day', allDay.includes('DTEND;VALUE=DATE:20260821'), true);
check('no alarm on all-day task', allDay.includes('BEGIN:VALARM'), false);
check('summary', allDay.includes('SUMMARY:Pay rent'), true);
check('no priority for p4', allDay.some((l) => l.startsWith('PRIORITY')), false);
check('wrapped in vcalendar', [allDay[0], allDay.at(-2)], ['BEGIN:VCALENDAR', 'END:VCALENDAR']);
check('crlf terminated', buildCalendar([task()], opts).endsWith('\r\n'), true);

const timed = buildCalendar([task({ dueTime: '17:30', priority: 1 })], opts).split('\r\n');
check('floating local start', timed.includes('DTSTART:20260820T173000'), true);
check('30 minute block', timed.includes('DTEND:20260820T180000'), true);
check('p1 maps to icalendar 1', timed.includes('PRIORITY:1'), true);
check('alarm present', timed.includes('TRIGGER;RELATED=START:-PT10M'), true);

const noAlarm = buildCalendar([task({ dueTime: '17:30' })], { now: NOW, alarmMinutes: 0 });
check('alarmMinutes 0 disables alarms', noAlarm.includes('VALARM'), false);

const rollover = buildCalendar([task({ dueTime: '23:45' })], opts);
check('duration crosses midnight', rollover.includes('DTEND:20260821T001500'), true);

const monthEnd = buildCalendar([task({ due: '2026-12-31' })], opts);
check('all-day end crosses new year', monthEnd.includes('DTEND;VALUE=DATE:20270101'), true);

const filtered = buildCalendar(
	[task({ id: 'done', done: true }), task({ id: 'undated', due: '' }), task({ id: 'keep' })],
	opts
);
check('completed excluded', filtered.includes('UID:task-done@tohab'), false);
check('undated excluded', filtered.includes('UID:task-undated@tohab'), false);
check('open dated task kept', filtered.includes('UID:task-keep@tohab'), true);

const ordered = buildCalendar(
	[task({ id: 'late', due: '2026-08-22' }), task({ id: 'early', due: '2026-08-19' })],
	opts
);
check(
	'sorted by due date',
	ordered.indexOf('UID:task-early') < ordered.indexOf('UID:task-late'),
	true
);

const escaped = buildCalendar(
	[task({ title: 'Buy milk, bread; and eggs\\', notes: 'line one\nline two' })],
	opts
).split('\r\n');
check('special characters escaped', escaped.includes('SUMMARY:Buy milk\\, bread\\; and eggs\\\\'), true);
check('newlines escaped', escaped.includes('DESCRIPTION:line one\\nline two'), true);

const long = buildCalendar([task({ title: 'x'.repeat(200) })], opts).split('\r\n');
check('long lines folded to 75 octets', long.every((l) => Buffer.byteLength(l) <= 75), true);
check('continuation lines start with a space', long.filter((l) => l.startsWith(' ')).length >= 2, true);

const unicode = buildCalendar([task({ title: '🔥'.repeat(60) })], opts).split('\r\n');
check('multibyte folding stays valid utf8', unicode.join('').includes('�'), false);

const daily = buildCalendar([task({ repeat: 'day:1' })], opts).split('\r\n');
check('daily rule becomes an rrule', daily.includes('RRULE:FREQ=DAILY'), true);
check('interval 1 is left implicit', daily.some((l) => l.startsWith('RRULE') && l.includes('INTERVAL')), false);

const weekdays = buildCalendar([task({ repeat: 'week:1:1,3,5' })], opts);
check('weekday list becomes byday', weekdays.includes('RRULE:FREQ=WEEKLY;BYDAY=MO,WE,FR'), true);

const fortnightly = buildCalendar([task({ repeat: 'week:2' })], opts);
check('interval is carried', fortnightly.includes('RRULE:FREQ=WEEKLY;INTERVAL=2'), true);

const monthly = buildCalendar([task({ repeat: 'month:3:15' })], opts);
check('month day becomes bymonthday', monthly.includes('RRULE:FREQ=MONTHLY;INTERVAL=3;BYMONTHDAY=15'), true);

const yearly = buildCalendar([task({ repeat: 'year:1' })], opts);
check('yearly rule', yearly.includes('RRULE:FREQ=YEARLY'), true);

// A rule counting from the completion date has no fixed schedule to publish.
const fromCompletion = buildCalendar([task({ repeat: '!day:3' })], opts);
check('from-completion rules emit no rrule', fromCompletion.includes('RRULE'), false);

check('unknown units emit no rrule', buildCalendar([task({ repeat: 'fortnight:1' })], opts).includes('RRULE'), false);
check('bad intervals emit no rrule', buildCalendar([task({ repeat: 'day:0' })], opts).includes('RRULE'), false);
check('bad weekdays emit no rrule', buildCalendar([task({ repeat: 'week:1:9' })], opts).includes('RRULE'), false);
check('no rule emits no rrule', buildCalendar([task()], opts).includes('RRULE'), false);

const projects = new Map([['p1', 'Home']]);
const categorised = buildCalendar([task({ projectId: 'p1' })], { ...opts, projects });
check('project becomes a category', categorised.includes('CATEGORIES:Home'), true);

const secret = 'test-secret';
const token = feedToken(secret, 'user-a');
check('token is opaque', token.includes('user-a'), false);
check('token is stable', feedToken(secret, 'user-a'), token);
check('token is per user', feedToken(secret, 'user-b') === token, false);
check('token resolves', resolveFeedToken(secret, token, ['user-b', 'user-a']), 'user-a');
check('unknown token rejected', resolveFeedToken(secret, 'deadbeef', ['user-a']), undefined);
check('wrong secret rejected', resolveFeedToken('other', token, ['user-a']), undefined);

console.log(failures ? `\n${failures} failing` : '\nall passing');
process.exit(failures ? 1 : 0);
