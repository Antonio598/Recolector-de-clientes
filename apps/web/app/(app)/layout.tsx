import { Sidebar } from "@/components/sidebar";
import { requireUser } from "@/lib/auth";
import type { Role } from "@growvibe/core";

export const dynamic = "force-dynamic";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  return (
    <div className="md:flex">
      <Sidebar role={user.role as Role} name={user.fullName ?? user.email} />
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-6 md:px-8 md:py-8">{children}</main>
    </div>
  );
}
