import { listSchools } from "@/services/schools.service";
import { ApplicationsClient } from "./applications-client";

export default async function ApplicationsPage() {
  const schools = await listSchools();
  const schoolOptions = schools.map((s) => ({ id: s.id, name: s.name }));

  return <ApplicationsClient initialSchools={schoolOptions} />;
}
