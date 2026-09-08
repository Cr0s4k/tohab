import {
	liveDocs
} from './repositories/documents.ts';
import {
	allPushSubscriptions,
	claimPushReminder,
	prunePushReminders,
	releasePushReminder
} from './repositories/push.ts';
import { remindersForTask, type ReminderTask } from './push.ts';
import { sendPush } from './pushService.ts';

let pushRunActive = false;

export async function runPushReminders(now = Date.now()) {
	if (pushRunActive) return;
	pushRunActive = true;
	try {
		const subscriptions = await allPushSubscriptions();
		const tasksByUser = new Map<string, ReminderTask[]>();
		for (const subscription of subscriptions) {
			let tasks = tasksByUser.get(subscription.userId);
			if (!tasks) {
				tasks = (await liveDocs(subscription.userId, 'tasks')).map(
					(row) => row.data as unknown as ReminderTask
				);
				tasksByUser.set(subscription.userId, tasks);
			}
			const openCount = tasks.filter((task) => !task.done && !task._deleted).length;
			for (const task of tasks) {
				for (const reminder of remindersForTask(task, subscription.timeZone, subscription.leadMinutes, now)) {
					if (!await claimPushReminder(subscription.id, task.id, reminder.key)) continue;
					const sent = await sendPush(subscription, {
						title: reminder.title,
						body: reminder.body ?? 'Task reminder',
						url: '/tasks',
						badge: openCount,
						tag: reminder.key
					});
					if (!sent) await releasePushReminder(subscription.id, reminder.key);
				}
			}
		}
		await prunePushReminders(now - 90 * 24 * 60 * 60 * 1000);
	} finally {
		pushRunActive = false;
	}
}
