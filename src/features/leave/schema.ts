import { z } from "zod";

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "YYYY-MM-DD 形式");

export const submitLeaveSchema = z
  .object({
    type: z.enum(["PAID", "ABSENCE", "SPECIAL_UNPAID"]),
    startDate: isoDate,
    endDate: isoDate,
    dayPart: z.enum(["FULL", "AM", "PM"]).default("FULL"),
    reason: z.string().min(1, "理由を入力してください").max(500),
  })
  .refine((v) => v.startDate <= v.endDate, {
    path: ["endDate"],
    message: "終了日は開始日以降にしてください",
  })
  .refine((v) => v.dayPart === "FULL" || v.startDate === v.endDate, {
    path: ["dayPart"],
    message: "半休は単日でのみ指定できます",
  });
export type SubmitLeaveInput = z.infer<typeof submitLeaveSchema>;

export const leaveCancellationSchema = z.object({
  requestId: z.string().uuid(),
  reason: z.string().min(1, "取消理由を入力してください").max(500),
});

export const decisionSchema = z.object({
  requestId: z.string().uuid(),
  comment: z.string().max(500).optional(),
});
export const rejectSchema = z.object({
  requestId: z.string().uuid(),
  comment: z.string().min(1, "却下理由を入力してください").max(500),
});
