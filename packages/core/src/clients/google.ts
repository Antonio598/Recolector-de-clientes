import { z } from "zod";
import type { Rect } from "../geo";

// ───────────── Geocoding ─────────────

const geocodeResponse = z.object({
  status: z.string(),
  error_message: z.string().optional(),
  results: z.array(
    z.object({
      formatted_address: z.string(),
      geometry: z.object({
        viewport: z.object({
          northeast: z.object({ lat: z.number(), lng: z.number() }),
          southwest: z.object({ lat: z.number(), lng: z.number() }),
        }),
      }),
    }),
  ),
});

/** Zona escrita por el usuario → viewport (rectángulo) de Google. */
export async function geocodeZone(apiKey: string, zone: string): Promise<{ rect: Rect; formattedAddress: string }> {
  const url = new URL("https://maps.googleapis.com/maps/api/geocode/json");
  url.searchParams.set("address", zone);
  url.searchParams.set("region", "mx");
  url.searchParams.set("language", "es");
  url.searchParams.set("key", apiKey);

  const res = await fetch(url, { signal: AbortSignal.timeout(15_000) });
  const data = geocodeResponse.parse(await res.json());
  if (data.status === "ZERO_RESULTS") throw new Error(`Google no encontró la zona "${zone}"`);
  if (data.status !== "OK" || !data.results[0]) {
    throw new Error(`Geocoding falló (${data.status}): ${data.error_message ?? "sin detalle"}`);
  }
  const { viewport } = data.results[0].geometry;
  return {
    formattedAddress: data.results[0].formatted_address,
    rect: {
      low: { latitude: viewport.southwest.lat, longitude: viewport.southwest.lng },
      high: { latitude: viewport.northeast.lat, longitude: viewport.northeast.lng },
    },
  };
}

// ───────────── Places API (New) · Text Search ─────────────

// El field mask define el costo: solo lo que se usa.
const FIELD_MASK = [
  "places.id",
  "places.displayName",
  "places.formattedAddress",
  "places.nationalPhoneNumber",
  "places.internationalPhoneNumber",
  "places.websiteUri",
  "places.rating",
  "places.userRatingCount",
  "places.types",
  "places.googleMapsUri",
  "places.businessStatus",
  "nextPageToken",
].join(",");

export const placeSchema = z.object({
  id: z.string(),
  displayName: z.object({ text: z.string() }).optional(),
  formattedAddress: z.string().optional(),
  nationalPhoneNumber: z.string().optional(),
  internationalPhoneNumber: z.string().optional(),
  websiteUri: z.string().optional(),
  rating: z.number().optional(),
  userRatingCount: z.number().optional(),
  types: z.array(z.string()).optional(),
  googleMapsUri: z.string().optional(),
  businessStatus: z.string().optional(),
});
export type Place = z.infer<typeof placeSchema>;

const searchTextResponse = z.object({
  places: z.array(placeSchema).default([]),
  nextPageToken: z.string().optional(),
});

export class GoogleApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

export async function searchText(
  apiKey: string,
  params: { textQuery: string; rect: Rect; pageToken?: string },
): Promise<{ places: Place[]; nextPageToken?: string }> {
  const res = await fetch("https://places.googleapis.com/v1/places:searchText", {
    method: "POST",
    signal: AbortSignal.timeout(20_000),
    headers: {
      "Content-Type": "application/json",
      "X-Goog-Api-Key": apiKey,
      "X-Goog-FieldMask": FIELD_MASK,
    },
    body: JSON.stringify({
      textQuery: params.textQuery,
      languageCode: "es",
      regionCode: "MX",
      pageSize: 20,
      locationRestriction: { rectangle: params.rect },
      ...(params.pageToken ? { pageToken: params.pageToken } : {}),
    }),
  });
  const json = await res.json();
  if (!res.ok) {
    const msg = (json as { error?: { message?: string } })?.error?.message ?? res.statusText;
    throw new GoogleApiError(res.status, `Places Text Search falló (${res.status}): ${msg}`);
  }
  return searchTextResponse.parse(json);
}
