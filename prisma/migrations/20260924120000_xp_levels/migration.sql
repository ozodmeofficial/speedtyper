-- AlterTable
ALTER TABLE "users" ADD COLUMN     "last_active_day" INTEGER,
ADD COLUMN     "level" INTEGER NOT NULL DEFAULT 1,
ADD COLUMN     "streak_best" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "streak_current" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "xp" INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "xp_events" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,
    "source" VARCHAR(8) NOT NULL,
    "ref_id" VARCHAR(40),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "xp_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_achievements" (
    "user_id" TEXT NOT NULL,
    "key" VARCHAR(32) NOT NULL,
    "unlocked_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_achievements_pkey" PRIMARY KEY ("user_id","key")
);

-- CreateIndex
CREATE INDEX "xp_events_created_at_user_id_idx" ON "xp_events"("created_at", "user_id");

-- CreateIndex
CREATE INDEX "xp_events_user_id_created_at_idx" ON "xp_events"("user_id", "created_at" DESC);

-- CreateIndex
CREATE INDEX "users_xp_idx" ON "users"("xp" DESC);

-- AddForeignKey
ALTER TABLE "xp_events" ADD CONSTRAINT "xp_events_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_achievements" ADD CONSTRAINT "user_achievements_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- ─────────────────────────────────────────────────────────────────────────
-- Backfill (mirrors src/lib/xp.ts: testXp, raceXp, xpForLevel)
-- round(x) for x ≥ 0 is FLOOR(x + 0.5), identical to JavaScript Math.round.
-- ─────────────────────────────────────────────────────────────────────────

CREATE FUNCTION pg_temp.st_test_xp(duration DOUBLE PRECISION, wpm DOUBLE PRECISION, acc DOUBLE PRECISION) RETURNS INTEGER
LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE
    WHEN duration < 3 OR acc < 50 OR wpm <= 0 THEN 0
    ELSE GREATEST(1, FLOOR(
      (5 + 0.5 * LEAST(duration, 300) * (1 + LEAST(wpm, 250) / 60.0)
         * (0.25 + 0.75 * power(LEAST(1.0, GREATEST(0.0, (acc - 50) / 50.0)), 2)))
      * (CASE WHEN acc >= 100 THEN 1.1 ELSE 1 END) + 0.5))::INTEGER
  END
$$;

-- XP events for every valid (non-flagged) saved test
INSERT INTO "xp_events" ("id", "user_id", "amount", "source", "ref_id", "created_at")
SELECT 'xpt_' || r."id", r."user_id", pg_temp.st_test_xp(r."duration", r."wpm", r."acc"), 'test', r."id", r."created_at"
FROM "results" r
WHERE r."flagged" = false AND pg_temp.st_test_xp(r."duration", r."wpm", r."acc") > 0;

-- XP events for finished races of signed-in players
INSERT INTO "xp_events" ("id", "user_id", "amount", "source", "ref_id", "created_at")
SELECT 'xpr_' || rr."id", rr."user_id",
       pg_temp.st_test_xp(rr."duration", rr."wpm", rr."acc")
       + CASE WHEN ra."player_count" >= 2 THEN
           FLOOR(15.0 * (ra."player_count" - LEAST(rr."place", ra."player_count")) / (ra."player_count" - 1) + 0.5)::INTEGER
           + LEAST(ra."player_count" - 1, 9)
           + CASE WHEN rr."place" = 1 THEN 10 ELSE 0 END
         ELSE 0 END,
       'race', rr."id", rr."created_at"
FROM "race_results" rr
JOIN "races" ra ON ra."id" = rr."race_id"
WHERE rr."user_id" IS NOT NULL AND rr."finished" = true AND rr."place" IS NOT NULL AND rr."duration" IS NOT NULL
  AND pg_temp.st_test_xp(rr."duration", rr."wpm", rr."acc") > 0;

-- totals and levels: level = max L with round(10·(L−1)^2.3 + 40·(L−1)) ≤ xp
UPDATE "users" u SET "xp" = t.total
FROM (SELECT "user_id", SUM("amount")::INTEGER AS total FROM "xp_events" GROUP BY "user_id") t
WHERE u."id" = t."user_id";

UPDATE "users" u SET "level" = (
  SELECT MAX(l) FROM generate_series(1, 100) AS l
  WHERE FLOOR(10 * power(l - 1, 2.3) + 40 * (l - 1) + 0.5) <= u."xp"
);

-- daily streaks (gaps-and-islands over distinct Asia/Tashkent days with a valid test)
WITH d AS (
  SELECT DISTINCT "user_id", to_date("day_key"::TEXT, 'YYYYMMDD') AS dt FROM "results" WHERE "flagged" = false
), g AS (
  SELECT "user_id", dt, dt - (ROW_NUMBER() OVER (PARTITION BY "user_id" ORDER BY dt))::INTEGER AS grp FROM d
), isl AS (
  SELECT "user_id", grp, COUNT(*)::INTEGER AS len, MAX(dt) AS last FROM g GROUP BY "user_id", grp
), agg AS (
  SELECT "user_id", MAX(len) AS best, (ARRAY_AGG(len ORDER BY last DESC))[1] AS cur, MAX(last) AS last FROM isl GROUP BY "user_id"
)
UPDATE "users" u
SET "streak_best" = agg.best, "streak_current" = agg.cur, "last_active_day" = to_char(agg.last, 'YYYYMMDD')::INTEGER
FROM agg WHERE u."id" = agg."user_id";
