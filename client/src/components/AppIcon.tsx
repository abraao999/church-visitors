export type AppIconName =
  | 'home'
  | 'users'
  | 'prayer'
  | 'calendar'
  | 'panels'
  | 'music'
  | 'logout'
  | 'user'
  | 'arrow'
  | 'copy'
  | 'check'
  | 'plus'
  | 'edit'
  | 'trash'
  | 'external'
  | 'settings'
  | 'link'
  | 'lock'
  | 'clock'
  | 'qr'
  | 'download'
  | 'refresh'
  | 'power'
  | 'sun'
  | 'moon'
  | 'pin'
  | 'shield';

export function AppIcon({ name, className = '' }: { name: AppIconName; className?: string }) {
  const content = {
    home: <><path d="m3 11 9-8 9 8" /><path d="M5 10v10h5v-6h4v6h5V10" /></>,
    users: <><circle cx="9" cy="8" r="3.5" /><circle cx="17" cy="9" r="2.5" /><path d="M2.5 20v-2.2c0-3 2.9-5.3 6.5-5.3s6.5 2.3 6.5 5.3V20h-13Z" /><path d="M15 14c3.5-.4 6.5 1.5 6.5 4.1V20H18" /></>,
    prayer: <><path d="M9.2 3.5 8 11l-4 4c-1.2 1.2-1.2 3.1 0 4.2 1.1 1 2.8 1 3.9 0l4.1-4.1" /><path d="m14.8 3.5 1.2 7.6 4 4c1.2 1.2 1.2 3.1 0 4.2-1.1 1-2.8 1-3.9 0L12 15.1V8.8" /><path d="M9.2 3.5c.3-1.7 2.8-1.5 2.8.3v5" /><path d="M14.8 3.5c-.3-1.7-2.8-1.5-2.8.3" /></>,
    calendar: <><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M7 3v4m10-4v4M3 10h18" /></>,
    panels: <><rect x="3" y="4" width="18" height="14" rx="2" /><path d="M9 22h6m-3-4v4" /></>,
    music: <><path d="M9 18V5l11-2v13" /><circle cx="6" cy="18" r="3" /><circle cx="17" cy="16" r="3" /></>,
    logout: <><path d="M10 4H5a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h5" /><path d="m15 8 4 4-4 4m4-4H8" /></>,
    user: <><circle cx="12" cy="8" r="4" /><path d="M4.5 21v-2c0-3.6 3.4-6 7.5-6s7.5 2.4 7.5 6v2" /></>,
    arrow: <><path d="M5 12h14m-5-5 5 5-5 5" /></>,
    copy: <><rect x="8" y="8" width="11" height="12" rx="2" /><path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h2" /></>,
    check: <><circle cx="12" cy="12" r="9" /><path d="m8 12 2.6 2.6L16.5 9" /></>,
    plus: <><circle cx="12" cy="12" r="9" /><path d="M12 8v8m-4-4h8" /></>,
    edit: <><path d="M4 20h4l11-11-4-4L4 16v4Z" /><path d="m13.5 6.5 4 4" /></>,
    trash: <><path d="M4 7h16M9 7V4h6v3m-8 0 1 13h8l1-13M10 11v5m4-5v5" /></>,
    external: <><path d="M14 4h6v6m0-6-9 9" /><path d="M18 13v6a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h6" /></>,
    settings: <><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1-2.8 2.8-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.6v.2h-4V21a1.7 1.7 0 0 0-1-1.6 1.7 1.7 0 0 0-1.9.3l-.1.1L4.2 17l.1-.1a1.7 1.7 0 0 0 .3-1.9A1.7 1.7 0 0 0 3 14H2.8v-4H3a1.7 1.7 0 0 0 1.6-1 1.7 1.7 0 0 0-.3-1.9L4.2 7 7 4.2l.1.1A1.7 1.7 0 0 0 9 4.6a1.7 1.7 0 0 0 1-1.6v-.2h4V3a1.7 1.7 0 0 0 1 1.6 1.7 1.7 0 0 0 1.9-.3l.1-.1L19.8 7l-.1.1a1.7 1.7 0 0 0-.3 1.9 1.7 1.7 0 0 0 1.6 1h.2v4H21a1.7 1.7 0 0 0-1.6 1Z" /></>,
    link: <><path d="m10 13.5 4-4" /><path d="M7.5 16.5 5 19a3.5 3.5 0 0 1-5-5l3-3a3.5 3.5 0 0 1 4.9 0" /><path d="m16.5 7.5 2.5-2.5a3.5 3.5 0 1 1 5 5l-3 3a3.5 3.5 0 0 1-4.9 0" /></>,
    lock: <><rect x="5" y="10" width="14" height="11" rx="2" /><path d="M8 10V7a4 4 0 0 1 8 0v3" /></>,
    clock: <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></>,
    qr: <><rect x="3" y="3" width="7" height="7" rx="1" /><rect x="14" y="3" width="7" height="7" rx="1" /><rect x="3" y="14" width="7" height="7" rx="1" /><path d="M14 14h3v3h-3zm4 0h3m-3 3h3v4h-4m-3-1v1" /></>,
    download: <><path d="M12 3v12m-4-4 4 4 4-4" /><path d="M4 19v2h16v-2" /></>,
    refresh: <><path d="M20 7v5h-5" /><path d="M4 17v-5h5" /><path d="M6.1 8.2A7 7 0 0 1 18.5 7L20 12M4 12l1.5 5a7 7 0 0 0 12.4-1.2" /></>,
    power: <><path d="M12 3v9" /><path d="M7.1 5.8a8 8 0 1 0 9.8 0" /></>,
    sun: <><circle cx="12" cy="12" r="4" /><path d="M12 2v2m0 16v2M4.9 4.9l1.4 1.4m11.4 11.4 1.4 1.4M2 12h2m16 0h2M4.9 19.1l1.4-1.4m11.4-11.4 1.4-1.4" /></>,
    moon: <><path d="M20.5 14.2A8.5 8.5 0 0 1 9.8 3.5 8.8 8.8 0 1 0 20.5 14.2Z" /></>,
    pin: <><path d="M12 21s7-5.4 7-11a7 7 0 1 0-14 0c0 5.6 7 11 7 11Z" /><circle cx="12" cy="10" r="2.5" /></>,
    shield: <><path d="M12 3 5 6v6c0 5 3.1 7.8 7 9 3.9-1.2 7-4 7-9V6l-7-3Z" /><path d="m9.5 12 1.8 1.8L15 10" /></>,
  }[name];

  return (
    <svg
      className={`app-icon ${className}`.trim()}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      {content}
    </svg>
  );
}
