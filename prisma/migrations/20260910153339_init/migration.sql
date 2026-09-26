-- CreateEnum
CREATE TYPE "Role" AS ENUM ('EMPLOYEE', 'ADMIN');

-- CreateEnum
CREATE TYPE "EmploymentType" AS ENUM ('FULL_TIME', 'PART_TIME', 'CONTRACT');

-- CreateEnum
CREATE TYPE "UserStatus" AS ENUM ('ACTIVE', 'DISABLED');

-- CreateEnum
CREATE TYPE "ClockType" AS ENUM ('CLOCK_IN', 'CLOCK_OUT', 'BREAK_START', 'BREAK_END');

-- CreateEnum
CREATE TYPE "ClockSource" AS ENUM ('SELF', 'ADMIN_PROXY', 'CORRECTION');

-- CreateEnum
CREATE TYPE "RequestStatus" AS ENUM ('DRAFT', 'PENDING', 'APPROVED', 'REJECTED', 'CANCELED');

-- CreateEnum
CREATE TYPE "CorrectionOp" AS ENUM ('ADD', 'UPDATE', 'DELETE');

-- CreateEnum
CREATE TYPE "LeaveType" AS ENUM ('PAID', 'ABSENCE', 'SPECIAL_UNPAID');

-- CreateEnum
CREATE TYPE "LeaveDayPart" AS ENUM ('FULL', 'AM', 'PM');

-- CreateEnum
CREATE TYPE "LeaveRequestKind" AS ENUM ('TAKE', 'CANCELLATION');

-- CreateEnum
CREATE TYPE "LeaveLedgerKind" AS ENUM ('GRANT', 'CONSUME', 'EXPIRE', 'ADJUST');

-- CreateEnum
CREATE TYPE "DayType" AS ENUM ('WORKDAY', 'PRESCRIBED_HOLIDAY', 'LEGAL_HOLIDAY');

-- CreateEnum
CREATE TYPE "ClosingStatus" AS ENUM ('OPEN', 'CLOSED');

-- CreateEnum
CREATE TYPE "BreakPolicy" AS ENUM ('ACTUAL', 'AUTO_DEDUCT');

-- CreateEnum
CREATE TYPE "HolidaySource" AS ENUM ('BUILTIN', 'MANUAL');

-- CreateEnum
CREATE TYPE "AuditAction" AS ENUM ('CLOCK_EDIT', 'APPROVE', 'REJECT', 'CLOSE', 'REOPEN', 'USER_CREATE', 'USER_DISABLE', 'PASSWORD_RESET', 'MASTER_CHANGE', 'LEAVE_GRANT');

