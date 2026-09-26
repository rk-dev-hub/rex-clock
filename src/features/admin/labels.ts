import type { EmploymentType, Role, UserStatus } from "@prisma/client";

export const roleLabel: Record<Role, string> = {
  EMPLOYEE: "従業員",
  ADMIN: "管理者",
};

export const employmentLabel: Record<EmploymentType, string> = {
  FULL_TIME: "正社員",
  PART_TIME: "パート",
  CONTRACT: "契約",
};

export const statusLabel: Record<UserStatus, string> = {
  ACTIVE: "有効",
  DISABLED: "無効",
};
