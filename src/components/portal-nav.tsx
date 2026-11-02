"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import {
  Bell, BookOpen, CalendarCheck, CalendarDays, ClipboardList, GraduationCap, LayoutDashboard,
  LogOut, Menu, Settings, Users, UserCog, Wallet, X, type LucideIcon,
} from "lucide-react";
import { logout } from "@/app/login/actions";
import { PushToggle } from "@/components/push-toggle";
import type { Role } from "@/lib/roles";

const ADMIN: Role[] = ["super_admin", "management", "principal"];
const STAFF: Role[] = [...ADMIN, "exam_cell", "faculty", "office_staff", "lab_technician"];
const LINKS: { href: string; label: string; icon: LucideIcon; roles?: Role[] }[] = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/students", label: "Students", icon: Users, roles: [...ADMIN, "exam_cell", "faculty", "office_staff"] },
  { href: "/attendance", label: "Attendance", icon: CalendarCheck, roles: [...ADMIN, "faculty", "lab_technician"] },
  { href: "/marks", label: "Marks", icon: ClipboardList, roles: [...ADMIN, "exam_cell", "faculty", "lab_technician"] },
  { href: "/results", label: "Results", icon: GraduationCap },
  { href: "/fees", label: "Fees", icon: Wallet, roles: [...ADMIN, "office_staff", "parent", "student"] },
  { href: "/notices", label: "Notices", icon: Bell },
  { href: "/timetable", label: "Timetable", icon: CalendarDays },
  { href: "/leave", label: "Leave", icon: CalendarDays, roles: STAFF },
  { href: "/library", label: "Library", icon: BookOpen },
  { href: "/people", label: "Staff accounts", icon: UserCog, roles: ADMIN },
  { href: "/setup", label: "Academic setup", icon: Settings, roles: ADMIN },
];

export function PortalNav({ role, name }: { role: Role; name: string }) {
  const path = usePathname();
  const [open, setOpen] = useState(false);
  const links = LINKS.filter((l) => !l.roles || l.roles.includes(role));
  const signOut = () => {
    navigator.serviceWorker?.controller?.postMessage("clear-private-cache");
  };
  return (
    <>
      <header className="sticky top-0 z-30 flex items-center justify-between bg-[var(--brand)] px-4 py-2 text-white md:hidden">
        <span className="font-semibold">DCC Portal</span>
        <button aria-label={open ? "Close menu" : "Open menu"} aria-expanded={open} onClick={() => setOpen((o) => !o)} className="flex size-11 items-center justify-center">
          {open ? <X aria-hidden /> : <Menu aria-hidden />}
        </button>
      </header>
      <nav aria-label="Main" className={`${open ? "block" : "hidden"} bg-[var(--brand)] p-3 text-white md:sticky md:top-0 md:block md:h-dvh md:w-60 md:shrink-0 md:overflow-y-auto`}>
        <div className="mb-4 hidden px-2 md:block">
          <p className="font-semibold">Damdei Christian College</p>
          <p className="truncate text-sm opacity-75">{name}</p>
        </div>
        <ul className="space-y-1">
          {links.map(({ href, label, icon: Icon }) => {
            const active = path === href || path.startsWith(`${href}/`);
            return (
              <li key={href}>
                <Link href={href} onClick={() => setOpen(false)} aria-current={active ? "page" : undefined}
                  className={`flex min-h-11 items-center gap-3 rounded-lg px-3 text-sm ${active ? "bg-white/15 font-semibold" : "hover:bg-white/10"}`}>
                  <Icon size={18} aria-hidden /> {label}
                </Link>
              </li>
            );
          })}
        </ul>
        <div className="mt-4 space-y-1 border-t border-white/20 pt-3">
          <PushToggle />
          <form action={logout} onSubmit={signOut}>
            <button className="flex min-h-11 w-full items-center gap-3 rounded-lg px-3 text-sm hover:bg-white/10"><LogOut size={18} aria-hidden /> Sign out</button>
          </form>
        </div>
      </nav>
    </>
  );
}
