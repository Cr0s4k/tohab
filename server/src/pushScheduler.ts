import {
	allPushSubscriptions,
	claimPushReminder,
	liveDocs,
	prunePushReminders,
	releasePushReminder
} from './db.ts';
import { reminderForTask, type ReminderTask } from './push.ts';
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
				const reminder = reminderForTask(task, subscription.timeZone, subscription.leadMinutes, now);
				if (!reminder || !await claimPushReminder(subscription.id, task.id, reminder.key)) continue;
				const sent = await sendPush(subscription, {
					title: reminder.title,
					body: `Due at ${task.dueTime}`,
					url: '/tasks',
					badge: openCount,
					tag: reminder.key
				});
				if (!sent) await releasePushReminder(subscription.id, reminder.key);
			}
		}
		await prunePushReminders(now - 90 * 24 * 60 * 60 * 1000);
	} finally {
		pushRunActive = false;
	}
}
