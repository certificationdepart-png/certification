import { listSchools } from "@/services/schools.service";

import { ApplicationsBoardClient } from "@/components/applications/applications-board/applications-board-client";

export default async function DashboardPage() {
  const schools = await listSchools();

  return (
    <div className="space-y-6">
      <section className="space-y-4">
        <h2 className="text-lg font-semibold">Заявки (менеджер)</h2>
        <ApplicationsBoardClient schools={schools.map((s) => ({ id: s.id, name: s.name }))} />
      </section>
    </div>
  );
}
