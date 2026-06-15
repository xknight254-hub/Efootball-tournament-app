/* ============================================
   SVG ICON COMPONENTS
   ============================================ */
const I = ({ d, size = 24, color = 'currentColor', fill = false, strokeWidth }: { d: string; size?: number; color?: string; fill?: boolean; strokeWidth?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill={fill ? color : "none"} stroke={color} strokeWidth={fill ? 0 : (strokeWidth ?? 2)} strokeLinecap="round" strokeLinejoin="round">
    <path d={d} />
  </svg>
);

export const Icons = {
  Home: (p: any) => <I d="M3 9.5L12 3l9 6.5V21a1 1 0 01-1 1H4a1 1 0 01-1-1V9.5z" {...p} />,
  Trophy: (p: any) => <I d="M8 21h8m-4-4v4M7 4h10M7 4v0a5 5 0 005 5v0a5 5 0 005-5v0M7 4H4v3a5 5 0 005 5v0M17 4h3v3a5 5 0 01-5 5v0" {...p} />,
  ChartBar: (p: any) => <I d="M3 3v18h18M7 16V12M11 16V8M15 16v-4M19 16v-6" {...p} />,
  Bell: (p: any) => <I d="M18 8A6 6 0 006 8c0 7-3 9-3 9h18s-3-2-3-9M13.73 21a2 2 0 01-3.46 0" {...p} />,
  User: (p: any) => <I d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2M12 3a4 4 0 100 8 4 4 0 000-8z" {...p} />,
  Search: (p: any) => <I d="M11 3a8 8 0 100 16 8 8 0 000-16zM21 21l-4.35-4.35" {...p} />,
  ChevronRight: (p: any) => <I d="M9 18l6-6-6-6" {...p} />,
  Play: (p: any) => <I d="M8 5v14l11-7z" fill {...p} />,
  Plus: (p: any) => <I d="M12 5v14M5 12h14" {...p} />,
  Fire: (p: any) => <I d="M12 2c-3 4-7 7-7 12a7 7 0 0014 0c0-5-4-8-7-12zM12 19a2 2 0 110-4 2 2 0 010 4z" {...p} />,
  GameController: (p: any) => <I d="M6 12h12M12 6v12M7 3h10l2 2v14l-2 2H7l-2-2V5l2-2z" {...p} />,
  Sword: (p: any) => <I d="M14.5 17.5L3 6V3h3l11.5 11.5M13 19l6-6M16 16l4 4M19 21l2-2" {...p} />,
  Medal: (p: any) => <I d="M12 15a7 7 0 100-14 7 7 0 000 14zM12 8l1 2h2l-1.5 1.5.5 2L12 12l-1.5 1.5.5-2L9 10h2l1-2z" {...p} />,
  Shield: (p: any) => <I d="M12 3l8 4v5c0 5-3.5 9-8 10-4.5-1-8-5-8-10V7l8-4z" {...p} />,
  Crown: (p: any) => <I d="M2 17l2 5h16l2-5-4 2-4-7-4 7-4-2z" {...p} />,
  Money: (p: any) => <I d="M12 2v20M17 13H9.5a2.5 2.5 0 010-5H15M7 11h5.5a2.5 2.5 0 010 5" {...p} />,
  Lightning: (p: any) => <I d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" {...p} />,
  Broadcast: (p: any) => <I d="M22 12a10 10 0 01-10 10M12 22A10 10 0 012 12M12 14a2 2 0 100-4 2 2 0 000 4z" {...p} />,
  Target: (p: any) => <I d="M12 22a10 10 0 100-20 10 10 0 000 20zM12 18a6 6 0 100-12 6 6 0 000 12zM12 14a2 2 0 100-4 2 2 0 000 4z" {...p} />,
  ArrowUpRight: (p: any) => <I d="M7 17L17 7M7 7h10v10" {...p} />,
  CheckCircle: (p: any) => <I d="M22 11.08V12a10 10 0 11-5.93-9.14M22 4L12 14.01l-3-3" {...p} />,
  Trash: (p: any) => <I d="M3 6h18M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6M8 6V4a2 2 0 012-2h4a2 2 0 012 2v2" {...p} />,
  Clock: (p: any) => <I d="M12 22a10 10 0 100-20 10 10 0 000 20zM12 6v6l4 2" {...p} />,
  Envelope: (p: any) => <I d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2zM22 6l-10 7L2 6" {...p} />,
  Lock: (p: any) => <I d="M19 11H5a2 2 0 00-2 2v7a2 2 0 002 2h14a2 2 0 002-2v-7a2 2 0 00-2-2zM7 11V7a5 5 0 0110 0v4" {...p} />,
  Phone: (p: any) => <I d="M22 16.92v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07 19.5 19.5 0 01-6-6 19.79 19.79 0 01-3.07-8.67A2 2 0 014.11 2h3a2 2 0 012 1.72c.127.96.361 1.903.7 2.81a2 2 0 01-.45 2.11L8.09 9.91a16 16 0 006 6l1.27-1.27a2 2 0 012.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0122 16.92z" {...p} />,
  Users: (p: any) => <I d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2M9 3a4 4 0 100 8 4 4 0 000-8zM23 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75" {...p} />,
  ChatCircle: (p: any) => <I d="M21 11.5a8.38 8.38 0 01-.9 3.8 8.5 8.5 0 01-7.6 4.7 8.38 8.38 0 01-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 01-.9-3.8 8.5 8.5 0 014.7-7.6 8.38 8.38 0 013.8-.9h.5a8.48 8.48 0 018 8v.5z" {...p} />,
  Warning: (p: any) => <I d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0zM12 9v4M12 17h.01" {...p} />,
  Share: (p: any) => <I d="M4 12v8a2 2 0 002 2h12a2 2 0 002-2v-8M16 6l-4-4-4 4M12 2v13" {...p} />,
  ArrowLeft: (p: any) => <I d="M19 12H5M12 19l-7-7 7-7" {...p} />,
  X: (p: any) => <I d="M18 6L6 18M6 6l12 12" {...p} />,
};
