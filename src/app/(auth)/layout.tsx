export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="dark:via-background flex min-h-full flex-1 items-center justify-center bg-gradient-to-br from-cyan-100 via-slate-50 to-blue-100 px-4 py-12 dark:from-cyan-950/40 dark:to-blue-950/40">
      <div className="w-full max-w-sm">
        <p className="brand-gradient-text mb-6 text-center text-3xl font-bold tracking-tight">
          RexClock
        </p>
        {children}
      </div>
    </div>
  );
}
