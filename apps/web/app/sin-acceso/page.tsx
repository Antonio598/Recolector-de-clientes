import { redirect } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader } from "@/components/ui/card";
import { Logo } from "@/components/logo";
import { currentSession } from "@/lib/auth";
import { signOut } from "../login/actions";

export const dynamic = "force-dynamic";

export default async function NoAccessPage() {
  const session = await currentSession();
  if (!session) redirect("/login");
  if (session.profile) redirect("/");

  return (
    <main className="grid min-h-dvh place-items-center px-4">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <Logo className="text-lg" />
          <CardDescription>
            Tu cuenta ({session.user.email}) no tiene acceso a GrowVibe CRM. Pide a un administrador que te agregue.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form action={signOut}>
            <Button variant="outline" className="w-full">
              Cerrar sesión
            </Button>
          </form>
        </CardContent>
      </Card>
    </main>
  );
}