-- CreateTable
CREATE TABLE "WorkRule" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL DEFAULT '標準',
    "isDefault" BOOLEAN NOT NULL DEFAULT true,
    "standardDailyMinutes" INTEGER NOT NULL DEFAULT 480,
    "closingDay" INTEGER NOT NULL DEFAULT 31,
    "weekStartsOn" INTEGER NOT NULL DEFAULT 1,
    "overtimeRatePct" INTEGER NOT NULL DEFAULT 25,
    "nightRatePct" INTEGER NOT NULL DEFAULT 25,
    "legalHolidayRatePct" INTEGER NOT NULL DEFAULT 35,
    "over60hRatePct" INTEGER NOT NULL DEFAULT 50,
    "nightStart" TEXT NOT NULL DEFAULT '22:00',
    "nightEnd" TEXT NOT NULL DEFAULT '05:00',
    "breakPolicy" "BreakPolicy" NOT NULL DEFAULT 'ACTUAL',
    "autoBreakRules" JSONB NOT NULL DEFAULT '[{"overMinutes":360,"breakMinutes":45},{"overMinutes":480,"breakMinutes":60}]',
    "roundingUnitMinutes" INTEGER NOT NULL DEFAULT 1,
    "legalHolidayWeekday" INTEGER NOT NULL DEFAULT 0,
    "prescribedHolidayWeekdays" INTEGER[] DEFAULT ARRAY[6]::INTEGER[],
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "WorkRule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WorkPattern" (
    "id" UUID NOT NULL,
    "workRuleId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "WorkPattern_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WorkPatternDay" (
    "id" UUID NOT NULL,
    "workPatternId" UUID NOT NULL,
    "weekday" INTEGER NOT NULL,
    "isWorkday" BOOLEAN NOT NULL DEFAULT true,
    "startTime" TEXT NOT NULL DEFAULT '09:00',
    "endTime" TEXT NOT NULL DEFAULT '18:00',
    "breakMinutes" INTEGER NOT NULL DEFAULT 60,
    "prescribedMinutes" INTEGER NOT NULL DEFAULT 480,

    CONSTRAINT "WorkPatternDay_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "User" (
    "id" UUID NOT NULL,
    "employeeCode" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "role" "Role" NOT NULL DEFAULT 'EMPLOYEE',
    "employmentType" "EmploymentType" NOT NULL DEFAULT 'FULL_TIME',
    "status" "UserStatus" NOT NULL DEFAULT 'ACTIVE',
    "hireDate" DATE NOT NULL,
    "workPatternId" UUID NOT NULL,
    "mustChangePassword" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TimeClockEvent" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "type" "ClockType" NOT NULL,
    "occurredAt" TIMESTAMPTZ(6) NOT NULL,
    "businessDate" DATE NOT NULL,
    "source" "ClockSource" NOT NULL DEFAULT 'SELF',
    "canceled" BOOLEAN NOT NULL DEFAULT false,
    "correctionRequestId" UUID,
    "createdById" UUID NOT NULL,
    "note" TEXT,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TimeClockEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DailySummary" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "workDate" DATE NOT NULL,
    "dayType" "DayType" NOT NULL,
    "firstIn" TIMESTAMPTZ(6),
    "lastOut" TIMESTAMPTZ(6),
    "breakMinutes" INTEGER NOT NULL DEFAULT 0,
    "workedMinutes" INTEGER NOT NULL DEFAULT 0,
    "prescribedMinutes" INTEGER NOT NULL DEFAULT 0,
    "withinStatutoryOtMinutes" INTEGER NOT NULL DEFAULT 0,
    "overStatutoryOtMinutes" INTEGER NOT NULL DEFAULT 0,
    "nightMinutes" INTEGER NOT NULL DEFAULT 0,
    "legalHolidayMinutes" INTEGER NOT NULL DEFAULT 0,
    "lateMinutes" INTEGER NOT NULL DEFAULT 0,
    "earlyLeaveMinutes" INTEGER NOT NULL DEFAULT 0,
    "leaveType" "LeaveType",
    "leaveDayPart" "LeaveDayPart",
    "paidLeaveCountedMinutes" INTEGER NOT NULL DEFAULT 0,
    "flags" JSONB NOT NULL DEFAULT '[]',
    "closingPeriodId" UUID,
    "computedAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DailySummary_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MonthlyAggregate" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "periodStart" DATE NOT NULL,
    "periodEnd" DATE NOT NULL,
    "workDays" INTEGER NOT NULL DEFAULT 0,
    "absenceDays" INTEGER NOT NULL DEFAULT 0,
    "paidLeaveFullDays" INTEGER NOT NULL DEFAULT 0,
    "paidLeaveHalfDays" INTEGER NOT NULL DEFAULT 0,
    "totalWorkedMinutes" INTEGER NOT NULL DEFAULT 0,
    "withinPrescribedMinutes" INTEGER NOT NULL DEFAULT 0,
    "withinStatutoryOtMinutes" INTEGER NOT NULL DEFAULT 0,
    "overtime25Minutes" INTEGER NOT NULL DEFAULT 0,
    "overtime50Minutes" INTEGER NOT NULL DEFAULT 0,
    "nightMinutes" INTEGER NOT NULL DEFAULT 0,
    "legalHolidayMinutes" INTEGER NOT NULL DEFAULT 0,
    "lateCount" INTEGER NOT NULL DEFAULT 0,
    "lateMinutes" INTEGER NOT NULL DEFAULT 0,
    "earlyLeaveCount" INTEGER NOT NULL DEFAULT 0,
    "earlyLeaveMinutes" INTEGER NOT NULL DEFAULT 0,
    "breakMinutes" INTEGER NOT NULL DEFAULT 0,
    "stale" BOOLEAN NOT NULL DEFAULT true,
    "computedAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MonthlyAggregate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CorrectionRequest" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "targetDate" DATE NOT NULL,
    "status" "RequestStatus" NOT NULL DEFAULT 'DRAFT',
    "reason" TEXT NOT NULL,
    "approverId" UUID,
    "decidedAt" TIMESTAMPTZ(6),
    "decisionComment" TEXT,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "CorrectionRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CorrectionLine" (
    "id" UUID NOT NULL,
    "requestId" UUID NOT NULL,
    "op" "CorrectionOp" NOT NULL,
    "targetEventId" UUID,
    "clockType" "ClockType",
    "occurredAt" TIMESTAMPTZ(6),

    CONSTRAINT "CorrectionLine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LeaveRequest" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "kind" "LeaveRequestKind" NOT NULL DEFAULT 'TAKE',
    "type" "LeaveType" NOT NULL,
    "startDate" DATE NOT NULL,
    "endDate" DATE NOT NULL,
    "dayPart" "LeaveDayPart" NOT NULL DEFAULT 'FULL',
    "reason" TEXT NOT NULL,
    "status" "RequestStatus" NOT NULL DEFAULT 'PENDING',
    "approverId" UUID,
    "decidedAt" TIMESTAMPTZ(6),
    "decisionComment" TEXT,
    "supersededById" UUID,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "LeaveRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LeaveGrant" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "grantedDays" DECIMAL(4,1) NOT NULL,
    "grantDate" DATE NOT NULL,
    "expiryDate" DATE NOT NULL,
    "reason" TEXT NOT NULL,
    "createdById" UUID NOT NULL,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LeaveGrant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LeaveLedger" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "kind" "LeaveLedgerKind" NOT NULL,
    "days" DECIMAL(4,1) NOT NULL,
    "effectiveDate" DATE NOT NULL,
    "grantId" UUID,
    "leaveRequestId" UUID,
    "note" TEXT,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LeaveLedger_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Holiday" (
    "id" UUID NOT NULL,
    "date" DATE NOT NULL,
    "name" TEXT NOT NULL,
    "source" "HolidaySource" NOT NULL DEFAULT 'BUILTIN',

    CONSTRAINT "Holiday_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CalendarDay" (
    "id" UUID NOT NULL,
    "workRuleId" UUID NOT NULL,
    "date" DATE NOT NULL,
    "dayType" "DayType" NOT NULL,
    "isHoliday" BOOLEAN NOT NULL DEFAULT false,
    "label" TEXT,
    "overrideReason" TEXT,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "CalendarDay_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ClosingPeriod" (
    "id" UUID NOT NULL,
    "periodStart" DATE NOT NULL,
    "periodEnd" DATE NOT NULL,
    "status" "ClosingStatus" NOT NULL DEFAULT 'OPEN',
    "closedById" UUID,
    "closedAt" TIMESTAMPTZ(6),
    "reopenedById" UUID,
    "reopenedAt" TIMESTAMPTZ(6),
    "note" TEXT,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "ClosingPeriod_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" UUID NOT NULL,
    "actorId" UUID NOT NULL,
    "action" "AuditAction" NOT NULL,
    "targetType" TEXT NOT NULL,
    "targetId" TEXT,
    "subjectUserId" UUID,
    "before" JSONB,
    "after" JSONB,
    "comment" TEXT,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "WorkPattern_workRuleId_idx" ON "WorkPattern"("workRuleId");

-- CreateIndex
CREATE UNIQUE INDEX "WorkPatternDay_workPatternId_weekday_key" ON "WorkPatternDay"("workPatternId", "weekday");

-- CreateIndex
CREATE UNIQUE INDEX "User_employeeCode_key" ON "User"("employeeCode");

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE INDEX "User_status_idx" ON "User"("status");

-- CreateIndex
CREATE INDEX "User_role_idx" ON "User"("role");

-- CreateIndex
CREATE INDEX "TimeClockEvent_userId_businessDate_idx" ON "TimeClockEvent"("userId", "businessDate");

-- CreateIndex
CREATE INDEX "TimeClockEvent_userId_occurredAt_idx" ON "TimeClockEvent"("userId", "occurredAt");

-- CreateIndex
CREATE INDEX "TimeClockEvent_businessDate_idx" ON "TimeClockEvent"("businessDate");

-- CreateIndex
CREATE INDEX "TimeClockEvent_correctionRequestId_idx" ON "TimeClockEvent"("correctionRequestId");

-- CreateIndex
CREATE INDEX "TimeClockEvent_canceled_idx" ON "TimeClockEvent"("canceled");

-- CreateIndex
CREATE INDEX "DailySummary_workDate_idx" ON "DailySummary"("workDate");

-- CreateIndex
CREATE INDEX "DailySummary_closingPeriodId_idx" ON "DailySummary"("closingPeriodId");

-- CreateIndex
CREATE UNIQUE INDEX "DailySummary_userId_workDate_key" ON "DailySummary"("userId", "workDate");

-- CreateIndex
CREATE INDEX "MonthlyAggregate_periodStart_idx" ON "MonthlyAggregate"("periodStart");

-- CreateIndex
CREATE INDEX "MonthlyAggregate_stale_idx" ON "MonthlyAggregate"("stale");

-- CreateIndex
CREATE UNIQUE INDEX "MonthlyAggregate_userId_periodStart_key" ON "MonthlyAggregate"("userId", "periodStart");

-- CreateIndex
CREATE INDEX "CorrectionRequest_userId_targetDate_idx" ON "CorrectionRequest"("userId", "targetDate");

-- CreateIndex
CREATE INDEX "CorrectionRequest_status_idx" ON "CorrectionRequest"("status");

-- CreateIndex
CREATE INDEX "CorrectionLine_requestId_idx" ON "CorrectionLine"("requestId");

-- CreateIndex
CREATE INDEX "CorrectionLine_targetEventId_idx" ON "CorrectionLine"("targetEventId");

-- CreateIndex
CREATE INDEX "LeaveRequest_userId_startDate_idx" ON "LeaveRequest"("userId", "startDate");

-- CreateIndex
CREATE INDEX "LeaveRequest_status_idx" ON "LeaveRequest"("status");

-- CreateIndex
CREATE INDEX "LeaveGrant_userId_expiryDate_idx" ON "LeaveGrant"("userId", "expiryDate");

-- CreateIndex
CREATE INDEX "LeaveLedger_userId_effectiveDate_idx" ON "LeaveLedger"("userId", "effectiveDate");

-- CreateIndex
CREATE INDEX "LeaveLedger_grantId_idx" ON "LeaveLedger"("grantId");

-- CreateIndex
CREATE INDEX "LeaveLedger_leaveRequestId_idx" ON "LeaveLedger"("leaveRequestId");

-- CreateIndex
CREATE UNIQUE INDEX "Holiday_date_key" ON "Holiday"("date");

-- CreateIndex
CREATE INDEX "CalendarDay_date_idx" ON "CalendarDay"("date");

-- CreateIndex
CREATE UNIQUE INDEX "CalendarDay_workRuleId_date_key" ON "CalendarDay"("workRuleId", "date");

-- CreateIndex
CREATE UNIQUE INDEX "ClosingPeriod_periodStart_key" ON "ClosingPeriod"("periodStart");

-- CreateIndex
CREATE INDEX "ClosingPeriod_status_idx" ON "ClosingPeriod"("status");

-- CreateIndex
CREATE INDEX "AuditLog_createdAt_idx" ON "AuditLog"("createdAt");

-- CreateIndex
CREATE INDEX "AuditLog_subjectUserId_createdAt_idx" ON "AuditLog"("subjectUserId", "createdAt");

-- CreateIndex
CREATE INDEX "AuditLog_action_idx" ON "AuditLog"("action");

-- AddForeignKey
ALTER TABLE "WorkPattern" ADD CONSTRAINT "WorkPattern_workRuleId_fkey" FOREIGN KEY ("workRuleId") REFERENCES "WorkRule"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkPatternDay" ADD CONSTRAINT "WorkPatternDay_workPatternId_fkey" FOREIGN KEY ("workPatternId") REFERENCES "WorkPattern"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_workPatternId_fkey" FOREIGN KEY ("workPatternId") REFERENCES "WorkPattern"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TimeClockEvent" ADD CONSTRAINT "TimeClockEvent_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TimeClockEvent" ADD CONSTRAINT "TimeClockEvent_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TimeClockEvent" ADD CONSTRAINT "TimeClockEvent_correctionRequestId_fkey" FOREIGN KEY ("correctionRequestId") REFERENCES "CorrectionRequest"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DailySummary" ADD CONSTRAINT "DailySummary_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DailySummary" ADD CONSTRAINT "DailySummary_closingPeriodId_fkey" FOREIGN KEY ("closingPeriodId") REFERENCES "ClosingPeriod"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MonthlyAggregate" ADD CONSTRAINT "MonthlyAggregate_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CorrectionRequest" ADD CONSTRAINT "CorrectionRequest_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CorrectionRequest" ADD CONSTRAINT "CorrectionRequest_approverId_fkey" FOREIGN KEY ("approverId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CorrectionLine" ADD CONSTRAINT "CorrectionLine_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "CorrectionRequest"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CorrectionLine" ADD CONSTRAINT "CorrectionLine_targetEventId_fkey" FOREIGN KEY ("targetEventId") REFERENCES "TimeClockEvent"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeaveRequest" ADD CONSTRAINT "LeaveRequest_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeaveRequest" ADD CONSTRAINT "LeaveRequest_approverId_fkey" FOREIGN KEY ("approverId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeaveRequest" ADD CONSTRAINT "LeaveRequest_supersededById_fkey" FOREIGN KEY ("supersededById") REFERENCES "LeaveRequest"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeaveGrant" ADD CONSTRAINT "LeaveGrant_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeaveGrant" ADD CONSTRAINT "LeaveGrant_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeaveLedger" ADD CONSTRAINT "LeaveLedger_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeaveLedger" ADD CONSTRAINT "LeaveLedger_grantId_fkey" FOREIGN KEY ("grantId") REFERENCES "LeaveGrant"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeaveLedger" ADD CONSTRAINT "LeaveLedger_leaveRequestId_fkey" FOREIGN KEY ("leaveRequestId") REFERENCES "LeaveRequest"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CalendarDay" ADD CONSTRAINT "CalendarDay_workRuleId_fkey" FOREIGN KEY ("workRuleId") REFERENCES "WorkRule"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClosingPeriod" ADD CONSTRAINT "ClosingPeriod_closedById_fkey" FOREIGN KEY ("closedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClosingPeriod" ADD CONSTRAINT "ClosingPeriod_reopenedById_fkey" FOREIGN KEY ("reopenedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_subjectUserId_fkey" FOREIGN KEY ("subjectUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
