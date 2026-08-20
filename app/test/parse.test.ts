import { parseQuickAdd } from '../src/lib/parse.ts';

// Wednesday 2026-08-19 as a fixed base
const base = new Date(2026, 7, 19, 10, 0, 0);

const cases: [string, Partial<ReturnType<typeof parseQuickAdd>>][] = [
	['buy milk', { title: 'buy milk', due: '', priority: 4 }],
	['buy milk tomorrow', { title: 'buy milk', due: '2026-08-20' }],
	['buy milk tomorrow 5pm p1', { title: 'buy milk', due: '2026-08-20', dueTime: '17:00', priority: 1 }],
	['call mum at 6pm', { title: 'call mum', due: '2026-08-19', dueTime: '18:00' }],
	['standup 9:30am #work', { title: 'standup', dueTime: '09:30', project: 'work' }],
	['deploy 17:00', { title: 'deploy', dueTime: '17:00', due: '2026-08-19' }],
	['gym monday', { title: 'gym', due: '2026-08-24' }],
	['gym wednesday', { title: 'gym', due: '2026-08-19' }],
	['gym next wednesday', { title: 'gym', due: '2026-08-26' }],
	['review in 3 days !2', { title: 'review', due: '2026-08-22', priority: 2 }],
	['plan in 2 weeks', { title: 'plan', due: '2026-09-02' }],
	['taxes 5 jan', { title: 'taxes', due: '2027-01-05' }],
	['taxes jan 5', { title: 'taxes', due: '2027-01-05' }],
	['party 25/12', { title: 'party', due: '2026-12-25' }],
	['party 25/12/2027', { title: 'party', due: '2027-12-25' }],
	['buy 5 apples', { title: 'buy 5 apples', due: '', dueTime: '' }],
	['dentist 3rd sept at 14:15', { title: 'dentist', due: '2026-09-03', dueTime: '14:15' }],
	['satisfy the linter', { title: 'satisfy the linter', due: '' }],
	['pay rent p3 #home tomorrow', { title: 'pay rent', due: '2026-08-20', priority: 3, project: 'home' }],
	['read 30 pages today', { title: 'read 30 pages', due: '2026-08-19' }],
	['ship it at 9', { title: 'ship it', dueTime: '09:00', due: '2026-08-19' }],
	['12am checkin', { title: 'checkin', dueTime: '00:00' }],
	['12pm lunch', { title: 'lunch', dueTime: '12:00' }],
	['feb 29 leap', { title: 'leap', due: '2027-02-28' }],
	['call the bank !!1', { title: 'call the bank', priority: 1 }],
	['call the bank !1', { title: 'call the bank', priority: 1 }],
	['call the bank p1', { title: 'call the bank', priority: 1 }],
	['ship !!2 tomorrow', { title: 'ship', priority: 2, due: '2026-08-20' }],
	['no priority !!5', { title: 'no priority !!5', priority: 4 }],
	['wow!! excited', { title: 'wow!! excited', priority: 4 }],
	['water plants every day', { title: 'water plants', repeat: 'day:1', due: '2026-08-19' }],
	['water plants daily', { title: 'water plants', repeat: 'day:1', due: '2026-08-19' }],
	['bins every other day', { title: 'bins', repeat: 'day:2', due: '2026-08-19' }],
	['deep clean every 3 weeks', { title: 'deep clean', repeat: 'week:3', due: '2026-08-19' }],
	['bins every friday', { title: 'bins', repeat: 'week:1:5', due: '2026-08-21' }],
	['gym every mon, wed and fri', { title: 'gym', repeat: 'week:1:1,3,5', due: '2026-08-19' }],
	['standup every weekday at 9:30', { title: 'standup', repeat: 'week:1:1,2,3,4,5', due: '2026-08-19', dueTime: '09:30' }],
	['brunch every weekend', { title: 'brunch', repeat: 'week:1:0,6', due: '2026-08-22' }],
	['pay rent every 1st', { title: 'pay rent', repeat: 'month:1:1', due: '2026-09-01' }],
	['review every month #work', { title: 'review', repeat: 'month:1', project: 'work' }],
	['mot every year p2', { title: 'mot', repeat: 'year:1', priority: 2 }],
	['sheets every! 10 days', { title: 'sheets', repeat: '!day:10', due: '2026-08-19' }],
	['audit each 2 months', { title: 'audit', repeat: 'month:2' }],
	['bins every other friday 5pm', { title: 'bins', repeat: 'week:2:5', due: '2026-08-21', dueTime: '17:00' }],
	// A rule wins the weekday it contains; a plain weekday still means a one-off date.
	['gym friday', { title: 'gym', repeat: '', due: '2026-08-21' }],
	['every so often', { title: 'every so often', repeat: '' }],
	['buy 12 eggs', { title: 'buy 12 eggs', repeat: '' }]
];

let fail = 0;
for (const [input, want] of cases) {
	const got = parseQuickAdd(input, base);
	const bad = Object.entries(want).filter(([k, v]) => (got as any)[k] !== v);
	if (bad.length) {
		fail++;
		console.log(`FAIL  ${JSON.stringify(input)}`);
		for (const [k, v] of bad) console.log(`        ${k}: want ${JSON.stringify(v)} got ${JSON.stringify((got as any)[k])}`);
		console.log(`        full: ${JSON.stringify(got)}`);
	} else {
		console.log(`ok    ${JSON.stringify(input)} -> "${got.title}" ${got.due} ${got.dueTime} p${got.priority} ${got.project}`);
	}
}
console.log(fail ? `\n${fail}/${cases.length} failing` : `\nall ${cases.length} passing`);
