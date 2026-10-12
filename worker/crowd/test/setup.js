// טווח סקרים קבוע לבדיקות (src/data משתנה עם כל רענון): 0–120 לכל רשימה ⇐ כלל הטווח לא מסמן כלום.
// בדיקות כלל הטווח עצמו קובעות טווח משלהן (moderation.test.js).
import { beforeEach } from "vitest";
import { setPollRanges } from "../lib/moderation.js";
import { LISTS_2026 } from "../lib/lists.js";
export const TEST_RANGES = Object.fromEntries(LISTS_2026.map((l) => [l.id, { lo: 0, hi: 120 }]));
beforeEach(() => setPollRanges(TEST_RANGES));
