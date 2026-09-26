"use client";

import { useRouter, useSearchParams } from "next/navigation";

export function UserPicker({
  users,
  current,
}: {
  users: { id: string; name: string; employeeCode: string }[];
  current: string;
}) {
  const router = useRouter();
  const sp = useSearchParams();

  return (
    <label className="flex items-center gap-2 text-sm">
      <span className="text-muted-foreground">対象者</span>
      <select
        value={current}
        onChange={(e) => {
          const next = new URLSearchParams(sp);
          next.set("user", e.target.value);
          router.push(`/reports?${next.toString()}`);
        }}
        className="border-input bg-background h-9 rounded-md border px-2 text-sm"
      >
        {users.map((u) => (
          <option key={u.id} value={u.id}>
            {u.employeeCode} {u.name}
          </option>
        ))}
      </select>
    </label>
  );
}
