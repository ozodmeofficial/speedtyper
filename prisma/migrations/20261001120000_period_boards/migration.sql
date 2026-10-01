-- Speed leaderboards (day / month / year / all time, WPM or CPM) are computed
-- from "results"; the per-user all-time best cache is no longer used.
DROP TABLE IF EXISTS "leaderboard_bests";

-- CreateIndex
CREATE INDEX "results_mode_mode2_language_day_key_idx" ON "results"("mode", "mode2", "language", "day_key");
