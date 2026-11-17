import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { Check } from 'lucide-react';

export interface MenuItem {
  label: string;
  icon?: ReactNode;
  onSelect: () => void;
  checked?: boolean;
  danger?: boolean;
  divider?: boolean;
}

interface MenuProps {
  trigger: (props: { onClick: (e: React.MouseEvent) => void; 'aria-expanded': boolean; ref: React.Ref<HTMLButtonElement> }) => ReactNode;
  items: MenuItem[];
  align?: 'start' | 'end';
  label?: string;
}

/** Accessible dropdown menu rendered in a portal so it is never clipped by scroll containers. */
export function Menu({ trigger, items, align = 'end', label }: MenuProps) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const btnRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState(0);

  useLayoutEffect(() => {
    if (!open || !btnRef.current || !menuRef.current) return;
    const r = btnRef.current.getBoundingClientRect();
    const m = menuRef.current.getBoundingClientRect();
    let left = align === 'end' ? r.right - m.width : r.left;
    left = Math.max(8, Math.min(left, window.innerWidth - m.width - 8));
    let top = r.bottom + 4;
    if (top + m.height > window.innerHeight - 8) top = Math.max(8, r.top - m.height - 4);
    setPos({ top, left });
  }, [open, align]);

  useEffect(() => {
    if (!open) return;
    const close = (e: Event) => {
      if (menuRef.current?.contains(e.target as Node) || btnRef.current?.contains(e.target as Node)) return;
      setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      const selectable = items.filter((i) => !i.divider);
      if (e.key === 'Escape') {
        e.stopPropagation();
        setOpen(false);
        btnRef.current?.focus();
      } else if (e.key === 'ArrowDown') {
        e.preventDefault();
        setActive((a) => (a + 1) % selectable.length);
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setActive((a) => (a - 1 + selectable.length) % selectable.length);
      } else if (e.key === 'Enter') {
        e.preventDefault();
        selectable[active]?.onSelect();
        setOpen(false);
      }
    };
    const dismiss = (e: Event) => {
      if (e.type === 'scroll' && menuRef.current?.contains(e.target as Node)) return;
      setOpen(false);
    };
    document.addEventListener('mousedown', close);
    document.addEventListener('touchstart', close);
    window.addEventListener('keydown', onKey, true);
    window.addEventListener('resize', dismiss);
    window.addEventListener('scroll', dismiss, true);
    return () => {
      document.removeEventListener('mousedown', close);
      document.removeEventListener('touchstart', close);
      window.removeEventListener('keydown', onKey, true);
      window.removeEventListener('resize', dismiss);
      window.removeEventListener('scroll', dismiss, true);
    };
  }, [open, items, active]);

  let selectIndex = -1;
  return (
    <>
      {trigger({
        onClick: (e) => {
          e.stopPropagation();
          setActive(0);
          setPos(null);
          setOpen((o) => !o);
        },
        'aria-expanded': open,
        ref: btnRef,
      })}
      {open &&
        createPortal(
          <div
            ref={menuRef}
            className="menu"
            role="menu"
            aria-label={label}
            style={{ top: pos?.top ?? -9999, left: pos?.left ?? -9999, visibility: pos ? 'visible' : 'hidden' }}
            onClick={(e) => e.stopPropagation()}
          >
            {items.map((item, i) => {
              if (item.divider) return <div key={`d${i}`} className="menu-divider" />;
              selectIndex++;
              const idx = selectIndex;
              return (
                <button
                  key={item.label}
                  type="button"
                  role="menuitem"
                  className={`menu-item${item.danger ? ' danger' : ''}${idx === active ? ' active' : ''}`}
                  onMouseEnter={() => setActive(idx)}
                  onClick={() => {
                    item.onSelect();
                    setOpen(false);
                  }}
                >
                  <span className="menu-icon">{item.icon}</span>
                  <span className="menu-label">{item.label}</span>
                  {item.checked && <Check size={14} className="menu-check" />}
                </button>
              );
            })}
          </div>,
          document.body,
        )}
    </>
  );
}
