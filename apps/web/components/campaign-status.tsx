import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

const STYLES: Record<string, { label: string; className: string }> = {
  borrador: { label: "Borrador", className: "bg-slate-100 text-slate-700" },
  buscando: { label: "Buscando", className: "bg-sky-100 text-sky-800" },
  lista: { label: "Lista", className: "bg-brand-100 text-brand-700" },
  enviando: { label: "Enviando", className: "bg-violet-100 text-violet-800" },
  pausada: { label: "Pausada", className: "bg-amber-100 text-amber-800" },
  terminada: { label: "Terminada", className: "bg-slate-200 text-slate-600" },
};

export function CampaignStatus({ status }: { status: string }) {
  const s = STYLES[status] ?? { label: status, className: "" };
  return <Badge className={cn(s.className)}>{s.label}</Badge>;
}
