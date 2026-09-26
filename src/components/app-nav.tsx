"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { Role } from "@prisma/client";
import { ShieldCheck } from "lucide-react";
import { cn } from "@/lib/utils";

type NavItem = { href: string; label: string; adminOnly?: boolean };

const ITEMS: NavItem[] = [
  { href: "/", label: "打刻" },
  { href: "/attendance", label: "勤怠一覧" },
  { href: "/requests", label: "申請" },
  { href: "/reports", label: "勤務表" },
  { href: "/approvals", label: "承認待ち", adminOnly: true },
];

const ADMIN_ITEMS: NavItem[] = [
  { href: "/admin/users", label: "ユーザー" },
  { href: "/admin/work-rules", label: "就業規則" },
  { href: "/admin/patterns", label: "勤務パターン" },
  { href: "/admin/calendar", label: "休日カレンダー" },
  { href: "/admin/leave-grants", label: "有給付与" },
  { href: "/admin/closing", label: "月次締め" },
  { href: "/admin/audit", label: "監査ログ" },
];

export function AppNav({
  role,
  pendingCount = 0,
}: {
  role: Role;
  pendingCount?: number;
}) {
  const pathname = usePathname();
  const items = ITEMS.filter((i) => !i.adminOnly || role === "ADMIN");

  const renderItem = (item: NavItem) => {
    const active =
      item.href === "/"
        ? pathname === "/"
        : pathname === item.href || pathname.startsWith(`${item.href}/`);
    const badge =
      item.href === "/approvals" && pendingCount > 0 ? pendingCount : null;
    return (
      <Link
        key={item.href}
        href={item.href}
        aria-current={active ? "page" : undefined}
        className={cn(
          "flex items-center justify-between rounded-lg px-3 py-2 text-sm font-medium transition",
          active
            ? "brand-gradient text-primary-foreground shadow-sm shadow-sky-950/20"
            : "text-muted-foreground hover:bg-accent hover:text-accent-foreground",
        )}
      >
        <span>{item.label}</span>
        {badge ? (
          <span
            className={cn(
              "tabular ml-2 rounded-full px-1.5 text-xs",
              active
                ? "bg-primary-foreground/20"
                : "bg-warning/25 text-warning-foreground",
            )}
          >
            {badge}
          </span>
        ) : null}
      </Link>
    );
  };

  return (
    <nav className="flex flex-col gap-1">
      {items.map(renderItem)}
      {role === "ADMIN" ? (
        <>
          <div className="border-border mt-3 flex items-center gap-1.5 border-t px-3 pt-3 pb-1">
            <ShieldCheck className="text-muted-foreground size-3.5" />
            <span className="text-muted-foreground text-xs font-semibold tracking-wide uppercase">
              管理者機能
            </span>
          </div>
          {ADMIN_ITEMS.map(renderItem)}
        </>
      ) : null}
    </nav>
  );
}
