import { useEffect, type ReactNode } from 'react';

/* --------------------------------------------------------------- icons */

type IconProps = { size?: number; stroke?: number };

const base = (size: number, stroke: number) => ({
  width: size,
  height: size,
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: stroke,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
  'aria-hidden': true,
});

export const Icon = {
  Note: ({ size = 20, stroke = 1.7 }: IconProps) => (
    <svg {...base(size, stroke)}>
      <path d="M9 18V5l11-2v13" />
      <circle cx="6" cy="18" r="3" />
      <circle cx="17" cy="16" r="3" />
    </svg>
  ),
  List: ({ size = 20, stroke = 1.7 }: IconProps) => (
    <svg {...base(size, stroke)}>
      <path d="M4 7h10M4 12h10M4 17h6" />
      <circle cx="18" cy="17" r="2.4" />
      <path d="M20.4 17V8l-2 .4" />
    </svg>
  ),
  Users: ({ size = 20, stroke = 1.7 }: IconProps) => (
    <svg {...base(size, stroke)}>
      <circle cx="9" cy="8" r="3.2" />
      <path d="M3.5 19c0-3 2.5-5 5.5-5s5.5 2 5.5 5" />
      <path d="M16 5.6a3 3 0 0 1 0 5.6M17.5 14.2c1.8.6 3 2.3 3 4.8" />
    </svg>
  ),
  Plus: ({ size = 18, stroke = 2 }: IconProps) => (
    <svg {...base(size, stroke)}>
      <path d="M12 5v14M5 12h14" />
    </svg>
  ),
  Search: ({ size = 16, stroke = 1.9 }: IconProps) => (
    <svg {...base(size, stroke)}>
      <circle cx="11" cy="11" r="6.5" />
      <path d="m16 16 4 4" />
    </svg>
  ),
  Sun: ({ size = 18, stroke = 1.7 }: IconProps) => (
    <svg {...base(size, stroke)}>
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2.5v2M12 19.5v2M2.5 12h2M19.5 12h2M5.2 5.2l1.4 1.4M17.4 17.4l1.4 1.4M18.8 5.2l-1.4 1.4M6.6 17.4l-1.4 1.4" />
    </svg>
  ),
  Moon: ({ size = 18, stroke = 1.7 }: IconProps) => (
    <svg {...base(size, stroke)}>
      <path d="M20 14.5A8.2 8.2 0 0 1 9.5 4a8.4 8.4 0 1 0 10.5 10.5Z" />
    </svg>
  ),
  Drag: ({ size = 16, stroke = 1.8 }: IconProps) => (
    <svg {...base(size, stroke)}>
      <circle cx="9" cy="6" r="1" fill="currentColor" />
      <circle cx="9" cy="12" r="1" fill="currentColor" />
      <circle cx="9" cy="18" r="1" fill="currentColor" />
      <circle cx="15" cy="6" r="1" fill="currentColor" />
      <circle cx="15" cy="12" r="1" fill="currentColor" />
      <circle cx="15" cy="18" r="1" fill="currentColor" />
    </svg>
  ),
  Share: ({ size = 17, stroke = 1.8 }: IconProps) => (
    <svg {...base(size, stroke)}>
      <path d="M12 15V3.8M8.4 7.4 12 3.8l3.6 3.6" />
      <path d="M5 13.5V19a1.5 1.5 0 0 0 1.5 1.5h11A1.5 1.5 0 0 0 19 19v-5.5" />
    </svg>
  ),
  Copy: ({ size = 17, stroke = 1.8 }: IconProps) => (
    <svg {...base(size, stroke)}>
      <rect x="9" y="9" width="11" height="11" rx="2.4" />
      <path d="M15 6.4V5.4A2.4 2.4 0 0 0 12.6 3H5.4A2.4 2.4 0 0 0 3 5.4v7.2A2.4 2.4 0 0 0 5.4 15h1" />
    </svg>
  ),
  Check: ({ size = 17, stroke = 2.1 }: IconProps) => (
    <svg {...base(size, stroke)}>
      <path d="m4.5 12.5 5 5 10-11" />
    </svg>
  ),
  Close: ({ size = 18, stroke = 1.9 }: IconProps) => (
    <svg {...base(size, stroke)}>
      <path d="M6 6l12 12M18 6 6 18" />
    </svg>
  ),
  Chevron: ({ size = 16, stroke = 1.9 }: IconProps) => (
    <svg {...base(size, stroke)}>
      <path d="m9 5 7 7-7 7" />
    </svg>
  ),
  ChevronDown: ({ size = 16, stroke = 1.9 }: IconProps) => (
    <svg {...base(size, stroke)}>
      <path d="m5 9 7 7 7-7" />
    </svg>
  ),
  Up: ({ size = 15, stroke = 2 }: IconProps) => (
    <svg {...base(size, stroke)}>
      <path d="m5 14 7-7 7 7" />
    </svg>
  ),
  Down: ({ size = 15, stroke = 2 }: IconProps) => (
    <svg {...base(size, stroke)}>
      <path d="m5 10 7 7 7-7" />
    </svg>
  ),
  Trash: ({ size = 16, stroke = 1.8 }: IconProps) => (
    <svg {...base(size, stroke)}>
      <path d="M4 7h16M9.5 7V5.2A1.2 1.2 0 0 1 10.7 4h2.6a1.2 1.2 0 0 1 1.2 1.2V7" />
      <path d="M6.5 7l.8 12.1a1.5 1.5 0 0 0 1.5 1.4h6.4a1.5 1.5 0 0 0 1.5-1.4L17.5 7" />
    </svg>
  ),
  Sparkle: ({ size = 18, stroke = 1.6 }: IconProps) => (
    <svg {...base(size, stroke)}>
      <path d="M12 3.5 13.6 9 19 10.6 13.6 12.2 12 17.7 10.4 12.2 5 10.6l5.4-1.6Z" />
      <path d="M18.5 16.5 19.3 19l2.2.8-2.2.8-.8 2.4" opacity=".55" />
    </svg>
  ),
  Bolt: ({ size = 15, stroke = 1.9 }: IconProps) => (
    <svg {...base(size, stroke)}>
      <path d="M13.5 2.5 5 13.6h5.4l-.9 7.9L18.5 10h-5.4Z" />
    </svg>
  ),
  Wave: ({ size = 15, stroke = 1.9 }: IconProps) => (
    <svg {...base(size, stroke)}>
      <path d="M2.5 12c2 0 2-4 4-4s2 8 4 8 2-8 4-8 2 4 4 4 2-2 3-2" />
    </svg>
  ),
  Clock: ({ size = 15, stroke = 1.8 }: IconProps) => (
    <svg {...base(size, stroke)}>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 7.5V12l3 1.8" />
    </svg>
  ),
  Link: ({ size = 17, stroke = 1.8 }: IconProps) => (
    <svg {...base(size, stroke)}>
      <path d="M10 13.5a3.6 3.6 0 0 0 5.1 0l2.8-2.8a3.6 3.6 0 0 0-5.1-5.1l-1.4 1.4" />
      <path d="M14 10.5a3.6 3.6 0 0 0-5.1 0L6.1 13.3a3.6 3.6 0 0 0 5.1 5.1l1.4-1.4" />
    </svg>
  ),
  Back: ({ size = 18, stroke = 2 }: IconProps) => (
    <svg {...base(size, stroke)}>
      <path d="M15 5l-7 7 7 7" />
    </svg>
  ),
  Edit: ({ size = 16, stroke = 1.8 }: IconProps) => (
    <svg {...base(size, stroke)}>
      <path d="M4 20h4L19.2 8.8a2 2 0 0 0 0-2.9l-1.1-1.1a2 2 0 0 0-2.9 0L4 16v4Z" />
    </svg>
  ),
  Eye: ({ size = 16, stroke = 1.8 }: IconProps) => (
    <svg {...base(size, stroke)}>
      <path d="M2.5 12S5.8 6 12 6s9.5 6 9.5 6-3.3 6-9.5 6-9.5-6-9.5-6Z" />
      <circle cx="12" cy="12" r="2.6" />
    </svg>
  ),
  Refresh: ({ size = 15, stroke = 1.9 }: IconProps) => (
    <svg {...base(size, stroke)}>
      <path d="M20 11a8 8 0 1 0-2.6 6.4" />
      <path d="M20 4.5V11h-6" />
    </svg>
  ),
  Music: ({ size = 18, stroke = 1.7 }: IconProps) => (
    <svg {...base(size, stroke)}>
      <path d="M4 13.5c1.6 0 1.6-3 3.2-3s1.6 5 3.2 5 1.6-5 3.2-5 1.6 3 3.2 3 1.6-1.5 3.2-1.5" />
    </svg>
  ),
  Note2: ({ size = 16, stroke = 1.8 }: IconProps) => (
    <svg {...base(size, stroke)}>
      <path d="M8 6h8M8 11h6M8 16h4" />
      <rect x="2.5" y="3" width="19" height="18" rx="3" opacity=".45" />
    </svg>
  ),
};

