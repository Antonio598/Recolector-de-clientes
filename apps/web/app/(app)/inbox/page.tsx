import { PageHeader } from "@/components/page-header";
import { Card, CardContent } from "@/components/ui/card";

export default function InboxPage() {
  return (
    <>
      <PageHeader title="Bandeja" description="Respuestas de WhatsApp y email." />
      <Card>
        <CardContent className="pt-5 text-sm text-slate-500">La bandeja de respuestas llega en la Fase 5.</CardContent>
      </Card>
    </>
  );
}
