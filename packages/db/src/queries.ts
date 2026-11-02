import { and, asc, eq, gt, sql } from "drizzle-orm";
import type { Db } from "./client";
import { profiles, sessions, settings, type Profile, type Settings } from "./schema";

export type PublicUser = Omit<Profile, "passwordHash">;

const publicUserColumns = {
  id: profiles.id,
  email: profiles.email,
  fullName: profiles.fullName,
  role: profiles.role,
  createdAt: profiles.createdAt,
};

export async function findUserByEmail(db: Db, email: string): Promise<Profile | undefined> {
  const [row] = await db
    .select()
    .from(profiles)
    .where(sql`lower(${profiles.email}) = lower(${email})`);
  return row;
}

export async function listUsers(db: Db): Promise<PublicUser[]> {
  return db.select(publicUserColumns).from(profiles).orderBy(asc(profiles.fullName));
}

export async function createUser(
  db: Db,
  data: { email: string; passwordHash: string; fullName: string; role: "admin" | "vendedor" },
): Promise<PublicUser> {
  const [row] = await db.insert(profiles).values(data).returning(publicUserColumns);
  return row!;
}

export async function setUserRole(db: Db, id: string, role: "admin" | "vendedor") {
  await db.update(profiles).set({ role }).where(eq(profiles.id, id));
}

// ───────────── sesiones ─────────────

export async function insertSession(db: Db, id: string, userId: string, expiresAt: Date) {
  await db.insert(sessions).values({ id, userId, expiresAt });
}

/** Usuario dueño de una sesión vigente, o undefined. */
export async function getSessionUser(db: Db, sessionId: string): Promise<PublicUser | undefined> {
  const [row] = await db
    .select(publicUserColumns)
    .from(sessions)
    .innerJoin(profiles, eq(profiles.id, sessions.userId))
    .where(and(eq(sessions.id, sessionId), gt(sessions.expiresAt, new Date())));
  return row;
}

export async function deleteSession(db: Db, sessionId: string) {
  await db.delete(sessions).where(eq(sessions.id, sessionId));
}

// ───────────── ajustes ─────────────

export async function getSettings(db: Db): Promise<Settings | undefined> {
  const [row] = await db.select().from(settings).where(eq(settings.id, 1));
  return row;
}

export async function updateSettings(db: Db, data: Omit<Settings, "id">) {
  await db.update(settings).set(data).where(eq(settings.id, 1));
}
