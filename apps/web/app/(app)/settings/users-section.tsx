"use client";

import { useActionState, useEffect, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/input";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { createUser, setRole, type ActionResult } from "./actions";

type User = { id: string; full_name: string | null; role: string; email: string };

function notify(r: ActionResult) {
  if (!r) return;
  if (r.ok) toast.success(r.message);
  else toast.error(r.error);
}

export function UsersSection({ users, meId }: { users: User[]; meId: string }) {
  const [state, action, pending] = useActionState(createUser, undefined);
  const [changing, startTransition] = useTransition();

  useEffect(() => notify(state), [state]);

  return (
    <div className="flex flex-col gap-6">
      <Table>
        <THead>
          <TR>
            <TH>Nombre</TH>
            <TH>Email</TH>
            <TH>Rol</TH>
          </TR>
        </THead>
        <TBody>
          {users.map((u) => (
            <TR key={u.id}>
              <TD>{u.full_name ?? "—"}</TD>
              <TD className="text-slate-500">{u.email}</TD>
              <TD>
                <Select
                  defaultValue={u.role}
                  disabled={u.id === meId || changing}
                  onChange={(e) => startTransition(async () => notify(await setRole(u.id, e.target.value)))}
                >
                  <option value="admin">Admin</option>
                  <option value="vendedor">Vendedor</option>
                </Select>
              </TD>
            </TR>
          ))}
        </TBody>
      </Table>

      <form action={action} className="grid gap-3 border-t border-slate-200 pt-5 sm:grid-cols-[1fr_1fr_1fr_auto_auto]">
        <Input name="full_name" placeholder="Nombre" required />
        <Input name="email" type="email" placeholder="email@empresa.com" required />
        <Input name="password" type="password" placeholder="Contraseña inicial" minLength={8} required />
        <Select name="role" defaultValue="vendedor">
          <option value="vendedor">Vendedor</option>
          <option value="admin">Admin</option>
        </Select>
        <Button type="submit" disabled={pending}>
          {pending ? "Creando…" : "Agregar usuario"}
        </Button>
      </form>
    </div>
  );
}
