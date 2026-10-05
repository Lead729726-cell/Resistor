import { useEffect, useRef, type ReactNode } from 'react';

/** Compact navigation for existing tools; preserves each action's native handler. */
export default function WorkbenchMenu({ label, id, children }: { label: string; id: string; children: ReactNode }) {
  const ref = useRef<HTMLDetailsElement>(null);
  useEffect(() => {
    const closeOutside = (event: PointerEvent) => {
      if (ref.current?.open && !ref.current.contains(event.target as Node)) ref.current.open = false;
    };
    document.addEventListener('pointerdown', closeOutside);
    return () => document.removeEventListener('pointerdown', closeOutside);
  }, []);
  return <details ref={ref} className="workbench-menu" data-testid={id} name="workbench-tools" onKeyDown={event => {
    if (event.key === 'Escape' && ref.current?.open) {
      event.preventDefault(); ref.current.open = false; ref.current.querySelector('summary')?.focus();
    }
  }}>
    <summary>{label}<span aria-hidden="true">⌄</span></summary>
    <div className="workbench-menu-body" onClick={event => {
      if ((event.target as Element).closest('button:not(:disabled)') && ref.current) ref.current.open = false;
    }}>{children}</div>
  </details>;
}
