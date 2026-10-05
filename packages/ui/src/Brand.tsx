export const REGISTER_MARK = 'M6 24h6l3-8 6 16 6-16 6 16 3-8h6';
export const REGISTER_FRAME = 'M15 5H9a4 4 0 0 0-4 4v6m28-10h6a4 4 0 0 1 4 4v6M5 33v6a4 4 0 0 0 4 4h6m18 0h6a4 4 0 0 0 4-4v-6';
export function RegisterMark({ size = 38 }: { size?: number }) {
  return <svg data-testid="register-logo" width={size} height={size} viewBox="0 0 48 48" fill="none" aria-hidden="true"><path d={REGISTER_FRAME} stroke="currentColor" strokeWidth="2" strokeLinecap="round" opacity=".55"/><path d={REGISTER_MARK} stroke="currentColor" strokeWidth="3.3" strokeLinecap="round" strokeLinejoin="round"/><circle cx="6" cy="24" r="2.4" fill="currentColor"/><circle cx="42" cy="24" r="2.4" fill="currentColor"/></svg>;
}
export default function Brand({ viewer = false }: { viewer?: boolean }) {
  return <div className="register-brand" aria-label="레지스터 Register"><div className="register-brand-symbol"><RegisterMark/></div><div className="register-brand-wordmark"><strong>레지스터 <span>Register</span></strong><small>{viewer ? 'LAYOUT VIEWER' : 'INTEGRATED EDA'}</small></div></div>;
}
