import { z } from "zod";

const clockType = z.enum(["CLOCK_IN", "CLOCK_OUT", "BREAK_START", "BREAK_END"]);
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "YYYY-MM-DD 形式");

export const correctionLineSchema = z.object({
  op: z.enum(["ADD", "UPDATE", "DELETE"]),
  targetEventId: z.string().uuid().optional().nullable(),
  clockType: clockType.optional().nullable(),
  // 'HH:mm'（対象日 JST）または翌日を示す '+1 HH:mm'
  time: z
    .string()
    .regex(/^(\+1 )?\d{2}:\d{2}$/)
    .optional()
    .nullable(),
});
export type CorrectionLineForm = z.infer<typeof correctionLineSchema>;

export const submitCorrectionSchema = z.object({
  targetDate: isoDate,
  reason: z.string().min(1, "理由を入力してください").max(500),
  lines: z
    .array(correctionLineSchema)
    .min(1, "明細を 1 件以上追加してください"),
});
export type SubmitCorrectionInput = z.infer<typeof submitCorrectionSchema>;

export const decisionSchema = z.object({
  requestId: z.string().uuid(),
  comment: z.string().max(500).optional(),
});
