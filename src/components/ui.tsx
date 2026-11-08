import {
  useEffect,
  type ButtonHTMLAttributes,
  type ReactNode,
} from 'react';
import { Icon, type IconName } from './Icon';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'default' | 'primary' | 'quiet' | 'danger';
  block?: boolean;
}

export function Button({
  variant = 'default',
  block,
  className = '',
  children,
  ...rest
}: ButtonProps) {
  const classes = [
    'btn',
    variant !== 'default' ? `btn-${variant}` : '',
    block ? 'btn-block' : '',
    className,
  ]
    .filter(Boolean)
    .join(' ');
  return (
    <button type="button" className={classes} {...rest}>
      {children}
    </button>
  );
}

export function IconButton({
  label,
  children,
  className = '',
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { label: string }) {
  return (
    <button
      type="button"
      className={`icon-btn ${className}`.trim()}
      aria-label={label}
      title={label}
      {...rest}
    >
      {children}
    </button>
  );
}

export function Sheet({
  open,
  onClose,
  title,
  subtitle,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title?: string;
  subtitle?: string;
  children: ReactNode;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
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
        {(title || subtitle) && (
          <div className="sheet-head">
            <div>
              {title && <h2>{title}</h2>}
              {subtitle && <p className="small">{subtitle}</p>}
            </div>
            <IconButton label="Close" onClick={onClose} className="sheet-close">
              <Icon name="close" size={16} />
            </IconButton>
          </div>
        )}
        {children}
      </div>
    </div>
  );
}

export function Toast({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <div className="toast-wrap" role="status" aria-live="polite">
      <div className="toast">
        <Icon name="check" size={14} />
        <span>{message}</span>
      </div>
    </div>
  );
}

export function Empty({
  icon = 'songs',
  title,
  body,
  action,
}: {
  icon?: IconName;
  title: string;
  body: string;
  action?: ReactNode;
}) {
  return (
    <div className="empty">
      <div className="empty-icon">
        <Icon name={icon} size={22} />
      </div>
      <h3>{title}</h3>
      <p>{body}</p>
      {action && <div className="empty-actions">{action}</div>}
    </div>
  );
}

export function Chip({
  tone,
  children,
}: {
  tone?: 'brand' | 'fast' | 'slow' | 'warn';
  children: ReactNode;
}) {
  return <span className={`chip ${tone ?? ''}`.trim()}>{children}</span>;
}

export function Switch({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
  label: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      className="switch"
      onClick={() => onChange(!checked)}
    />
  );
}

export function BackBar({
  onBack,
  label = 'Back',
  right,
}: {
  onBack: () => void;
  label?: string;
  right?: ReactNode;
}) {
  return (
    <div className="row-between backbar">
      <button type="button" className="btn btn-quiet backbar-btn" onClick={onBack}>
        <Icon name="back" size={16} />
        {label}
      </button>
      {right}
    </div>
  );
}

export { Icon };
