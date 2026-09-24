-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "username" VARCHAR(24) NOT NULL,
    "username_lower" VARCHAR(24) NOT NULL,
    "email" VARCHAR(254),
    "password_hash" TEXT NOT NULL,
    "settings" JSONB,
    "settings_at" TIMESTAMP(3),
    "tests_started" INTEGER NOT NULL DEFAULT 0,
    "tests_completed" INTEGER NOT NULL DEFAULT 0,
    "time_typing" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "races_completed" INTEGER NOT NULL DEFAULT 0,
    "race_wins" INTEGER NOT NULL DEFAULT 0,
    "banned" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sessions" (
    "id" VARCHAR(64) NOT NULL,
    "user_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "rotated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_seen_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "user_agent" VARCHAR(300),
    "ip" VARCHAR(64),

    CONSTRAINT "sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "results" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "mode" VARCHAR(8) NOT NULL,
    "mode2" VARCHAR(16) NOT NULL,
    "language" VARCHAR(24) NOT NULL,
    "punctuation" BOOLEAN NOT NULL DEFAULT false,
    "numbers" BOOLEAN NOT NULL DEFAULT false,
    "wpm" DOUBLE PRECISION NOT NULL,
    "raw" DOUBLE PRECISION NOT NULL,
    "acc" DOUBLE PRECISION NOT NULL,
    "consistency" DOUBLE PRECISION NOT NULL,
    "char_correct" INTEGER NOT NULL,
    "char_incorrect" INTEGER NOT NULL,
    "char_extra" INTEGER NOT NULL,
    "char_missed" INTEGER NOT NULL,
    "duration" DOUBLE PRECISION NOT NULL,
    "wpm_history" JSONB,
    "raw_history" JSONB,
    "error_history" JSONB,
    "is_pb" BOOLEAN NOT NULL DEFAULT false,
    "flagged" BOOLEAN NOT NULL DEFAULT false,
    "flag_reason" VARCHAR(120),
    "day_key" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "results_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "leaderboard_bests" (
    "id" TEXT NOT NULL,
    "board" VARCHAR(40) NOT NULL,
    "user_id" TEXT NOT NULL,
    "result_id" TEXT NOT NULL,
    "wpm" DOUBLE PRECISION NOT NULL,
    "raw" DOUBLE PRECISION NOT NULL,
    "acc" DOUBLE PRECISION NOT NULL,
    "consistency" DOUBLE PRECISION NOT NULL,
    "achieved_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "leaderboard_bests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "races" (
    "id" TEXT NOT NULL,
    "code" VARCHAR(12) NOT NULL,
    "language" VARCHAR(24) NOT NULL,
    "text_type" VARCHAR(8) NOT NULL,
    "text_length" INTEGER NOT NULL,
    "is_public" BOOLEAN NOT NULL,
    "player_count" INTEGER NOT NULL,
    "started_at" TIMESTAMP(3) NOT NULL,
    "finished_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "races_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "race_results" (
    "id" TEXT NOT NULL,
    "race_id" TEXT NOT NULL,
    "user_id" TEXT,
    "nickname" VARCHAR(24) NOT NULL,
    "place" INTEGER,
    "wpm" DOUBLE PRECISION NOT NULL,
    "acc" DOUBLE PRECISION NOT NULL,
    "finished" BOOLEAN NOT NULL,
    "duration" DOUBLE PRECISION,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "race_results_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_username_lower_key" ON "users"("username_lower");

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE INDEX "sessions_user_id_idx" ON "sessions"("user_id");

-- CreateIndex
CREATE INDEX "sessions_expires_at_idx" ON "sessions"("expires_at");

-- CreateIndex
CREATE INDEX "results_user_id_created_at_idx" ON "results"("user_id", "created_at" DESC);

-- CreateIndex
CREATE INDEX "results_user_id_mode_mode2_language_punctuation_numbers_wpm_idx" ON "results"("user_id", "mode", "mode2", "language", "punctuation", "numbers", "wpm" DESC);

-- CreateIndex
CREATE INDEX "results_day_key_mode_mode2_language_wpm_idx" ON "results"("day_key", "mode", "mode2", "language", "wpm" DESC);

-- CreateIndex
CREATE INDEX "leaderboard_bests_board_wpm_achieved_at_idx" ON "leaderboard_bests"("board", "wpm" DESC, "achieved_at");

-- CreateIndex
CREATE UNIQUE INDEX "leaderboard_bests_board_user_id_key" ON "leaderboard_bests"("board", "user_id");

-- CreateIndex
CREATE INDEX "races_finished_at_idx" ON "races"("finished_at");

-- CreateIndex
CREATE INDEX "race_results_user_id_created_at_idx" ON "race_results"("user_id", "created_at" DESC);

-- CreateIndex
CREATE INDEX "race_results_race_id_idx" ON "race_results"("race_id");

-- AddForeignKey
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "results" ADD CONSTRAINT "results_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "leaderboard_bests" ADD CONSTRAINT "leaderboard_bests_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "race_results" ADD CONSTRAINT "race_results_race_id_fkey" FOREIGN KEY ("race_id") REFERENCES "races"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "race_results" ADD CONSTRAINT "race_results_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
