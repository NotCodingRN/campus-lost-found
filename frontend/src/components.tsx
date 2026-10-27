import { CalendarDays, LoaderCircle, MapPin, RefreshCw, TriangleAlert, X } from 'lucide-react';
import { createContext, useCallback, useContext, useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { Link } from 'react-router';
import { api } from './api';
import { CATEGORY_LABELS, CLAIM_STATUS_LABELS, ITEM_STATUS_LABELS, formatDate } from './labels';
import type { ClaimStatus, Item, ItemStatus } from './types';

/* ---------- The lost-property tag: the visual signature of the site ---------- */

export function ItemTag({ item, size = 'normal', linked = true, style }: {
  item: Item;
  size?: 'normal' | 'large';
  linked?: boolean;
  style?: CSSProperties;
}) {
  const body = (
    <>
      <span className="tag__hole" aria-hidden="true" />
      <span className="tag__stamp" aria-hidden="true">{item.itemType === 'lost' ? 'Lost' : 'Found'}</span>
      {item.status === 'resolved' && <span className="tag__returned" aria-hidden="true">Returned</span>}
      <span className="visually-hidden">{item.itemType === 'lost' ? 'Lost item:' : 'Found item:'}</span>
      <h3 className="tag__title">{item.title}</h3>
      <p className="tag__fact"><MapPin size={16} aria-hidden="true" />{item.location}</p>
      <p className="tag__fact"><CalendarDays size={16} aria-hidden="true" />{formatDate(item.eventDate)}</p>
      {size === 'large' && <p className="tag__desc">Posted by {item.owner.displayName}</p>}
      <span className="tag__foot">
        <span>{CATEGORY_LABELS[item.category] ?? item.category}</span>
        {item.isDemo && <span className="tag__demo">Demo listing</span>}
      </span>
    </>
  );
  const className = `tag tag--${item.itemType} tag--${size} ${item.status === 'resolved' ? 'is-resolved' : ''}`;
  return (
    <div className="tag-wrap" style={style}>
      {linked ? (
        <Link to={`/items/${item.id}`} className={className}>{body}</Link>
      ) : (
        <div className={className}>{body}</div>
      )}
    </div>
  );
}

export function SkeletonTags({ count = 6 }: { count?: number }) {
  return (
    <div className="tag-grid" aria-busy="true" aria-label="Loading items">
      {Array.from({ length: count }, (_, i) => (
        <div className="tag-wrap" key={i}><div className="tag tag--skeleton" /></div>
      ))}
    </div>
  );
}

export function ItemStatusPill({ status }: { status: ItemStatus }) {
  return <span className={`pill pill--item-${status}`}>{ITEM_STATUS_LABELS[status]}</span>;
}

export function ClaimStatusPill({ status }: { status: ClaimStatus }) {
  return <span className={`pill pill--claim-${status}`}>{CLAIM_STATUS_LABELS[status]}</span>;
}

export function Spinner({ label = 'Loading' }: { label?: string }) {
  return (
    <span className="spinner" role="status">
      <LoaderCircle size={18} className="spin" aria-hidden="true" />
      <span>{label}</span>
    </span>
  );
}

export function EmptyState({ title, children, action }: { title: string; children?: ReactNode; action?: ReactNode }) {
  return (
    <div className="empty">
      <div className="empty__tag" aria-hidden="true"><span className="tag__hole" /></div>
      <h3>{title}</h3>
      {children && <p>{children}</p>}
      {action}
    </div>
  );
}

export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="error-state" role="alert">
      <TriangleAlert size={22} aria-hidden="true" />
      <div>
        <p>{message}</p>
        {onRetry && (
          <button type="button" className="btn btn--ghost" onClick={onRetry}>
            <RefreshCw size={16} aria-hidden="true" /> Try again
          </button>
        )}
      </div>
    </div>
  );
}

export function GoogleMark() {
  return (
    <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true">
      <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z" />
      <path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z" />
      <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z" />
      <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z" />
    </svg>
  );
}

/* ---------- Toasts ---------- */

interface Toast { id: number; text: string; tone: 'ok' | 'error' }
const ToastContext = createContext<(text: string, tone?: Toast['tone']) => void>(() => {});

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const nextId = useRef(1);
  const dismiss = (id: number) => setToasts((list) => list.filter((t) => t.id !== id));
  const show = useCallback((text: string, tone: Toast['tone'] = 'ok') => {
    const id = nextId.current++;
    setToasts((list) => [...list, { id, text, tone }]);
    setTimeout(() => dismiss(id), 6000);
  }, []);
  return (
    <ToastContext.Provider value={show}>
      {children}
      <div className="toasts" aria-live="polite">
        {toasts.map((t) => (
          <div key={t.id} className={`toast toast--${t.tone}`}>
            <span>{t.text}</span>
            <button type="button" aria-label="Dismiss" onClick={() => dismiss(t.id)}><X size={16} /></button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export const useToast = () => useContext(ToastContext);

/* ---------- Banner shown while the backend or database is unreachable ---------- */

export function ConnectionBanner() {
  const [problem, setProblem] = useState<null | 'api' | 'database'>(null);

  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout>;
    const check = async () => {
      let next: typeof problem = null;
      try {
        const health = await api.health();
        if (health.database !== 'connected') next = 'database';
      } catch (error) {
        next = (error as { status?: number }).status === 503 ? 'database' : 'api';
      }
      if (cancelled) return;
      setProblem(next);
      timer = setTimeout(check, next ? 5000 : 20000);
    };
    void check();
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, []);

  if (!problem) return null;
  return (
    <div className="conn-banner" role="alert">
      <TriangleAlert size={18} aria-hidden="true" />
      {problem === 'api'
        ? 'The Lost & Found service is not answering. The page will reconnect by itself.'
        : 'The database is unavailable, so listings cannot load. The page will reconnect by itself.'}
    </div>
  );
}
