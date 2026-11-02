"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { Inbox, LayoutDashboard, Megaphone, Menu, Settings, LogOut, X } from "lucide-react";
import type { Role } from "@growvibe/core";
import { cn } from "@/lib/utils";
import { Logo } from "./logo";
import { signOut } from "@/app/login/actions";

const NAV: { href: string; label: string; icon: typeof Inbox; roles: Role[] }[] = [
  { href: "/", label: "Resumen", icon: LayoutDashboard, roles: ["admin", "vendedor"] },
  { href: "/campaigns", label: "Campañas", icon: Megaphone, roles: ["admin"] },
  { href: "/inbox", label: "Bandeja", icon: Inbox, roles: ["admin", "vendedor"] },
  { href: "/settings", label: "Ajustes", icon: Settings, roles: ["admin"] },
];

export function Sidebar({ role, name }: { role: Role; name: string }) {
  const path = usePathname();
  const [open, setOpen] = useState(false);
  const items = NAV.filter((n) => n.roles.includes(role));

  const nav = (
    <nav className="flex flex-1 flex-col gap-1">
      {items.map(({ href, label, icon: Icon }) => {
        const active = href === "/" ? path === "/" : path.startsWith(href);
        return (
          <Link
            key={href}
            href={href}
            onClick={() => setOpen(false)}
            className={cn(
              "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100",
              active && "bg-brand-50 text-brand-700 hover:bg-brand-50",
            )}
          >
            <Icon className="size-4" />
            {label}
          </Link>
        );
      })}
    </nav>
  );

  const footer = (
    <div className="border-t border-slate-200 pt-3">
      <p className="truncate px-3 text-sm font-medium">{name}</p>
      <p className="px-3 text-xs capitalize text-slate-500">{role}</p>
      <form action={signOut}>
        <button className="mt-2 flex w-full items-center gap-3 rounded-md px-3 py-2 text-sm text-slate-600 hover:bg-slate-100">
          <LogOut className="size-4" /> Cerrar sesión
        </button>
      </form>
    </div>
  );

  return (
    <>
      {/* Móvil */}
      <header className="sticky top-0 z-20 flex h-14 items-center justify-between border-b border-slate-200 bg-white px-4 md:hidden">
        <Logo />
        <button aria-label="Menú" onClick={() => setOpen(true)}>
          <Menu className="size-5" />
        </button>
      </header>
      {open && (
        <div className="fixed inset-0 z-30 bg-black/30 md:hidden" onClick={() => setOpen(false)}>
          <aside
            className="flex h-full w-64 flex-col gap-4 bg-white p-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between">
              <Logo />
              <button aria-label="Cerrar" onClick={() => setOpen(false)}>
                <X className="size-5" />
              </button>
            </div>
            {nav}
            {footer}
          </aside>
        </div>
      )}
      {/* Escritorio */}
      <aside className="sticky top-0 hidden h-dvh w-60 shrink-0 flex-col gap-6 border-r border-slate-200 bg-white p-4 md:flex">
        <Logo />
        {nav}
        {footer}
      </aside>
    </>
  );
}
