import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { UnitLink } from '@/components/UnitsProvider';
import Arrow, { type ArrowDirection } from './Arrow';

/**
 * Buttons (spec section 3.5). Primary is the accent fill and appears at most once per screen region; secondary is an
 * ink outline; tertiary is text and an arrow. With `href` it is a link (internal paths keep the units choice through
 * UnitLink). `loading` shows a 16 px spinner and keeps the label; `disabled` is drawn at 40% with aria-disabled.
 */
export type ButtonVariant = 'primary' | 'secondary' | 'tertiary';

type Props = {
  variant?: ButtonVariant;
  compact?: boolean;
  block?: boolean;
  href?: string;
  arrow?: ArrowDirection | false;
  loading?: boolean;
  children: ReactNode;
} & Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'children'>;

export function buttonClass(variant: ButtonVariant = 'primary', { compact = false, block = false, loading = false, extra = '' } = {}) {
  return `btn btn-${variant}${compact ? ' is-compact' : ''}${block ? ' is-block' : ''}${loading ? ' is-loading' : ''}${extra ? ` ${extra}` : ''}`;
}

export default function Button({ variant = 'primary', compact, block, href, arrow, loading = false, disabled, className, children, type = 'button', ...rest }: Props) {
  const cls = buttonClass(variant, { compact, block, loading, extra: className });
  const tail = arrow === false ? null : arrow ? <Arrow dir={arrow} /> : variant === 'tertiary' ? <Arrow /> : null;
  const inner = <>{loading ? <span className="btn-spinner" aria-hidden="true" /> : null}<span>{children}</span>{tail}</>;
  if (href) {
    const external = /^https?:\/\//.test(href);
    return external
      ? <a className={cls} href={href}>{inner}</a>
      : <UnitLink className={cls} href={href}>{inner}</UnitLink>;
  }
  const off = disabled || loading;
  return (
    <button {...rest} type={type} className={cls} disabled={disabled} aria-disabled={off ? true : undefined} aria-busy={loading ? true : undefined}>
      {inner}
    </button>
  );
}
