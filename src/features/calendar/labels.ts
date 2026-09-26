import type { DayType } from "@prisma/client";

export const dayTypeLabel: Record<DayType, string> = {
  WORKDAY: "平日",
  PRESCRIBED_HOLIDAY: "所定休日",
  LEGAL_HOLIDAY: "法定休日",
};

export const dayTypeBadgeVariant: Record<
  DayType,
  "default" | "outline" | "warning" | "destructive"
> = {
  WORKDAY: "outline",
  PRESCRIBED_HOLIDAY: "warning",
  LEGAL_HOLIDAY: "destructive",
};
