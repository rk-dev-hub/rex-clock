"use client";

import { useTransition } from "react";
import { logoutAction } from "@/features/auth/actions";
import { Button } from "@/components/ui/button";

export function LogoutButton() {
  const [pending, start] = useTransition();
  return (
    <Button
      variant="ghost"
      size="sm"
      disabled={pending}
      onClick={() => start(() => logoutAction())}
    >
      {pending ? "ログアウト中…" : "ログアウト"}
    </Button>
  );
}
