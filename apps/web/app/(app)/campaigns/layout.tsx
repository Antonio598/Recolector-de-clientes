import { requireRole } from "@/lib/auth";

// Protege /campaigns y todas sus subrutas (/campaigns/new, /campaigns/[id]).
export default async function CampaignsLayout({ children }: { children: React.ReactNode }) {
  await requireRole("admin");
  return children;
}
