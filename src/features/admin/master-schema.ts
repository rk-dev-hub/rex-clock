import { z } from "zod";

const hhmm = z.string().regex(/^\d{2}:\d{2}$/, "HH:mm 形式");
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "YYYY-MM-DD 形式");
const pct = z.coerce.number().int().min(0).max(200);

export const updateWorkRuleSchema = z.object({
  standardDailyMinutes: z.coerce.number().int().min(1).max(1440),
  closingDay: z.coerce.number().int().min(1).max(31),
  weekStartsOn: z.coerce.number().int().min(0).max(6),
  overtimeRatePct: pct,
  nightRatePct: pct,
  legalHolidayRatePct: pct,
  over60hRatePct: pct,
  nightStart: hhmm,
  nightEnd: hhmm,
  breakPolicy: z.enum(["ACTUAL", "AUTO_DEDUCT"]),
  legalHolidayWeekday: z.coerce.number().int().min(0).max(6),
  // "6" / "0,6" のようなカンマ区切り
  prescribedHolidayWeekdays: z
    .string()
    .regex(/^(\s*[0-6]\s*)(,\s*[0-6]\s*)*$/, "0〜6 をカンマ区切りで"),
});
export type UpdateWorkRuleInput = z.infer<typeof updateWorkRuleSchema>;

export const patternDaySchema = z.object({
  weekday: z.coerce.number().int().min(0).max(6),
  isWorkday: z.coerce.boolean(),
  startTime: hhmm,
  endTime: hhmm,
  breakMinutes: z.coerce.number().int().min(0).max(600),
  prescribedMinutes: z.coerce.number().int().min(0).max(1440),
});

export const upsertPatternSchema = z.object({
  patternId: z.string().uuid(),
  name: z.string().min(1).max(60),
  days: z.array(patternDaySchema).length(7),
});

export const overrideCalendarSchema = z.object({
  date: isoDate,
  dayType: z.enum(["WORKDAY", "PRESCRIBED_HOLIDAY", "LEGAL_HOLIDAY"]),
  isHoliday: z.coerce.boolean(),
  label: z.string().max(60).optional().or(z.literal("")),
  overrideReason: z.string().min(1, "理由を入力してください").max(200),
});

export const addLeaveGrantSchema = z
  .object({
    userId: z.string().uuid(),
    grantedDays: z.coerce.number().min(0.5).max(60),
    grantDate: isoDate,
    expiryDate: isoDate,
    reason: z.string().min(1, "理由を入力してください").max(200),
  })
  .refine((v) => v.grantDate < v.expiryDate, {
    path: ["expiryDate"],
    message: "失効日は付与日より後にしてください",
  })
  .refine((v) => Number.isInteger(v.grantedDays * 2), {
    path: ["grantedDays"],
    message: "0.5 日単位で入力してください",
  });

export const adjustLedgerSchema = z.object({
  userId: z.string().uuid(),
  days: z.coerce.number().refine((n) => n !== 0 && Number.isInteger(n * 2), {
    message: "0 以外・0.5 日単位",
  }),
  effectiveDate: isoDate,
  note: z.string().min(1, "理由を入力してください").max(200),
});

export const recomputeRangeSchema = z
  .object({
    from: isoDate,
    to: isoDate,
    userId: z.string().uuid().optional().or(z.literal("")),
  })
  .refine((v) => v.from <= v.to, {
    path: ["to"],
    message: "期間が逆転しています",
  });

export const periodActionSchema = z.object({
  periodStart: isoDate,
  reason: z.string().max(200).optional(),
});
export const reopenSchema = z.object({
  periodStart: isoDate,
  reason: z.string().min(1, "再オープン理由を入力してください").max(200),
});
