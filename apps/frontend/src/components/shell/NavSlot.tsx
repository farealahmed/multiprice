import Link from 'next/link';

import { NAV_ITEMS } from './nav-items';

export function NavSlot() {
  return (
    <nav aria-label="Primary navigation" className="topnav">
      {NAV_ITEMS.map((item) => (
        <Link href={item.href} key={item.href}>
          {item.label}
        </Link>
      ))}
    </nav>
  );
}
