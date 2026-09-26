import type { LeaveDayPart, LeaveType, RequestStatus } from "@prisma/client";

// 純粋なラベル関数のみ。auth / prisma を import しないこと（クライアント・テストから使う）。

export function leaveTypeLabel(t: LeaveType): string {
  return t === "PAID" ? "有給" : t === "ABSENCE" ? "欠勤" : "特別休暇(無給)";
}

export function dayPartLabel(p: LeaveDayPart): string {
  return p === "FULL" ? "全日" : p === "AM" ? "午前半休" : "午後半休";
}

export function statusLabel(s: RequestStatus): string {
  return {
    DRAFT: "下書き",
    PENDING: "申請中",
    APPROVED: "承認",
    REJECTED: "却下",
    CANCELED: "取消",
  }[s];
}
