export function Logo({ className = '', light = false }: { className?: string; light?: boolean }) {
  return (
    <span className={`inline-flex items-center gap-2 font-bold tracking-tight ${className}`}>
      <svg viewBox="0 0 32 32" className="h-8 w-8" aria-hidden="true">
        <rect width="32" height="32" rx="8" fill="#0d8a76" />
        <path d="M13 7h6v6h6v6h-6v6h-6v-6H7v-6h6z" fill="#fff" />
        <path
          d="M5 17h5l2-3 3 7 2.5-5H27"
          fill="none"
          stroke="#0d8a76"
          strokeWidth="2.2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
      <span className={`text-xl ${light ? 'text-white' : 'text-ink'}`}>
        Afya<span className={light ? 'text-brand-200' : 'text-brand-600'}>line</span>
      </span>
    </span>
  );
}
