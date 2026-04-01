import { headers } from "next/headers";

import { auth } from "@/lib/auth";
import { listSchools, listSchoolsForUser } from "@/services/schools.service";
import { ApplicationsBoardClient } from "@/components/applications/applications-board/applications-board-client";

export default async function DashboardPage() {
  const session = await auth.api.getSession({ headers: await headers() });
  const role = (session?.user as unknown as { role?: string | null })?.role ?? "user";
  const schools = role === "admin"
    ? await listSchools()
    : await listSchoolsForUser(session!.user.id);

  return (
    <div className="space-y-6">
      <section className="space-y-4">
        <h2 className="text-lg font-semibold">Заявки (менеджер)</h2>
        <ApplicationsBoardClient schools={schools.map((s) => ({ id: s.id, name: s.name }))} />
      </section>
    </div>
  );
}
