import Link from "next/link";

import { getApplicationById, getApplicationChatHistory } from "@/services/applications.service";
import { ApplicationDetailPageClient } from "./application-detail-page-client";
import { Button } from "@/components/ui/button";
import { routes } from "@/lib/routes";

type Props = { params: Promise<{ id: string }> };

export default async function ApplicationDetailPage({ params }: Props) {
  const { id } = await params;
  const [application, chatHistory] = await Promise.all([
    getApplicationById(id),
    getApplicationChatHistory(id),
  ]);

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Link href={routes.admin.applications}>
          <Button variant="ghost" size="sm">
            ← Назад до заявок
          </Button>
        </Link>
      </div>
      <ApplicationDetailPageClient
        application={JSON.parse(JSON.stringify(application))}
        chatHistory={JSON.parse(JSON.stringify(chatHistory))}
      />
    </div>
  );
}
