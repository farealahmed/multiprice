import { Brand } from './Brand';
import { NavSlot } from './NavSlot';
import { UserSlot } from './UserSlot';

export function Topbar() {
  return (
    <header className="topbar">
      <Brand />
      <NavSlot />
      <UserSlot />
    </header>
  );
}
