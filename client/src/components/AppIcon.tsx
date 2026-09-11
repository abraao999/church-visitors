export type AppIconName =
  | 'home'
  | 'users'
  | 'heartHand'
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
  | 'shield'
  | 'car'
  | 'send'
  | 'bell'
  | 'megaphone'
  | 'eyeOff'
  | 'info'
  | 'headlight'
  | 'parking'
  | 'reposition'
  | 'tow'
  | 'door'
  | 'chat'
  | 'plate'
  | 'search'
  | 'checkPlain'
  | 'clipboard'
  | 'close'
  | 'menu'
  | 'chart'
  | 'mail';

export function AppIcon({ name, className = '' }: { name: AppIconName; className?: string }) {
  const content = {
    home: <><path d="m3 11 9-8 9 8" /><path d="M5 10v10h5v-6h4v6h5V10" /></>,
    users: <><circle cx="9" cy="8" r="3.5" /><circle cx="17" cy="9" r="2.5" /><path d="M2.5 20v-2.2c0-3 2.9-5.3 6.5-5.3s6.5 2.3 6.5 5.3V20h-13Z" /><path d="M15 14c3.5-.4 6.5 1.5 6.5 4.1V20H18" /></>,
    heartHand: <><path d="M11 14H5.2A2.2 2.2 0 0 1 3 11.8 2.2 2.2 0 0 1 5.2 9.5H8" /><path d="M14 14v7" /><path d="M14 14h3.3A2.2 2.2 0 0 0 19.5 11.8 2.2 2.2 0 0 0 17.3 9.5H14" /><path d="M12 13.2 9.8 11a2.3 2.3 0 0 1 3.2-3.3c.4.4.7.8.9 1.3.2-.5.5-.9.9-1.3A2.3 2.3 0 0 1 18 11L12 16.5 9.8 14.4" /></>,
    prayer: <><path d="M9.2 3.5 8 11l-4 4c-1.2 1.2-1.2 3.1 0 4.2 1.1 1 2.8 1 3.9 0l4.1-4.1" /><path d="m14.8 3.5 1.2 7.6 4 4c1.2 1.2 1.2 3.1 0 4.2-1.1 1-2.8 1-3.9 0L12 15.1V8.8" /><path d="M9.2 3.5c.3-1.7 2.8-1.5 2.8.3v5" /><path d="M14.8 3.5c-.3-1.7-2.8-1.5-2.8.3" /></>,
    calendar: <><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M7 3v4m10-4v4M3 10h18" /></>,
    panels: <><rect x="3" y="4" width="18" height="14" rx="2" /><path d="M9 22h6m-3-4v4" /></>,
    music: <><path d="M9 18V5l11-2v13" /><circle cx="6" cy="18" r="3" /><circle cx="17" cy="16" r="3" /></>,
    logout: <><path d="M10 4H5a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h5" /><path d="m15 8 4 4-4 4m4-4H8" /></>,
    user: <><circle cx="12" cy="8" r="4" /><path d="M4.5 21v-2c0-3.6 3.4-6 7.5-6s7.5 2.4 7.5 6v2" /></>,
    arrow: <><path d="M5 12h14m-5-5 5 5-5 5" /></>,
    copy: <><rect x="8" y="8" width="11" height="12" rx="2" /><path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h2" /></>,
    check: <><circle cx="12" cy="12" r="9" /><path d="m8 12 2.6 2.6L16.5 9" /></>,
    checkPlain: <><path d="m5 12 4.5 4.5L19 7" /></>,
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
    car: <><path d="M5 16V11l2.2-4.5A2 2 0 0 1 9 5.5h6a2 2 0 0 1 1.8 1L19 11v5" /><path d="M3 16h18" /><circle cx="7.5" cy="16.5" r="1.5" /><circle cx="16.5" cy="16.5" r="1.5" /><path d="M7 11h10" /></>,
    send: <><path d="m4 11 15-7-7 15-2-6-6-2Z" /></>,
    bell: <><path d="M12 3a5 5 0 0 0-5 5v3.2L5 14h14l-2-2.8V8a5 5 0 0 0-5-5Z" /><path d="M9.5 17a2.5 2.5 0 0 0 5 0" /></>,
    megaphone: <><path d="m4 11 11-5v12L4 13v-2Z" /><path d="M15 10.5V8a3 3 0 0 1 3-3h1v14h-1a3 3 0 0 1-3-3v-2.5" /><path d="M4 13v4a2 2 0 0 0 2 2h1" /></>,
    eyeOff: <><path d="m4 4 16 16" /><path d="M10.6 10.6a2 2 0 0 0 2.8 2.8" /><path d="M9.9 5.2A9.8 9.8 0 0 1 12 5c5 0 8.5 4.5 9.5 7-.4 1-1.2 2.3-2.4 3.5M6.1 6.1C4.4 7.5 3.2 9.3 2.5 12c1 2.5 4.5 7 9.5 7 1.4 0 2.7-.3 3.9-.8" /></>,
    info: <><circle cx="12" cy="12" r="9" /><path d="M12 10v6m0-8.5v.5" /></>,
    headlight: <><circle cx="9" cy="12" r="4" /><path d="M13 9.5 20 7m-7 5h8m-8 2.5 7 2.5" /></>,
    parking: <><rect x="4" y="3" width="16" height="18" rx="2" /><path d="M9 17V7h4.2a3.2 3.2 0 0 1 0 6.4H9" /></>,
    reposition: <><path d="M7 13.5V10l1.7-3.3A1.6 1.6 0 0 1 10.1 6h3.8a1.6 1.6 0 0 1 1.4.7L17 10v3.5" /><circle cx="9.2" cy="14" r="1.2" /><circle cx="14.8" cy="14" r="1.2" /><path d="M3 19h6M15 19h6M5.2 19 3.5 17.3M3.5 20.7 5.2 19M18.8 19l1.7-1.7M20.5 20.7 18.8 19" /></>,
    tow: <><path d="M3 16h8l2-5h4l2 5h2" /><circle cx="7" cy="17.5" r="1.5" /><circle cx="17" cy="17.5" r="1.5" /><path d="M5 11V8h5l2 3M14 8h4" /></>,
    door: <><rect x="6" y="3" width="12" height="18" rx="1.5" /><path d="M14.5 12h.01" /></>,
    chat: <><path d="M5 5h14a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H9l-4 3v-3a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2Z" /></>,
    plate: <><rect x="3" y="7" width="18" height="10" rx="2" /><path d="M7 12h.01M11 12h6" /></>,
    search: <><circle cx="11" cy="11" r="6.5" /><path d="m16 16 4.5 4.5" /></>,
    clipboard: <><rect x="7" y="4" width="10" height="16" rx="2" /><path d="M9 4.5h6V6a1 1 0 0 1-1 1h-4a1 1 0 0 1-1-1V4.5Z" /><path d="M10 11h4m-4 3h4" /></>,
    close: <><path d="M6 6l12 12M18 6 6 18" /></>,
    menu: <><path d="M4 7h16M4 12h16M4 17h16" /></>,
    chart: <><path d="M4 19V5" /><path d="M4 19h16" /><path d="M8 16v-5" /><path d="M12 16V8" /><path d="M16 16v-3" /></>,
    mail: <><rect x="3" y="5" width="18" height="14" rx="2" /><path d="m4 7 8 6 8-6" /></>,
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
