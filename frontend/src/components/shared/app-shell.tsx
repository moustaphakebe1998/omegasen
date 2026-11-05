"use client";

import { ChefHat, LogOut, Menu, Shield, Store, UserRound } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { useAuth } from "@/lib/auth";
import { ROLE } from "@/lib/labels";
import { cn } from "@/lib/utils";

export type NavItem = { href: string; label: string; icon: React.ComponentType<{ className?: string }>; exact?: boolean };

export function Logo({ className }: { className?: string }) {
  return (
    <Link href="/" className={cn("flex items-center gap-2 font-black tracking-tight", className)}>
      <span className="flex size-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
        <ChefHat className="size-5" />
      </span>
      <span>OmegaSen</span>
    </Link>
  );
}

function NavLinks({ items, onNavigate }: { items: NavItem[]; onNavigate?: () => void }) {
  const pathname = usePathname();
  return (
    <nav className="grid gap-1" aria-label="Navigation principale">
      {items.map((item) => {
        const active = item.exact ? pathname === item.href : pathname === item.href || pathname.startsWith(`${item.href}/`);
        const Icon = item.icon;
        return (
          <Link
            key={item.href}
            href={item.href}
            onClick={onNavigate}
            aria-current={active ? "page" : undefined}
            className={cn(
              "flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none",
              active ? "bg-primary/10 text-primary" : "text-muted-foreground hover:bg-muted hover:text-foreground",
            )}
          >
            <Icon className="size-4" />
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}

function UserMenu() {
  const { user, logout } = useAuth();
  if (!user) return null;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="sm" className="gap-2">
          <UserRound className="size-4" />
          <span className="hidden max-w-40 truncate sm:inline">{user.full_name}</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-64">
        <DropdownMenuLabel className="font-normal">
          <div className="font-medium">{user.full_name}</div>
          <div className="truncate text-xs text-muted-foreground">{user.email}</div>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        {user.memberships.map((m) => (
          <DropdownMenuItem key={m.restaurant_id} asChild>
            <Link href={`/manage/${m.restaurant_id}`}>
              <Store className="size-4" />
              <span className="flex-1 truncate">{m.restaurant_name}</span>
              <span className="text-xs text-muted-foreground">{ROLE[m.role]}</span>
            </Link>
          </DropdownMenuItem>
        ))}
        {user.memberships.length > 0 && <DropdownMenuSeparator />}
        <DropdownMenuItem asChild>
          <Link href="/manage">
            <Store className="size-4" />
            Mes restaurants
          </Link>
        </DropdownMenuItem>
        {user.is_superadmin && (
          <DropdownMenuItem asChild>
            <Link href="/admin">
              <Shield className="size-4" />
              Super Admin
            </Link>
          </DropdownMenuItem>
        )}
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={() => logout()}>
          <LogOut className="size-4" />
          Se déconnecter
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/** Gabarit des espaces restaurateur et super admin : barre latérale + en-tête. */
export function AppShell({
  title,
  subtitle,
  nav,
  actions,
  sheetExtra,
  avatarUrl,
  children,
}: {
  title: string;
  subtitle?: string;
  nav: NavItem[];
  actions?: React.ReactNode;
  /** Contenu supplémentaire affiché sous la navigation du menu mobile. */
  sheetExtra?: React.ReactNode;
  /** Logo affiché à côté du titre dans la barre latérale. */
  avatarUrl?: string | null;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const titleBlock = (
    <div className="flex min-w-0 items-center gap-3 rounded-xl border bg-muted/40 p-2.5">
      {avatarUrl ? (
        <img src={avatarUrl} alt="" className="size-9 shrink-0 rounded-lg border bg-background object-cover" />
      ) : (
        <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary" aria-hidden>
          <Store className="size-4.5" />
        </span>
      )}
      <div className="min-w-0">
        <p className="truncate text-sm font-semibold">{title}</p>
        {subtitle && <p className="truncate text-xs text-muted-foreground">{subtitle}</p>}
      </div>
    </div>
  );
  return (
    <div className="flex min-h-dvh bg-muted/30">
      <aside className="sticky top-0 hidden h-dvh w-60 shrink-0 flex-col gap-6 border-r bg-background p-4 lg:flex">
        <Logo />
        {titleBlock}
        <NavLinks items={nav} />
      </aside>
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex h-14 items-center gap-2 border-b bg-background/95 px-4 backdrop-blur no-print">
          <Sheet open={open} onOpenChange={setOpen}>
            <SheetTrigger asChild>
              <Button variant="ghost" size="icon" className="lg:hidden" aria-label="Ouvrir le menu">
                <Menu />
              </Button>
            </SheetTrigger>
            <SheetContent side="left" className="w-72 p-4">
              <SheetTitle className="sr-only">Navigation</SheetTitle>
              <div className="flex flex-col gap-6">
                <Logo />
                {titleBlock}
                <NavLinks items={nav} onNavigate={() => setOpen(false)} />
                {sheetExtra && <div className="border-t pt-4">{sheetExtra}</div>}
              </div>
            </SheetContent>
          </Sheet>
          <span className="min-w-0 truncate font-semibold lg:hidden">{title}</span>
          <div className="ml-auto flex shrink-0 items-center gap-2">
            {actions}
            <UserMenu />
          </div>
        </header>
        <main className="mx-auto w-full max-w-6xl flex-1 p-4 md:p-8">{children}</main>
      </div>
    </div>
  );
}

export function PageHeader({
  title,
  description,
  actions,
}: {
  title: string;
  description?: string;
  actions?: React.ReactNode;
}) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div className="min-w-0">
        <h1 className="text-2xl font-semibold tracking-tight md:text-3xl">{title}</h1>
        {description && <p className="mt-1 text-sm text-muted-foreground">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  );
}

export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  description?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 rounded-2xl border border-dashed bg-background p-10 text-center">
      <span className="flex size-12 items-center justify-center rounded-2xl bg-primary/10 text-primary" aria-hidden>
        <Icon className="size-6" />
      </span>
      <div>
        <p className="font-medium">{title}</p>
        {description && <p className="mt-1 text-sm text-muted-foreground">{description}</p>}
      </div>
      {action}
    </div>
  );
}
