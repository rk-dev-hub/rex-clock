import { z } from "zod";

const roleEnum = z.enum(["EMPLOYEE", "ADMIN"]);
const employmentEnum = z.enum(["FULL_TIME", "PART_TIME", "CONTRACT"]);
const isoDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "YYYY-MM-DD 形式で入力してください");

export const createUserSchema = z.object({
  name: z.string().min(1, "氏名を入力してください").max(100),
  email: z.string().min(1, "メールアドレスを入力してください").email(),
  employeeCode: z
    .string()
    .min(1, "社員番号を入力してください")
    .max(32)
    .regex(/^[A-Za-z0-9_-]+$/, "英数字・ハイフン・アンダースコアのみ"),
  hireDate: isoDate,
  employmentType: employmentEnum.default("FULL_TIME"),
  role: roleEnum.default("EMPLOYEE"),
  workPatternId: z.string().uuid().optional().or(z.literal("")),
  // 空なら自動生成
  initialPassword: z
    .string()
    .min(8, "8 文字以上、または空欄で自動生成")
    .optional()
    .or(z.literal("")),
});
export type CreateUserInput = z.infer<typeof createUserSchema>;

export const resetPasswordSchema = z.object({
  userId: z.string().uuid(),
  initialPassword: z.string().min(8).optional().or(z.literal("")),
});

export const setStatusSchema = z.object({
  userId: z.string().uuid(),
  status: z.enum(["ACTIVE", "DISABLED"]),
});