/* --------------------------------------------------------------- buttons */

type BtnProps = {
  children: ReactNode;
  onClick?: () => void;
  variant?: 'default' | 'primary' | 'soft' | 'quiet' | 'danger';
  size?: 'sm' | 'md';
  block?: boolean;
  disabled?: boolean;
  type?: 'button' | 'submit';
  className?: string;
  ariaLabel?: string;
  style?: React.CSSProperties;
};

export function Button({
  children,
  onClick,
  variant = 'default',
  size = 'md',
  block,
  disabled,
  type = 'button',
  className = '',
  ariaLabel,
  style,
}: BtnProps) {
  const cls = [
    'btn',
    variant !== 'default' ? `btn-${variant}` : '',
    size === 'sm' ? 'btn-sm' : '',
    block ? 'btn-block' : '',
    className,
  ]
    .filter(Boolean)
    .join(' ');
  return (
    <button
      type={type}
      className={cls}
      onClick={onClick}
      disabled={disabled}
      aria-label={ariaLabel}
      style={style}
    >
      {children}
    </button>
  );
}

export function IconButton({
  children,
  onClick,
  label,
  className = '',
}: {
  children: ReactNode;
  onClick?: () => void;
  label: string;
  className?: string;
}) {
  return (
    <button type="button" className={`icon-btn ${className}`} onClick={onClick} aria-label={label} title={label}>
      {children}
    </button>
  );
}

