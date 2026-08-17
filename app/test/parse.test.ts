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
	['wow!! excited', { title: 'wow!! excited', priority: 4 }]
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
