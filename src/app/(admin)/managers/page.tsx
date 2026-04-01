import { listManagersWithAccess } from "@/services/managers.service";
import { listSchools } from "@/services/schools.service";
import { ManagersClient } from "./managers-client";

export default async function ManagersPage() {
  const [managers, schools] = await Promise.all([
    listManagersWithAccess(),
    listSchools(),
  ]);

  return (
    <ManagersClient
      initialManagers={managers}
      allSchools={schools.map((s) => ({ id: s.id, name: s.name }))}
    />
  );
}
