import type { ReactNode } from 'react';

/** A kind tag: Story, Analysis, Tool (spec section 3.5). Mono caps in --ink-3 on --paper-sunk. */
export default function Tag({ children, className }: { children: ReactNode; className?: string }) {
  return <span className={`tag${className ? ` ${className}` : ''}`}>{children}</span>;
}
