import type { RequestStatus } from "@prisma/client";

// docs/01 FR-M2/W2、docs/03。申請の状態遷移（純粋関数）。

export type Action = "SUBMIT" | "CANCEL" | "APPROVE" | "REJECT";

const ALLOWED: Record<Action, RequestStatus[]> = {
  SUBMIT: ["DRAFT"],
  CANCEL: ["DRAFT", "PENDING"],
  APPROVE: ["PENDING"],
  REJECT: ["PENDING"],
};

const NEXT: Record<Action, RequestStatus> = {
  SUBMIT: "PENDING",
  CANCEL: "CANCELED",
  APPROVE: "APPROVED",
  REJECT: "REJECTED",
};

export function canTransition(from: RequestStatus, action: Action): boolean {
  return ALLOWED[action].includes(from);
}

export function nextStatus(action: Action): RequestStatus {
  return NEXT[action];
}
