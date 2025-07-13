import { notificationService } from "../services/notification.service";
import cron from "node-cron";

export function setupScheduledJobs() {
  // Daily reading reminders at 7 PM
  cron.schedule("0 19 * * *", async () => {
    console.log("Running daily reading reminders...");
    await notificationService.scheduleReadingReminders();
  });

  // Weekly goal check on Sundays at 6 PM
  cron.schedule("0 18 * * 0", async () => {
    console.log("Running weekly goal progress check...");
    await notificationService.checkGoalProgress();
  });

  // Weekly digest on Sundays at 8 AM
  cron.schedule("0 8 * * 0", async () => {
    console.log("Sending weekly digest...");
    await notificationService.sendWeeklyDigest();
  });

  console.log("✅ Scheduled jobs configured");
}
