import webpush from 'web-push';
import {
	allPushSubscriptions,
	deletePushSubscriptionById,
	recordPushFailure,
	recordPushSuccess
} from './repositories/push.ts';
import { persistedGenerated } from './repositories/secrets.ts';

type VapidPair = { publicKey: string; privateKey: string };
type PushSubscription = Awaited<ReturnType<typeof allPushSubscriptions>>[number];

let cachedVapid: VapidPair | null = null;

export async function vapidKeys(): Promise<VapidPair> {
	if (cachedVapid) return cachedVapid;
	const fromEnv = process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY
		? { publicKey: process.env.VAPID_PUBLIC_KEY, privateKey: process.env.VAPID_PRIVATE_KEY }
		: null;
	const pair = fromEnv ?? JSON.parse(
		await persistedGenerated('vapid', () => JSON.stringify(webpush.generateVAPIDKeys()))
	) as VapidPair;
	if (!pair.publicKey || !pair.privateKey) throw new Error('invalid VAPID key pair');
	webpush.setVapidDetails(
		process.env.VAPID_SUBJECT || 'mailto:admin@tohab.local',
		pair.publicKey,
		pair.privateKey
	);
	cachedVapid = pair;
	return pair;
}

export async function sendPush(subscription: PushSubscription, payload: Record<string, unknown>) {
	await vapidKeys();
	try {
		await webpush.sendNotification(
			{ endpoint: subscription.endpoint, keys: { p256dh: subscription.p256dh, auth: subscription.auth } },
			JSON.stringify(payload),
			{ TTL: 3600, urgency: 'high' }
		);
		await recordPushSuccess(subscription.id);
		return true;
	} catch (error) {
		const status = Number((error as { statusCode?: number }).statusCode ?? 0);
		if (status === 404 || status === 410) await deletePushSubscriptionById(subscription.id);
		else {
			await recordPushFailure(subscription.id);
			console.error(`push delivery failed (${status || 'network'})`);
		}
		return false;
	}
}
