import { useEffect, type ReactNode } from 'react';

import { Icon } from './Icon';

export { Icon } from './Icon';
export type { IconName } from './Icon';

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
            <Icon name="close" />
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
        <Icon name="back" /> Back
      </button>
      <div className="row" style={{ gap: 6 }}>
        <span className="eyebrow truncate">{title}</span>
        {right}
      </div>
    </div>
  );
}
