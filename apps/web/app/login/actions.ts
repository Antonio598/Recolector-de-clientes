"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { supabaseServer } from "@/lib/supabase";

const schema = z.object({
  email: z.string().email("Email inválido"),
  password: z.string().min(6, "Mínimo 6 caracteres"),
});

export async function signIn(_prev: { error?: string } | undefined, formData: FormData) {
  const parsed = schema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.issues[0]?.message };

  let error: { status?: number; code?: string; message: string } | null = null;
  try {
    const db = await supabaseServer();
    ({ error } = await db.auth.signInWithPassword(parsed.data));
  } catch (e) {
    // Red/TLS: la URL de Supabase no responde o su certificado no es válido.
    console.error("[login] no se pudo conectar con Supabase:", e);
    return { error: "No se pudo conectar con Supabase. Revisa NEXT_PUBLIC_SUPABASE_URL y su certificado HTTPS." };
  }
  if (error) {
    console.error("[login] error de Supabase:", error.status, error.code, error.message);
    if (error.code === "invalid_credentials") return { error: "Email o contraseña incorrectos" };
    if (error.status === 401 || /invalid authentication credentials|api key/i.test(error.message)) {
      return { error: "Supabase rechazó la API key: NEXT_PUBLIC_SUPABASE_ANON_KEY no coincide con la de tu Supabase." };
    }
    return { error: `Error de Supabase (${error.status ?? "?"}): ${error.message}` };
  }
  redirect("/");
}

export async function signOut() {
  const db = await supabaseServer();
  await db.auth.signOut();
  redirect("/login");
}
