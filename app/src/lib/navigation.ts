export const NAV_PATHS = {
	inbox: 'M4 4h16v13a3 3 0 01-3 3H7a3 3 0 01-3-3V4zM4 13h5l2 2 4-4h5',
	today: 'M7 2v4M17 2v4M4 10h16M5 5h14a2 2 0 012 2v12a2 2 0 01-2 2H5a2 2 0 01-2-2V7a2 2 0 012-2z',
	upcoming: 'M8 2v4M16 2v4M4 10h16M5 5h14a2 2 0 012 2v12a2 2 0 01-2 2H5a2 2 0 01-2-2V7a2 2 0 012-2zM9 15h6',
	browse: 'M4 6a2 2 0 012-2h5l2 2h5a2 2 0 012 2v8a2 2 0 01-2 2H6a2 2 0 01-2-2V6z',
	journal: 'M5 5h14a2 2 0 012 2v10a2 2 0 01-2 2H5a2 2 0 01-2-2V7a2 2 0 012-2zM3 9h18M8 3v4M16 3v4',
	progress: 'M4 19V5M4 19h16M7 15l3-3 3 3 5-6',
	settings: 'M12 15.5a3.5 3.5 0 100-7 3.5 3.5 0 000 7zM19.4 15a1.7 1.7 0 00.3 1.9l.1.1a2 2 0 01-2.8 2.8l-.1-.1a1.7 1.7 0 00-2.9 1.2v.2a2 2 0 01-4 0v-.1a1.7 1.7 0 00-2.9-1.3l-.1.1a2 2 0 01-2.8-2.8l.1-.1A1.7 1.7 0 003.6 14H3.4a2 2 0 010-4h.2a1.7 1.7 0 001.2-2.9l-.1-.1a2 2 0 012.8-2.8l.1.1A1.7 1.7 0 0010 3.6V3.4a2 2 0 014 0v.2a1.7 1.7 0 002.9 1.2l.1-.1a2 2 0 012.8 2.8l-.1.1A1.7 1.7 0 0021 10h.2a2 2 0 010 4H21a1.7 1.7 0 00-1.6 1z',
	collapse: 'M11 17l-5-5 5-5M18 17l-5-5 5-5',
	add: 'M12 5v14M5 12h14'
} as const;

export type NavIcon = keyof typeof NAV_PATHS;
export type NavItem = { href: string; label: string; icon: NavIcon };

export const TASK_NAV_ITEMS = [
	{ href: '/tasks?view=inbox', label: 'Inbox', icon: 'inbox' },
	{ href: '/tasks?view=today', label: 'Today', icon: 'today' },
	{ href: '/tasks?view=upcoming', label: 'Upcoming', icon: 'upcoming' },
	{ href: '/browse', label: 'Browse', icon: 'browse' }
] satisfies NavItem[];

export const HABIT_NAV_ITEMS = [
	{ href: '/habits', label: 'Journal', icon: 'journal' },
	{ href: '/progress', label: 'Progress', icon: 'progress' }
] satisfies NavItem[];

export const NAV_GROUPS = [
	{ label: 'Tasks', items: TASK_NAV_ITEMS },
	{ label: 'Habits', items: HABIT_NAV_ITEMS }
];

export function isNavItemActive(url: URL, href: string) {
	const [path, query = ''] = href.split('?');
	if (path === '/browse') return url.pathname === '/browse' || url.pathname.startsWith('/projects');
	if (path === '/habits') return url.pathname.startsWith('/habits');
	if (url.pathname !== path && !url.pathname.startsWith(`${path}/`)) return false;
	if (!query) return true;
	return url.searchParams.get('view') === new URLSearchParams(query).get('view');
}
