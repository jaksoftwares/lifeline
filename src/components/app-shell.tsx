'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState } from 'react';
import {
  Ambulance,
  BarChart3,
  BedDouble,
  LayoutDashboard,
  ListChecks,
  LogOut,
  Menu,
  Network,
  Navigation,
  PlusCircle,
  Settings,
  X,
} from 'lucide-react';
import type { NavItem } from '@/lib/navigation';
import { Logo } from './logo';

const ICONS = {
  dashboard: LayoutDashboard,
  transfers: ListChecks,
  new: PlusCircle,
  capacity: BedDouble,
  fleet: Ambulance,
  trip: Navigation,
  reports: BarChart3,
  settings: Settings,
  network: Network,
};

export function AppShell({
  nav,
  userName,
  orgName,
  children,
}: {
  nav: NavItem[];
  userName: string;
  orgName: string;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  // The most specific matching item is active ("/transfers/new" beats "/transfers").
  const active = nav
    .filter((item) => pathname === item.href || pathname.startsWith(`${item.href}/`))
    .sort((a, b) => b.href.length - a.href.length)[0]?.href;

  const sidebar = (
    <div className="flex h-full flex-col">
      <div className="px-5 py-5">
        <Logo light />
      </div>
      <nav className="flex-1 space-y-1 px-3">
        {nav.map((item) => {
          const Icon = ICONS[item.icon];
          const isActive = item.href === active;
          return (
            <Link
              key={item.href}
              href={item.href}
              onClick={() => setOpen(false)}
              className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition ${
                isActive
                  ? 'bg-white/15 text-white'
                  : 'text-brand-100 hover:bg-white/10 hover:text-white'
              }`}
            >
              <Icon className="h-5 w-5" />
              {item.label}
            </Link>
          );
        })}
      </nav>
      <div className="border-t border-white/10 p-4">
        <p className="truncate text-sm font-semibold text-white">{userName}</p>
        <p className="truncate text-xs text-brand-200">{orgName}</p>
        <form action="/signout" method="post" className="mt-3">
          <button className="flex items-center gap-2 text-sm text-brand-100 hover:text-white">
            <LogOut className="h-4 w-4" /> Sign out
          </button>
        </form>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen lg:pl-64">
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 bg-brand-900 lg:block">
        {sidebar}
      </aside>

      {/* Mobile */}
      <header className="sticky top-0 z-20 flex items-center justify-between bg-brand-900 px-4 py-3 lg:hidden">
        <Logo light />
        <button onClick={() => setOpen(true)} className="text-white" aria-label="Open menu">
          <Menu className="h-6 w-6" />
        </button>
      </header>
      {open && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div className="absolute inset-0 bg-black/40" onClick={() => setOpen(false)} />
          <aside className="absolute inset-y-0 left-0 w-72 bg-brand-900">
            <button
              onClick={() => setOpen(false)}
              className="absolute right-3 top-5 text-white"
              aria-label="Close menu"
            >
              <X className="h-6 w-6" />
            </button>
            {sidebar}
          </aside>
        </div>
      )}

      <main className="mx-auto max-w-6xl px-4 py-6 sm:px-6 lg:px-8 lg:py-8">{children}</main>
    </div>
  );
}
