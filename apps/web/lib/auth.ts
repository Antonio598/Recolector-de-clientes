import "server-only";
import { createHash, randomBytes } from "node:crypto";
import { cache } from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import bcrypt from "bcryptjs";
import type { Role } from "@growvibe/core";
import { serverEnv } from "@growvibe/core/env";
import {
  deleteSession,
  findUserByEmail,
  getDb,
  getSessionUser,
  insertSession,
  type PublicUser,
} from "@growvibe/db";

export const SESSION_COOKIE = "gv_session";
const SESSION_DAYS = 30;
const DUMMY_HASH = bcrypt.hashSync("growvibe-dummy", 12);

/** En la base solo se guarda el sha256 del token; la cookie lleva el token. */
const hashToken = (token: string) => createHash("sha256").update(token).digest("hex");

export async function hashPassword(password: string) {
  return bcrypt.hash(password, 12);
}

/** Verifica email + contraseña y abre sesión. Devuelve false si no coinciden. */
export async function login(email: string, password: string): Promise<boolean> {
  const db = getDb();
  const user = await findUserByEmail(db, email);
  // Compara aunque no exista el usuario para no revelar qué emails existen por el tiempo de respuesta.
  const ok = await bcrypt.compare(password, user?.passwordHash ?? DUMMY_HASH);
  if (!user || !ok) return false;

  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000);
  await insertSession(db, hashToken(token), user.id, expiresAt);

  const store = await cookies();
  store.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: serverEnv().APP_URL.startsWith("https://"),
    path: "/",
    expires: expiresAt,
  });
  return true;
}

export async function logout() {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  if (token) await deleteSession(getDb(), hashToken(token));
  store.delete(SESSION_COOKIE);
}

/** Usuario de la sesión actual (una consulta por request). */
export const currentUser = cache(async (): Promise<PublicUser | undefined> => {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) return undefined;
  return getSessionUser(getDb(), hashToken(token));
});

/** Exige sesión válida; si no hay, manda a /login. */
export async function requireUser() {
  const user = await currentUser();
  if (!user) redirect("/login?expired=1");
  return user;
}

/** Exige un rol; si no lo tiene, manda al inicio. */
export async function requireRole(role: Role) {
  const user = await requireUser();
  if (user.role !== role) redirect("/?denied=1");
  return user;
}
