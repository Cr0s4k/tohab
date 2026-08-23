export const LARGE_LIST_ANIMATION_LIMIT = 40;

export function isIosLike(userAgent: string, platform: string, maxTouchPoints: number): boolean {
	return /iPad|iPhone|iPod/.test(userAgent) || (platform === 'MacIntel' && maxTouchPoints > 1);
}

export function shouldRuntimeCacheRequest(destination: string): boolean {
	return ['script', 'style', 'font', 'image', 'audio'].includes(destination);
}

export function shouldAnimateList(length: number): boolean {
	return length < LARGE_LIST_ANIMATION_LIMIT;
}

/** API responses and credential-bearing routes are always network-only. */
export function shouldBypassServiceWorker(url: URL): boolean {
	return ['/sync', '/auth', '/calendar', '/push'].some(
		(prefix) => url.pathname === prefix || url.pathname.startsWith(`${prefix}/`)
	);
}
