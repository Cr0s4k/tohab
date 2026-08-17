import { toKey } from './dates.ts';

export type Parsed = {
	title: string;
	due: string;
	dueTime: string;
	priority: number;
	project: string;
	/** Human-readable chips describing what was recognised, for the live preview. */
	matched: string[];
};

const WEEKDAYS: Record<string, number> = {
	sunday: 0,
	sun: 0,
	monday: 1,
	mon: 1,
	tuesday: 2,
	tue: 2,
	tues: 2,
	wednesday: 3,
	wed: 3,
	thursday: 4,
	thu: 4,
	thur: 4,
	thurs: 4,
	friday: 5,
	fri: 5,
	saturday: 6,
	sat: 6
};

const MONTHS: Record<string, number> = {
	jan: 0,
	january: 0,
	feb: 1,
	february: 1,
	mar: 2,
	march: 2,
	apr: 3,
	april: 3,
	may: 4,
	jun: 5,
	june: 5,
	jul: 6,
	july: 6,
	aug: 7,
	august: 7,
	sep: 8,
	sept: 8,
	september: 8,
	oct: 9,
	october: 9,
	nov: 10,
	november: 10,
	dec: 11,
	december: 11
};

const WEEKDAY_RE = Object.keys(WEEKDAYS).sort((a, b) => b.length - a.length).join('|');
const MONTH_RE = Object.keys(MONTHS).sort((a, b) => b.length - a.length).join('|');

function dayAt(base: Date, offset: number): Date {
	const d = new Date(base.getFullYear(), base.getMonth(), base.getDate());
	d.setDate(d.getDate() + offset);
	return d;
}

function nextWeekday(base: Date, weekday: number, strictlyFuture: boolean): Date {
	let delta = (weekday - base.getDay() + 7) % 7;
	if (strictlyFuture && delta === 0) delta = 7;
	return dayAt(base, delta);
}

function clampDay(year: number, month: number, day: number): Date {
	const d = new Date(year, month, day);
	return d.getMonth() === month ? d : new Date(year, month + 1, 0);
}

/** Pushes a bare month/day into next year when it has already passed. */
function resolveMonthDay(base: Date, month: number, day: number, year?: number): Date {
	if (year !== undefined) return clampDay(year, month, day);
	const candidate = clampDay(base.getFullYear(), month, day);
	const floor = new Date(base.getFullYear(), base.getMonth(), base.getDate());
	return candidate < floor ? clampDay(base.getFullYear() + 1, month, day) : candidate;
}

export function parseQuickAdd(raw: string, base = new Date()): Parsed {
	let text = ` ${raw} `;
	const matched: string[] = [];
	let due = '';
	let dueTime = '';
	let priority = 4;
	let project = '';

	const eat = (re: RegExp, onMatch: (m: RegExpMatchArray) => boolean | void) => {
		const m = text.match(re);
		if (!m) return;
		if (onMatch(m) === false) return;
		text = text.replace(re, ' ');
	};

	eat(/\s#([\p{L}\p{N}_-]+)/u, (m) => {
		project = m[1];
		matched.push(`#${project}`);
	});

	eat(/\s(?:p([1-4])|!{1,2}([1-4]))\b/i, (m) => {
		priority = Number(m[1] ?? m[2]);
		matched.push(`P${priority}`);
	});

	const setTime = (h: number, min: number) => {
		if (h > 23 || min > 59) return false;
		dueTime = `${String(h).padStart(2, '0')}:${String(min).padStart(2, '0')}`;
		matched.push(dueTime);
		return true;
	};

	// "at 9", "at 9:30", "5pm", "17:00" — a bare number is only a time after "at".
	eat(/\s(?:at\s+)?(\d{1,2})(?::(\d{2}))?\s*(am|pm)\b/i, (m) => {
		let h = Number(m[1]);
		const min = Number(m[2] ?? 0);
		if (h > 12) return false;
		if (m[3].toLowerCase() === 'pm' && h !== 12) h += 12;
		if (m[3].toLowerCase() === 'am' && h === 12) h = 0;
		return setTime(h, min);
	});
	if (!dueTime) eat(/\s(?:at\s+)?([01]?\d|2[0-3]):([0-5]\d)\b/, (m) => setTime(Number(m[1]), Number(m[2])));
	if (!dueTime) eat(/\sat\s+(\d{1,2})\b/i, (m) => setTime(Number(m[1]), 0));

	const setDue = (d: Date, label: string) => {
		due = toKey(d);
		matched.push(label);
	};

	eat(/\s(today|tod)\b/i, () => setDue(base, 'Today'));
	if (!due) eat(/\s(tomorrow|tmrw|tmr|tom)\b/i, () => setDue(dayAt(base, 1), 'Tomorrow'));
	if (!due) eat(/\s(yesterday)\b/i, () => setDue(dayAt(base, -1), 'Yesterday'));

	if (!due)
		eat(/\sin\s+(\d{1,3})\s*(day|days|week|weeks|month|months)\b/i, (m) => {
			const n = Number(m[1]);
			const unit = m[2].toLowerCase();
			if (unit.startsWith('day')) return setDue(dayAt(base, n), `in ${n}d`);
			if (unit.startsWith('week')) return setDue(dayAt(base, n * 7), `in ${n}w`);
			const d = new Date(base.getFullYear(), base.getMonth() + n, base.getDate());
			return setDue(d, `in ${n}mo`);
		});

	if (!due)
		eat(new RegExp(`\\s(next\\s+)?(${WEEKDAY_RE})\\b`, 'i'), (m) => {
			const d = nextWeekday(base, WEEKDAYS[m[2].toLowerCase()], Boolean(m[1]));
			setDue(d, m[1] ? `next ${m[2]}` : m[2]);
		});

	if (!due)
		eat(new RegExp(`\\s(\\d{1,2})\\s*(?:st|nd|rd|th)?\\s+(${MONTH_RE})\\b(?:\\s+(\\d{4}))?`, 'i'), (m) => {
			const d = resolveMonthDay(
				base,
				MONTHS[m[2].toLowerCase()],
				Number(m[1]),
				m[3] ? Number(m[3]) : undefined
			);
			setDue(d, `${m[1]} ${m[2]}`);
		});

	if (!due)
		eat(new RegExp(`\\s(${MONTH_RE})\\s+(\\d{1,2})\\b(?:\\s*,?\\s*(\\d{4}))?`, 'i'), (m) => {
			const d = resolveMonthDay(
				base,
				MONTHS[m[1].toLowerCase()],
				Number(m[2]),
				m[3] ? Number(m[3]) : undefined
			);
			setDue(d, `${m[1]} ${m[2]}`);
		});

	// Day-first, matching the rest of the app's locale-neutral formatting.
	if (!due)
		eat(/\s(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?\b/, (m) => {
			const day = Number(m[1]);
			const month = Number(m[2]) - 1;
			if (month < 0 || month > 11 || day < 1 || day > 31) return false;
			let year: number | undefined;
			if (m[3]) year = m[3].length === 2 ? 2000 + Number(m[3]) : Number(m[3]);
			setDue(resolveMonthDay(base, month, day, year), m[0].trim());
		});

	// A bare time means today, the way every task app treats "call mum at 6pm".
	if (dueTime && !due) due = toKey(base);

	const title = text.replace(/\s+/g, ' ').trim();
	return { title, due, dueTime, priority, project, matched };
}
