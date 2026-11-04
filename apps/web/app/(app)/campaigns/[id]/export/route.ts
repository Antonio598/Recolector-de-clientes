import { toCsv } from "@growvibe/core";
import { getCampaign, getDb, listLeads } from "@growvibe/db";
import { requireRole } from "@/lib/auth";

export const dynamic = "force-dynamic";

const STATUS: Record<string, string> = { calificados: "calificado", pendientes: "nuevo", descartados: "descartado" };

/** CSV de leads de la campaña, con los mismos filtros (giro, estado) que la tabla. */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  await requireRole("admin");
  const { id } = await params;
  const db = getDb();
  const campaign = await getCampaign(db, id);
  if (!campaign) return new Response("No existe", { status: 404 });

  const { searchParams } = new URL(req.url);
  const giro = searchParams.get("giro");
  const status = STATUS[searchParams.get("estado") ?? ""];
  const leads = (await listLeads(db, id)).filter(
    (l) => (!giro || (l.niche ?? "Sin giro") === giro) && (!status || l.status === status),
  );

  const csv = toCsv(
    ["Negocio", "Giro", "Score", "Razón", "Estado", "Teléfono", "WhatsApp", "Email", "Sitio web", "Dirección", "Calificación", "Reseñas", "Google Maps"],
    leads.map((l) => [
      l.name,
      l.niche,
      l.score,
      l.scoreReason,
      l.status,
      l.phoneE164,
      l.hasWhatsapp ? "sí" : "no",
      l.email,
      l.website,
      l.address,
      l.rating,
      l.reviewsCount,
      l.mapsUrl,
    ]),
    [5],
  );
  const slug = campaign.service.normalize("NFD").replace(/[^a-zA-Z0-9]+/g, "-").replace(/^-|-$/g, "").toLowerCase() || "campana";
  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="leads-${slug}.csv"`,
    },
  });
}
