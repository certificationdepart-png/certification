import type { ApplicationStatus, DeliveryMode } from "@prisma/client";

export type SchoolOption = { id: string; name: string };

// Shape returned by `listApplications()` API (see `src/services/applications.service.ts`).
export type ApplicationListItem = {
  id: string;
  studentNameUa: string;
  studentNameEn: string;
  status: ApplicationStatus;
  deliveryMode: DeliveryMode;
  score: number | null;
  createdAt: string; // JSON serialized DateTime
  courses: Array<{ course: { title: string } }>;
  _count: { screenshots: number };
  // Present as scalar fields on `Application` model (not explicitly selected, but included by Prisma).
  feedbackText: string | null;
  managerCheckedAt: string | null;
};

