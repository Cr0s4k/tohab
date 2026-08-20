import {
	advanceDue,
	describeRepeat,
	firstDue,
	isRepeating,
	nextDue,
	parseRule
} from '../src/lib/repeat.ts';

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

// 2026-08-19 is a Wednesday.
const WED = '2026-08-19';

check('daily rolls one day', nextDue('day:1', WED), '2026-08-20');
check('every 3 days', nextDue('day:3', WED), '2026-08-22');
check('weekly keeps the weekday', nextDue('week:1', WED), '2026-08-26');
check('fortnightly keeps the weekday', nextDue('week:2', WED), '2026-09-02');
check('monthly keeps the day of month', nextDue('month:1', WED), '2026-09-19');
check('yearly', nextDue('year:1', WED), '2027-08-19');

check('next weekday from a Wednesday', nextDue('week:1:1,2,3,4,5', WED), '2026-08-20');
check('weekday rule skips the weekend', nextDue('week:1:1,2,3,4,5', '2026-08-21'), '2026-08-24');
check('weekend rule', nextDue('week:1:0,6', WED), '2026-08-22');
check('every Monday', nextDue('week:1:1', WED), '2026-08-24');
check('every Mon and Fri picks the nearer', nextDue('week:1:1,5', WED), '2026-08-21');

// Every other Monday stays on its fortnight instead of drifting to the next listed day.
check('every other Monday from a Monday', nextDue('week:2:1', '2026-08-24'), '2026-09-07');
check('every other Monday from midweek', nextDue('week:2:1', WED), '2026-08-24');
check('every other Sunday crosses the week boundary', nextDue('week:2:0', '2026-08-23'), '2026-09-06');

check('month end clamps into February', nextDue('month:1', '2026-01-31'), '2026-02-28');
check('the 31st clamps and does not stick', nextDue('month:1:31', '2026-04-30'), '2026-05-31');
check('leap day clamps', nextDue('year:1', '2028-02-29'), '2029-02-28');
check('monthly on the 15th from before it', nextDue('month:1:15', '2026-08-03'), '2026-08-15');
check('monthly on the 15th from after it', nextDue('month:1:15', WED), '2026-09-15');
check('every 3 months on the 1st', nextDue('month:3:1', '2026-08-01'), '2026-11-01');

check('firstDue counts today', firstDue('day:1', WED), WED);
check('firstDue lands on the next listed weekday', firstDue('week:1:1', WED), '2026-08-24');
check('firstDue accepts today when it matches', firstDue('week:1:3', WED), WED);
check('firstDue for the 15th', firstDue('month:1:15', WED), '2026-09-15');

check('completing on time advances from the due date', advanceDue('day:1', WED, WED), '2026-08-20');
check('completing early still advances from the due date', advanceDue('day:7', '2026-08-26', WED), '2026-09-02');
check('an overdue daily task rolls past today', advanceDue('day:1', '2026-07-01', WED), '2026-08-20');
check('an overdue weekly task rolls past today', advanceDue('week:1:1', '2026-06-01', WED), '2026-08-24');
check('a from-completion rule ignores the old due date', advanceDue('!day:3', '2026-07-01', WED), '2026-08-22');
check('a rule with no due date counts from today', advanceDue('day:2', '', WED), '2026-08-21');

check('daily', describeRepeat('day:1'), 'Daily');
check('every other day', describeRepeat('day:2'), 'Every other day');
check('every 5 days', describeRepeat('day:5'), 'Every 5 days');
check('weekly', describeRepeat('week:1'), 'Weekly');
check('weekdays', describeRepeat('week:1:1,2,3,4,5'), 'Every weekday');
check('weekend', describeRepeat('week:1:0,6'), 'Every weekend');
check('one weekday is named in full', describeRepeat('week:1:5'), 'Every Friday');
check('several weekdays are abbreviated', describeRepeat('week:1:1,3,5'), 'Every Mon, Wed, Fri');
check('every other Friday', describeRepeat('week:2:5'), 'Every other Friday');
check('a longer interval spells out the week', describeRepeat('week:3:1,5'), 'Every 3 weeks on Mon, Fri');
check('monthly on a day', describeRepeat('month:1:15'), 'Monthly on the 15th');
check('ordinal 1st', describeRepeat('month:1:1'), 'Monthly on the 1st');
check('ordinal 22nd', describeRepeat('month:1:22'), 'Monthly on the 22nd');
check('ordinal 13th', describeRepeat('month:1:13'), 'Monthly on the 13th');
check('yearly', describeRepeat('year:1'), 'Yearly');
check('from completion is spelled out', describeRepeat('!day:3'), 'Every 3 days after completing');

check('round trip keeps the fields', parseRule('!week:2:1,3'), {
	unit: 'week',
	interval: 2,
	weekdays: [1, 3],
	monthDay: 0,
	fromCompletion: true
});
check('empty is not a rule', isRepeating(''), false);
check('undefined is not a rule', isRepeating(undefined), false);
check('an unknown unit is rejected', isRepeating('fortnight:1'), false);
check('a zero interval is rejected', isRepeating('day:0'), false);
check('a non-numeric interval is rejected', isRepeating('day:x'), false);
check('an out-of-range weekday is rejected', isRepeating('week:1:9'), false);
check('an out-of-range month day is rejected', isRepeating('month:1:42'), false);
check('a bad rule advances nowhere', advanceDue('nonsense', WED, WED), '');

console.log(failures ? `\n${failures} failing` : '\nall passing');
process.exit(failures ? 1 : 0);
