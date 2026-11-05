import { Logo } from "@/components/shared/app-shell";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-8 bg-muted/30 p-4">
      <Logo className="text-xl" />
      <div className="w-full max-w-sm">{children}</div>
    </div>
  );
}
