'use client';

import { type Permission } from '@lifeline/domain';
import { cn, Logo, Select } from '@lifeline/ui';
import { useQueryClient } from '@tanstack/react-query';
import {
  BedDouble,
  Building2,
  ClipboardList,
  LayoutDashboard,
  LogOut,
  Menu,
  UserCog,
  Users,
  X,
  type LucideIcon,
} from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { type ReactNode, useState } from 'react';
import { api } from '@/lib/api';
import { useSession } from '@/lib/session';

interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
  /** Shown only when the user holds this permission in the active network. */
  permission?: Permission;
}

// Modules from later phases (Referrals, Dispatch, Live transfers, …) are added here as they ship.
const NAV: NavItem[] = [
  { href: '/', label: 'Overview', icon: LayoutDashboard },
  { href: '/network', label: 'Facility network', icon: Building2 },
  { href: '/capacity', label: 'Capacity', icon: BedDouble, permission: 'capacity:update' },
  { href: '/admin/users', label: 'Users and roles', icon: Users, permission: 'users:manage' },
  { href: '/admin/audit', label: 'Audit log', icon: ClipboardList, permission: 'audit:view' },
  { href: '/account', label: 'My account', icon: UserCog },
];

export function AppShell({ children }: { children: ReactNode }) {
  const { user, network, networks, setNetworkId, can } = useSession();
  const pathname = usePathname();
  const queryClient = useQueryClient();
  const [menuOpen, setMenuOpen] = useState(false);
  const items = NAV.filter((item) => !item.permission || can(item.permission));

  async function signOut() {
    await api('/auth/logout', { method: 'POST' }).catch(() => undefined);
    queryClient.clear();
    window.location.assign('/login');
  }

  const isActive = (href: string) => (href === '/' ? pathname === '/' : pathname.startsWith(href));

  return (
    <div className="min-h-dvh lg:pl-(--width-sidebar)">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-50 focus:rounded-sm focus:bg-surface focus:px-3 focus:py-2"
      >
        Skip to content
      </a>

      <aside
        className={cn(
          'fixed inset-y-0 left-0 z-40 flex w-(--width-sidebar) flex-col bg-navy text-white transition-transform lg:translate-x-0',
          menuOpen ? 'translate-x-0' : '-translate-x-full',
        )}
      >
        <div className="flex h-(--height-topbar) items-center justify-between px-5">
          <Logo inverse />
          <button
            type="button"
            className="rounded-sm p-1.5 text-white/80 hover:bg-white/10 lg:hidden"
            onClick={() => setMenuOpen(false)}
            aria-label="Close menu"
          >
            <X className="size-5" aria-hidden />
          </button>
        </div>
        <nav aria-label="Main" className="flex-1 space-y-1 px-3 py-4">
          {items.map(({ href, label, icon: Icon }) => (
            <Link
              key={href}
              href={href}
              onClick={() => setMenuOpen(false)}
              aria-current={isActive(href) ? 'page' : undefined}
              className={cn(
                'flex items-center gap-3 rounded-sm px-3 py-2 text-sm font-medium text-white/80 hover:bg-white/10 hover:text-white',
                isActive(href) && 'bg-white/10 text-white shadow-[inset_3px_0_0_var(--color-teal)]',
              )}
            >
              <Icon className="size-4.5" aria-hidden />
              {label}
            </Link>
          ))}
        </nav>
        <div className="border-t border-white/10 px-5 py-4 text-xs text-white/60">
          Phase 1 · Facility network and capacity
        </div>
      </aside>

      {menuOpen && (
        <div
          className="fixed inset-0 z-30 bg-navy/40 lg:hidden"
          onClick={() => setMenuOpen(false)}
          aria-hidden
        />
      )}

      <header className="sticky top-0 z-20 flex h-(--height-topbar) items-center gap-3 border-b border-border bg-surface px-4 lg:px-8">
        <button
          type="button"
          className="rounded-sm p-1.5 text-slate hover:bg-surface-blue lg:hidden"
          onClick={() => setMenuOpen(true)}
          aria-label="Open menu"
        >
          <Menu className="size-5" aria-hidden />
        </button>
        <div className="min-w-0 flex-1">
          {networks.length > 1 ? (
            <Select
              aria-label="Network"
              className="h-9 max-w-xs"
              value={network.id}
              onChange={(e) => setNetworkId(e.target.value)}
            >
              {networks.map((n) => (
                <option key={n.id} value={n.id}>
                  {n.name}
                </option>
              ))}
            </Select>
          ) : (
            <p className="truncate text-sm font-medium text-ink">{network.name}</p>
          )}
        </div>
        <div className="hidden text-right sm:block">
          <p className="text-sm font-medium text-ink">{user.fullName}</p>
          <p className="text-xs text-slate">{user.memberships[0]?.roleLabel}</p>
        </div>
        <button
          type="button"
          onClick={() => void signOut()}
          className="inline-flex items-center gap-1.5 rounded-sm px-2.5 py-1.5 text-sm text-slate hover:bg-surface-blue hover:text-ink"
        >
          <LogOut className="size-4" aria-hidden />
          <span className="hidden sm:inline">Sign out</span>
        </button>
      </header>

      <main
        id="main"
        className="mx-auto w-full max-w-(--container-content) px-4 py-6 lg:px-8 lg:py-8"
      >
        {children}
      </main>
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
  actions?: ReactNode;
}) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div>
        <h1 className="font-display text-2xl font-bold lg:text-[32px] lg:leading-tight">{title}</h1>
        {description && <p className="mt-1 max-w-2xl text-[15px] text-slate">{description}</p>}
      </div>
      {actions}
    </div>
  );
}
