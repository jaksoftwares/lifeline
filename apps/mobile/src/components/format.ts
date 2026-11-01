const time = new Intl.DateTimeFormat('en-KE', {
  timeStyle: 'short',
  hourCycle: 'h23',
  timeZone: 'Africa/Nairobi',
});

/** "14:32", in Kenyan time like the web app. */
export function formatTime(iso: string): string {
  return time.format(new Date(iso));
}

export function formatAgo(iso: string, now = new Date()): string {
  const minutes = Math.max(0, Math.round((now.getTime() - new Date(iso).getTime()) / 60_000));
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes} min ago`;
  return `${Math.round(minutes / 60)} h ago`;
}
