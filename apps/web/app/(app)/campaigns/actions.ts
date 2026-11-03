"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import {
  editedNichesSchema,
  newCampaignSchema,
  nichesToQueries,
  planJobId,
  runJobId,
  type Niche,
} from "@growvibe/core";
import { createCampaign, getCampaign, getDb, updateCampaign } from "@growvibe/db";
import { requireRole } from "@/lib/auth";
import { enqueueUnique } from "@/lib/queue";

export type FormState = { error?: string } | undefined;

export async function createCampaignAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const me = await requireRole("admin");
  const parsed = newCampaignSchema.safeParse({
    zone: formData.get("zone"),
    service: formData.get("service"),
    channels: formData.getAll("channels"),
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message };

  const campaign = await createCampaign(getDb(), { ...parsed.data, createdBy: me.id });
  try {
    await enqueueUnique("search", "plan", { campaignId: campaign.id }, planJobId(campaign.id));
  } catch (e) {
    console.error("[campaigns] no se pudo encolar el plan:", e);
    return { error: "La campaña se guardó, pero no hay conexión con Redis para procesarla. Revisa REDIS_URL." };
  }
  redirect(`/campaigns/${campaign.id}`);
}

/** Vuelve a pedir a Claude los giros (descarta los actuales). */
export async function replanAction(campaignId: string) {
  await requireRole("admin");
  const db = getDb();
  const campaign = await getCampaign(db, campaignId);
  if (!campaign || campaign.status !== "borrador") return;
  await updateCampaign(db, campaignId, { niches: null });
  await enqueueUnique("search", "plan", { campaignId }, planJobId(campaignId));
  revalidatePath(`/campaigns/${campaignId}`);
}

/** Guarda los giros editados y lanza la búsqueda en Google Places. */
export async function confirmPlanAction(campaignId: string, niches: Niche[]): Promise<FormState> {
  await requireRole("admin");
  const parsed = editedNichesSchema.safeParse(niches);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return { error: issue ? `${issue.path.join(" › ")}: ${issue.message}` : "Giros inválidos" };
  }
  const db = getDb();
  const campaign = await getCampaign(db, campaignId);
  if (!campaign) return { error: "La campaña no existe" };
  if (campaign.status !== "borrador") return { error: "La búsqueda ya se lanzó" };

  await updateCampaign(db, campaignId, {
    niches: parsed.data,
    queries: nichesToQueries(parsed.data),
    status: "buscando",
  });
  await enqueueUnique("search", "run", { campaignId }, runJobId(campaignId));
  revalidatePath(`/campaigns/${campaignId}`);
  return undefined;
}

/** Reintenta una búsqueda que falló (los leads ya guardados no se duplican). */
export async function retryRunAction(campaignId: string) {
  await requireRole("admin");
  await enqueueUnique("search", "run", { campaignId }, runJobId(campaignId));
  revalidatePath(`/campaigns/${campaignId}`);
}
