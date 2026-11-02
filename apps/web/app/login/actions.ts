"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { login, logout } from "@/lib/auth";

const schema = z.object({
  email: z.string().email("Email inválido"),
  password: z.string().min(6, "Mínimo 6 caracteres"),
});

export async function signIn(_prev: { error?: string } | undefined, formData: FormData) {
  const parsed = schema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.issues[0]?.message };

  let ok: boolean;
  try {
    ok = await login(parsed.data.email, parsed.data.password);
  } catch (e) {
    console.error("[login] error de base de datos:", e);
    return { error: "No se pudo conectar con la base de datos. Revisa DATABASE_URL." };
  }
  if (!ok) return { error: "Email o contraseña incorrectos" };
  redirect("/");
}

export async function signOut() {
  await logout();
  redirect("/login");
}
