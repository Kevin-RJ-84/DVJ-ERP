-- Part 7.4 (CHANGES-6): one-time backfill MemoEndDate from MemoDate + Terms
UPDATE memo
SET "MemoEndDate" = "MemoDate" + ("Terms" * INTERVAL '1 day')
WHERE "Terms" > 0
  AND (
    "MemoEndDate" IS NULL
    OR "MemoEndDate" <> "MemoDate" + ("Terms" * INTERVAL '1 day')
  );
