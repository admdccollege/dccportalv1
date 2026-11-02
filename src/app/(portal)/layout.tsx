import { redirect } from "next/navigation";
import { requireRole } from "@/lib/auth";
import { PortalNav } from "@/components/portal-nav";

export default async function PortalLayout({ children }: { children: React.ReactNode }) {
  const profile = await requireRole();
  if (profile.must_change_password) redirect("/reset-password");
  return (
    <div className="min-h-dvh md:flex">
      <PortalNav role={profile.role} name={profile.full_name} />
      <main className="mx-auto w-full max-w-6xl flex-1 p-4 pb-24 md:p-6">{children}</main>
    </div>
  );
}
