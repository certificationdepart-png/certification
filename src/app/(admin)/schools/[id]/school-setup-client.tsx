"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useState } from "react";
import { toast } from "sonner";

import { CoursesSection } from "@/components/schools/courses-section";
import { SchoolApplicationsPanel } from "@/components/schools/school-applications-panel";
import type { CourseRow, TemplateRow } from "@/components/schools/school-admin-types";
import { SchoolOverviewForm } from "@/components/schools/school-overview-form";
import { TemplatesSection } from "@/components/schools/templates-section";
import { Button, buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useDeleteSchoolMutation, useSchoolsSyncAllMutation } from "@/hooks/api";
import { ApiError } from "@/lib/api-http";
import { routes } from "@/lib/routes";

type SchoolPublic = {
  id: string;
  name: string;
  schoolKey: string;
  telegramChatId: string;
  googleSheetUrl: string | null;
  hasTelegramBotToken: boolean;
  hasNovaPoshtaApiKey: boolean;
};

export function SchoolSetupClient({
  school,
  initialCourses,
  initialTemplates,
}: {
  school: SchoolPublic;
  initialCourses: CourseRow[];
  initialTemplates: TemplateRow[];
}) {
  const router = useRouter();
  const syncAll = useSchoolsSyncAllMutation();
  const deleteSchool = useDeleteSchoolMutation();
  const [screen, setScreen] = useState<"applications" | "settings">("applications");
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);

  const refresh = useCallback(() => {
    router.refresh();
  }, [router]);

  const handleSyncAll = useCallback(async () => {
    try {
      const payload = await syncAll.mutateAsync(school.id);
      const enqueued = payload.enqueued ?? 0;
      toast.success(`Поставлено в чергу: ${enqueued} заявок`);
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "Не вдалося запустити синхронізацію");
    }
  }, [school.id, syncAll]);

  const confirmDeleteSchool = useCallback(async () => {
    try {
      await deleteSchool.mutateAsync(school.id);
      toast.success("Школу видалено");
      setDeleteDialogOpen(false);
      router.push(routes.admin.schools);
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "Не вдалося видалити школу");
    }
  }, [deleteSchool, router, school.id]);

  const schoolOption = { id: school.id, name: school.name };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <Link
            href={routes.admin.schools}
            className={cn(buttonVariants({ variant: "ghost", size: "sm" }), "mb-1 -ml-2 h-8 px-2")}
          >
            ← Усі школи
          </Link>
          <h1 className="text-2xl font-semibold tracking-tight">{school.name}</h1>
        </div>
        <div className="flex shrink-0 flex-wrap items-center gap-2 sm:justify-end">
          {screen === "applications" ? (
            <Button type="button" onClick={() => setScreen("settings")}>
              Редагувати школу
            </Button>
          ) : (
            <Button type="button" variant="outline" onClick={() => setScreen("applications")}>
              До заявок
            </Button>
          )}
        </div>
      </div>

      {screen === "applications" ? (
        <div className="space-y-2">
          <h2 className="text-lg font-medium">Заявки</h2>
          <SchoolApplicationsPanel schoolId={school.id} schoolName={school.name} />
        </div>
      ) : (
        <>
        <Tabs defaultValue="overview" className="space-y-6">
          <TabsList className="flex h-auto w-full flex-wrap justify-start gap-1">
            <TabsTrigger value="overview">Огляд</TabsTrigger>
            <TabsTrigger value="courses">Курси</TabsTrigger>
            <TabsTrigger value="templates">Шаблони</TabsTrigger>
            <TabsTrigger value="operations">Операції</TabsTrigger>
          </TabsList>

          <TabsContent value="overview" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>Дані та інтеграції</CardTitle>
                <CardDescription>Telegram, Нова Пошта та Google Таблиця для цієї школи.</CardDescription>
              </CardHeader>
              <CardContent>
                <SchoolOverviewForm
                  key={school.id}
                  initial={{
                    id: school.id,
                    schoolKey: school.schoolKey,
                    name: school.name,
                    telegramChatId: school.telegramChatId,
                    googleSheetUrl: school.googleSheetUrl ?? "",
                    telegramBotToken: "",
                    novaPoshtaApiKey: "",
                    hasTelegramBotToken: school.hasTelegramBotToken,
                    hasNovaPoshtaApiKey: school.hasNovaPoshtaApiKey,
                  }}
                  onSaved={refresh}
                />
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="courses">
            <CoursesSection
              key={school.id}
              schools={[schoolOption]}
              selectedSchoolId={school.id}
              initialCourses={initialCourses}
              initialCoursesSchoolId={school.id}
              hideSchoolSelect
            />
          </TabsContent>

          <TabsContent value="templates">
            <TemplatesSection
              key={school.id}
              schools={[schoolOption]}
              selectedSchoolId={school.id}
              initialTemplates={initialTemplates}
              initialTemplatesSchoolId={school.id}
              hideSchoolSelect
            />
          </TabsContent>

          <TabsContent value="operations" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>Швидкі дії</CardTitle>
                <CardDescription>Заявки, черга синхронізації та масовий вивід у Google Sheets.</CardDescription>
              </CardHeader>
              <CardContent className="flex flex-col gap-3 sm:flex-row sm:flex-wrap">
                <Link
                  href={`${routes.admin.applications}?schoolId=${encodeURIComponent(school.id)}`}
                  className={cn(buttonVariants())}
                >
                  Усі заявки (фільтри)
                </Link>
                <Link
                  href={`${routes.admin.sync}?schoolId=${encodeURIComponent(school.id)}`}
                  className={cn(buttonVariants({ variant: "outline" }))}
                >
                  Черга синхронізації
                </Link>
                <Button variant="secondary" disabled={syncAll.isPending} onClick={() => void handleSyncAll()}>
                  {syncAll.isPending ? "Синхронізація…" : "Синхронізувати всі заявки в Sheets"}
                </Button>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>

        <Card className="border-destructive/30">
          <CardHeader>
            <CardTitle className="text-destructive">Небезпечна зона</CardTitle>
            <CardDescription>
              Видалення школи назавжди прибирає курси, шаблони, заявки та пов&apos;язані дані.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button type="button" variant="destructive" onClick={() => setDeleteDialogOpen(true)}>
              Видалити школу
            </Button>
          </CardContent>
        </Card>

        <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Видалити школу?</AlertDialogTitle>
              <AlertDialogDescription>
                Школа «{school.name}» та всі пов&apos;язані курси, шаблони, заявки та сесії будуть видалені без
                можливості відновлення.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Скасувати</AlertDialogCancel>
              <AlertDialogAction
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                disabled={deleteSchool.isPending}
                onClick={() => void confirmDeleteSchool()}
              >
                {deleteSchool.isPending ? "Видалення…" : "Видалити"}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
        </>
      )}
    </div>
  );
}
