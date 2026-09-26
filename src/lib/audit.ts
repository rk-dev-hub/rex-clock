import type { Prisma, AuditAction } from "@prisma/client";

type AuditInput = {
  actorId: string;
  action: AuditAction;
  targetType: string;
  targetId?: string | null;
  subjectUserId?: string | null;
  before?: Prisma.InputJsonValue | null;
  after?: Prisma.InputJsonValue | null;
  comment?: string | null;
};

/**
 * 監査ログを記録する。必ず write 系操作と同一トランザクション内で呼ぶこと。
 * 第 1 引数はトランザクションクライアント（prisma.$transaction のコールバック引数）。
 */
export function recordAudit(
  tx: Prisma.TransactionClient,
  input: AuditInput,
): Promise<{ id: string }> {
  return tx.auditLog.create({
    data: {
      actorId: input.actorId,
      action: input.action,
      targetType: input.targetType,
      targetId: input.targetId ?? null,
      subjectUserId: input.subjectUserId ?? null,
      before: input.before ?? undefined,
      after: input.after ?? undefined,
      comment: input.comment ?? null,
    },
    select: { id: true },
  });
}