/* --------------------------------------------------------------- sheet */

export function Sheet({
  open,
  onClose,
  title,
  subtitle,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  children: ReactNode;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
    };
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div
      className="sheet-backdrop"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="sheet" role="dialog" aria-modal="true" aria-label={title}>
        <div className="sheet-grab" />
        <div className="row-between" style={{ marginBottom: 12 }}>
          <div>
            <h2>{title}</h2>
            {subtitle ? <p className="small muted" style={{ marginTop: 2 }}>{subtitle}</p> : null}
          </div>
          <IconButton label="Close" onClick={onClose}>
            <Icon.Close />
          </IconButton>
        </div>
        {children}
      </div>
    </div>
  );
}

/* --------------------------------------------------------------- toast */

export function Toast({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <div className="toast-wrap">
      <div className="toast" role="status">
        {message}
      </div>
    </div>
  );
}

/* --------------------------------------------------------------- misc */

export function Empty({
  title,
  body,
  action,
}: {
  title: string;
  body: string;
  action?: ReactNode;
}) {
  return (
    <div className="empty">
      <h3>{title}</h3>
      <p>{body}</p>
      {action}
    </div>
  );
}

export function Chip({
  children,
  tone = 'plain',
  active,
  onClick,
}: {
  children: ReactNode;
  tone?: 'plain' | 'brand' | 'fast' | 'slow';
  active?: boolean;
  onClick?: () => void;
}) {
  const cls = ['chip', tone !== 'plain' ? tone : '', onClick ? 'chip-button' : '', active ? 'active' : '']
    .filter(Boolean)
    .join(' ');
  if (!onClick) return <span className={cls}>{children}</span>;
  return (
    <button type="button" className={cls} onClick={onClick} aria-pressed={!!active}>
      {children}
    </button>
  );
}

export function Switch({
  checked,
  onChange,
  label,
  hint,
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
  label: string;
  hint?: string;
}) {
  return (
    <div className="toggle-row">
      <div>
        <div className="label">{label}</div>
        {hint ? <div className="hint">{hint}</div> : null}
      </div>
      <button
        type="button"
        className="switch"
        role="switch"
        aria-checked={checked}
        aria-label={label}
        onClick={() => onChange(!checked)}
      />
    </div>
  );
}

export function BackBar({ onBack, title, right }: { onBack: () => void; title: string; right?: ReactNode }) {
  return (
    <div className="row-between" style={{ marginBottom: 10 }}>
      <button type="button" className="btn btn-quiet" onClick={onBack} style={{ marginLeft: -10 }}>
        <Icon.Back /> Back
      </button>
      <div className="row" style={{ gap: 6 }}>
        <span className="eyebrow truncate">{title}</span>
        {right}
      </div>
    </div>
  );
}
