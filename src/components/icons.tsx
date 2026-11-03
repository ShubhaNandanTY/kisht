// Small stroke icons (24px grid). Inline so the officer app works offline without an icon font.
type P = { className?: string };
const base = (d: React.ReactNode, className = "size-5") => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden>
    {d}
  </svg>
);
export const IconPhone = ({ className }: P) => base(<path d="M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2" />, className);
export const IconNav = ({ className }: P) => base(<path d="m3 11 18-8-8 18-2-8-8-2z" />, className);
export const IconMsg = ({ className }: P) => base(<path d="M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.6A8 8 0 1 1 21 12z" />, className);
export const IconBack = ({ className }: P) => base(<path d="M15 18 9 12l6-6" />, className);
export const IconList = ({ className }: P) => base(<><path d="M8 6h13M8 12h13M8 18h13" /><path d="M3.5 6h.01M3.5 12h.01M3.5 18h.01" /></>, className);
export const IconCal = ({ className }: P) => base(<><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M16 3v4M8 3v4M3 10h18" /></>, className);
export const IconClock = ({ className }: P) => base(<><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></>, className);
export const IconCheck = ({ className }: P) => base(<path d="m5 12 5 5L20 7" />, className);
export const IconX = ({ className }: P) => base(<path d="M18 6 6 18M6 6l12 12" />, className);
export const IconAlert = ({ className }: P) => base(<><path d="M12 9v4M12 17h.01" /><path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z" /></>, className);
export const IconMore = ({ className }: P) => base(<><circle cx="5" cy="12" r="1" /><circle cx="12" cy="12" r="1" /><circle cx="19" cy="12" r="1" /></>, className);
export const IconPin = ({ className }: P) => base(<><path d="M12 22s7-6.2 7-12a7 7 0 1 0-14 0c0 5.8 7 12 7 12z" /><circle cx="12" cy="10" r="2.5" /></>, className);
export const IconUp = ({ className }: P) => base(<path d="m6 15 6-6 6 6" />, className);
export const IconDown = ({ className }: P) => base(<path d="m6 9 6 6 6-6" />, className);
export const IconRefresh = ({ className }: P) => base(<><path d="M21 12a9 9 0 1 1-2.6-6.4" /><path d="M21 3v6h-6" /></>, className);
export const IconRupee = ({ className }: P) => base(<path d="M7 4h10M7 9h10M7 4h3a5 5 0 0 1 0 10H7l8 7" />, className);
