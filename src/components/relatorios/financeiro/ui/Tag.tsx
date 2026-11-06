import type { ReactNode } from 'react';

export type TomTag = 'good' | 'warn' | 'bad' | 'lock' | 'new';

/** Chip (.tag) do protótipo. */
export function Tag({ tom, children }: { tom?: TomTag | ''; children: ReactNode }) {
  return <span className={tom ? `tag ${tom}` : 'tag'}>{children}</span>;
}
