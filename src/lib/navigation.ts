import type { CurrentUser } from './auth';

export interface NavItem {
  href: string;
  label: string;
  icon:
    | 'dashboard'
    | 'transfers'
    | 'new'
    | 'capacity'
    | 'fleet'
    | 'trip'
    | 'reports'
    | 'settings'
    | 'network';
}

/** The menu each kind of user sees. Hospitals, providers, drivers and the platform team differ. */
export function navFor({ profile, organization }: CurrentUser): NavItem[] {
  if (profile.is_platform_admin) {
    return [
      { href: '/dashboard', label: 'Overview', icon: 'dashboard' },
      { href: '/network', label: 'Network', icon: 'network' },
      { href: '/transfers', label: 'Transfers', icon: 'transfers' },
      { href: '/reports', label: 'Reports', icon: 'reports' },
    ];
  }
  if (profile.role === 'driver') {
    return [{ href: '/trip', label: 'My trip', icon: 'trip' }];
  }
  const settings: NavItem = { href: '/settings', label: 'Settings', icon: 'settings' };
  if (organization?.type === 'ambulance_provider') {
    return [
      { href: '/dashboard', label: 'Dashboard', icon: 'dashboard' },
      { href: '/transfers', label: 'Trips', icon: 'transfers' },
      { href: '/fleet', label: 'Fleet & drivers', icon: 'fleet' },
      { href: '/reports', label: 'Reports', icon: 'reports' },
      settings,
    ];
  }
  return [
    { href: '/dashboard', label: 'Dashboard', icon: 'dashboard' },
    { href: '/transfers/new', label: 'New transfer', icon: 'new' },
    { href: '/transfers', label: 'Transfers', icon: 'transfers' },
    { href: '/capacity', label: 'Beds & services', icon: 'capacity' },
    { href: '/reports', label: 'Reports', icon: 'reports' },
    settings,
  ];
}

/** Where a user lands after signing in. */
export function homeFor(user: CurrentUser) {
  return user.profile.role === 'driver' && !user.profile.is_platform_admin ? '/trip' : '/dashboard';
}
