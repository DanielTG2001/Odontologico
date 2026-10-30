export function LogoMark({ className = 'h-9 w-9' }: { className?: string }) {
  return (
    <svg viewBox="0 0 40 40" className={className} aria-hidden="true">
      <rect width="40" height="40" rx="11" fill="url(#lg)" />
      <path
        d="M13.5 11.5c-2.6 0-4.5 2.2-4.5 5.3 0 2.4.8 4.1 1.6 6.3.7 2 1 5.4 2.2 6.9.9 1.1 2.3.6 2.7-.9l1.3-4.6c.3-1.1 1.2-1.6 3.2-1.6s2.9.5 3.2 1.6l1.3 4.6c.4 1.5 1.8 2 2.7.9 1.2-1.5 1.5-4.9 2.2-6.9.8-2.2 1.6-3.9 1.6-6.3 0-3.1-1.9-5.3-4.5-5.3-2.2 0-3.6 1.3-6.5 1.3s-4.3-1.3-6.5-1.3Z"
        fill="#fff"
      />
      <defs>
        <linearGradient id="lg" x1="0" y1="0" x2="40" y2="40">
          <stop stopColor="#22ad97" />
          <stop offset="1" stopColor="#155951" />
        </linearGradient>
      </defs>
    </svg>
  );
}
