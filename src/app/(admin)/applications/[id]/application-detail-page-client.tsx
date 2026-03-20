"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Copy } from "lucide-react";

import {
  ChatContainerContent,
  ChatContainerRoot,
  ChatContainerScrollAnchor,
} from "@/components/ui/chat-container";
import { Message, MessageAvatar, MessageContent } from "@/components/ui/message";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Separator } from "@/components/ui/separator";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { formatDateTime } from "@/lib/format-datetime";
import { applicationUpdateSchema } from "@/services/validation";
import { usePatchApplicationMutation } from "@/hooks/api";
import { apiRoutes } from "@/lib/api-routes";
import { ApiError } from "@/lib/api-http";

type ApplicationDetail = {
  id: string;
  studentNameUa: string;
  studentNameEn: string;
  deliveryMode: string;
  deliveryCity: string | null;
  deliveryBranch: string | null;
  deliveryAddress: string | null;
  deliveryCountry: string | null;
  deliveryPhone: string | null;
  deliveryEmail: string | null;
  score: number | null;
  feedbackText: string | null;
  status: string;
  managerCheckedAt: string | null;
  createdAt: string;
  courses: Array<{
    bprRequired: boolean;
    course: {
      id: string;
      title: string;
      daysToSend: number;
      bprSpecialtyCheckLink: string | null;
      bprTestLink: string | null;
    };
    certificateFormat: string;
  }>;
  screenshots: Array<{ id: string; fileId: string; sortOrder: number }>;
  school: { id: string; name: string; slug: string };
  statusHistory?: Array<{
    fromStatus: string;
    toStatus: string;
    changedAt: string;
  }>;
};

type ChatEntry = {
  id: string;
  createdAt: string;
  direction: "user" | "bot";
  contentType: "text" | "photo" | "callback";
  content: string;
};

const STATUS_LABELS: Record<string, string> = {
  new: "Нова",
  submitted: "На перевірці",
  approved: "Підтверджено",
  rejected: "Відхилено",
};

const DELIVERY_LABELS: Record<string, string> = {
  none: "—",
  ua: "Україна",
  abroad: "За кордон",
};

const CERTIFICATE_FORMAT_LABELS: Record<string, string> = {
  electronic: "Електронний",
  physical: "Фізичний (друкований)",
  both: "Електронний і фізичний",
};

export function ApplicationDetailPageClient({
  application,
  chatHistory,
}: {
  application: ApplicationDetail;
  chatHistory: ChatEntry[];
}) {
  const router = useRouter();
  const patchApplication = usePatchApplicationMutation();

  const [statusDraft, setStatusDraft] = useState<string>(application.status);
  useEffect(() => {
    setStatusDraft(application.status);
  }, [application.status]);

  const canApplyStatus = statusDraft !== application.status && !patchApplication.isPending;

  const sortedScreenshots = useMemo(() => {
    return [...application.screenshots].sort((a, b) => a.sortOrder - b.sortOrder);
  }, [application.screenshots]);

  async function handleApplyStatus() {
    const parsed = applicationUpdateSchema.safeParse({ status: statusDraft });
    if (!parsed.success) {
      toast.error(parsed.error.issues[0]?.message ?? "Невірні дані для оновлення");
      return;
    }
    try {
      await patchApplication.mutateAsync({ applicationId: application.id, body: parsed.data });
      toast.success("Статус оновлено");
      router.refresh();
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "Не вдалося оновити статус");
    }
  }

  async function handleCopyApplicationId() {
    try {
      await navigator.clipboard.writeText(application.id);
      toast.success("ID скопійовано");
    } catch {
      toast.error("Не вдалося скопіювати ID");
    }
  }

  return (
    <div className="grid gap-8 lg:grid-cols-2">
      <div className="space-y-6">
        <Card>
          <CardHeader>
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <CardTitle className="text-lg">Заявка #{application.id.slice(0, 8)}</CardTitle>
                <CardDescription>{application.school.name}</CardDescription>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="outline">{STATUS_LABELS[application.status] ?? application.status}</Badge>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="gap-2"
                  onClick={() => void handleCopyApplicationId()}
                >
                  <Copy size={16} />
                  ID
                </Button>
              </div>
            </div>
          </CardHeader>

          <CardContent className="space-y-6">
            <section className="space-y-3">
              <div>
                <h3 className="text-sm font-medium">Статус заявки</h3>
                <p className="text-xs text-muted-foreground">
                  Оберіть статус і натисніть “Зберегти” — так ви уникнете випадкових змін.
                </p>
              </div>

              <div className="flex flex-wrap items-end gap-2">
                <div className="min-w-56">
                  <Select
                    value={statusDraft}
                    onValueChange={(v) => {
                      if (typeof v === "string") setStatusDraft(v);
                    }}
                    disabled={patchApplication.isPending}
                  >
                    <SelectTrigger className="h-9 w-full">
                      <SelectValue>
                        {STATUS_LABELS[
                          statusDraft as keyof typeof STATUS_LABELS
                        ] ?? statusDraft}
                      </SelectValue>
                    </SelectTrigger>
                    <SelectContent>
                      {Object.entries(STATUS_LABELS).map(([value, label]) => (
                        <SelectItem key={value} value={value}>
                          {label}
                        </SelectItem>
                      ))}
                      {!STATUS_LABELS[application.status as keyof typeof STATUS_LABELS] ? (
                        <SelectItem value={application.status}>{application.status}</SelectItem>
                      ) : null}
                    </SelectContent>
                  </Select>
                </div>

                <Button type="button" className="min-w-36" disabled={!canApplyStatus} onClick={() => void handleApplyStatus()}>
                  {patchApplication.isPending ? "Зберігаю…" : "Зберегти"}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  className="min-w-36"
                  disabled={!canApplyStatus}
                  onClick={() => setStatusDraft(application.status)}
                >
                  Скинути
                </Button>
              </div>
            </section>

            <Separator />

            <section>
              <h3 className="text-sm font-medium">Контактні та адресні дані</h3>
              <dl className="mt-3 grid grid-cols-1 gap-x-6 gap-y-3 text-sm sm:grid-cols-2">
                <div className="space-y-1">
                  <dt className="text-xs font-medium text-muted-foreground">ПІБ (UA)</dt>
                  <dd className="break-words">{application.studentNameUa}</dd>
                </div>
                <div className="space-y-1">
                  <dt className="text-xs font-medium text-muted-foreground">ПІБ (EN)</dt>
                  <dd className="break-words">{application.studentNameEn}</dd>
                </div>
                <div className="space-y-1">
                  <dt className="text-xs font-medium text-muted-foreground">Доставка</dt>
                  <dd>
                    {DELIVERY_LABELS[application.deliveryMode] ?? application.deliveryMode}
                  </dd>
                </div>
                {application.deliveryCity && (
                  <div className="space-y-1">
                    <dt className="text-xs font-medium text-muted-foreground">Місто</dt>
                    <dd>{application.deliveryCity}</dd>
                  </div>
                )}
                {application.deliveryBranch && (
                  <div className="space-y-1">
                    <dt className="text-xs font-medium text-muted-foreground">Відділення</dt>
                    <dd>{application.deliveryBranch}</dd>
                  </div>
                )}
                {application.deliveryAddress && (
                  <div className="space-y-1 sm:col-span-2">
                    <dt className="text-xs font-medium text-muted-foreground">Адреса</dt>
                    <dd>{application.deliveryAddress}</dd>
                  </div>
                )}
                {application.deliveryCountry && (
                  <div className="space-y-1">
                    <dt className="text-xs font-medium text-muted-foreground">Країна</dt>
                    <dd>{application.deliveryCountry}</dd>
                  </div>
                )}
                {application.deliveryPhone && (
                  <div className="space-y-1">
                    <dt className="text-xs font-medium text-muted-foreground">Телефон</dt>
                    <dd>{application.deliveryPhone}</dd>
                  </div>
                )}
                {application.deliveryEmail && (
                  <div className="space-y-1 sm:col-span-2">
                    <dt className="text-xs font-medium text-muted-foreground">Email</dt>
                    <dd className="break-words">{application.deliveryEmail}</dd>
                  </div>
                )}
              </dl>
            </section>

            <section>
              <h3 className="text-sm font-medium">Курси</h3>
              <ul className="mt-3 space-y-3">
                {application.courses.map((ac) => {
                  const hasBpr = Boolean(ac.course.bprSpecialtyCheckLink || ac.course.bprTestLink);

                  return (
                    <li key={ac.course.id} className="rounded-lg border bg-muted/10 p-3">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="truncate font-medium">{ac.course.title}</div>
                          <div className="text-sm text-muted-foreground">
                            {CERTIFICATE_FORMAT_LABELS[ac.certificateFormat] ?? ac.certificateFormat}
                          </div>
                        </div>
                        {hasBpr && <Badge variant="secondary">БПР</Badge>}
                      </div>

                      {hasBpr && (
                        <div className="mt-2 flex flex-wrap items-center gap-3 text-sm">
                          <span className="text-muted-foreground">
                            Потрібне: {ac.bprRequired ? "Так" : "Ні"}
                          </span>
                          {ac.course.bprSpecialtyCheckLink && (
                            <a
                              href={ac.course.bprSpecialtyCheckLink}
                              target="_blank"
                              rel="noreferrer"
                              className="text-primary hover:underline"
                            >
                              Перевірка спеціальності
                            </a>
                          )}
                          {ac.course.bprTestLink && (
                            <a
                              href={ac.course.bprTestLink}
                              target="_blank"
                              rel="noreferrer"
                              className="text-primary hover:underline"
                            >
                              Тест БПР
                            </a>
                          )}
                        </div>
                      )}
                    </li>
                  );
                })}
              </ul>
            </section>

            {(application.score != null || application.feedbackText) && (
              <section>
                <h3 className="text-sm font-medium">Оцінка та відгук</h3>
                <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
                  {application.score != null && (
                    <div className="rounded-lg border bg-muted/10 p-3">
                      <div className="text-xs font-medium text-muted-foreground">Оцінка</div>
                      <div className="mt-1 text-lg font-semibold">{application.score}/10</div>
                    </div>
                  )}
                  {application.feedbackText && (
                    <div className="rounded-lg border bg-muted/10 p-3">
                      <div className="text-xs font-medium text-muted-foreground">Відгук</div>
                      <div className="mt-1 whitespace-pre-wrap text-sm">{application.feedbackText}</div>
                    </div>
                  )}
                </div>
              </section>
            )}

            {sortedScreenshots.length > 0 && (
              <section>
                <div className="flex items-center justify-between gap-3">
                  <h3 className="text-sm font-medium">Скріни</h3>
                  <span className="text-xs text-muted-foreground">{sortedScreenshots.length}</span>
                </div>

                <div className="mt-3 grid grid-cols-2 gap-2">
                  {sortedScreenshots.map((s, idx) => (
                    <Dialog key={s.id}>
                      <DialogTrigger>
                        <button
                          type="button"
                          className="group w-full overflow-hidden rounded-lg border bg-background text-left hover:bg-muted/30"
                          aria-label={`Відкрити скрін #${idx + 1}`}
                        >
                          {/* eslint-disable-next-line @next/next/no-img-element -- Dynamic API proxy, auth required */}
                          <img
                            src={apiRoutes.applicationScreenshotsImage(application.id, s.id)}
                            alt={`Screenshot ${idx + 1}`}
                            className="h-32 w-full object-contain p-2 transition-transform duration-150 group-hover:scale-[1.02]"
                          />
                        </button>
                      </DialogTrigger>
                      <DialogContent className="sm:max-w-5xl">
                        <DialogHeader>
                          <DialogTitle>Скрін #{idx + 1}</DialogTitle>
                          <DialogDescription>Заявка #{application.id.slice(0, 8)}</DialogDescription>
                        </DialogHeader>
                        <div className="mt-2 flex justify-center">
                          {/* eslint-disable-next-line @next/next/no-img-element -- Dynamic API proxy, auth required */}
                          <img
                            src={apiRoutes.applicationScreenshotsImage(application.id, s.id)}
                            alt={`Screenshot ${idx + 1}`}
                            className="max-h-[70vh] w-auto rounded-lg object-contain"
                          />
                        </div>
                      </DialogContent>
                    </Dialog>
                  ))}
                </div>
              </section>
            )}

            {application.statusHistory && application.statusHistory.length > 0 && (
              <section>
                <h3 className="text-sm font-medium">Історія статусів</h3>
                <ul className="mt-3 space-y-2 text-sm">
                  {application.statusHistory.map((h, i) => (
                    <li
                      key={i}
                      className="rounded-lg border bg-muted/10 px-3 py-2"
                    >
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-medium">{STATUS_LABELS[h.fromStatus] ?? h.fromStatus}</span>
                        <span aria-hidden className="text-muted-foreground">
                          →
                        </span>
                        <span className="font-medium">{STATUS_LABELS[h.toStatus] ?? h.toStatus}</span>
                        <span className="text-muted-foreground">
                          — {formatDateTime(h.changedAt)}
                        </span>
                      </div>
                    </li>
                  ))}
                </ul>
              </section>
            )}
          </CardContent>

          <CardFooter className="justify-between gap-4 text-xs text-muted-foreground">
            <span>
              Створено: {formatDateTime(application.createdAt)}
            </span>
            {application.managerCheckedAt && (
              <span>
                Підтверджено: {formatDateTime(application.managerCheckedAt)}
              </span>
            )}
          </CardFooter>
        </Card>
      </div>

      <Card className="h-full">
        <CardHeader>
          <div className="flex items-start justify-between gap-3">
            <div>
              <CardTitle className="text-lg">Історія чату</CardTitle>
              <CardDescription>
                Повний діалог між користувачем та ботом під час оформлення заявки.
              </CardDescription>
            </div>
            {chatHistory.length > 0 && (
              <Badge variant="outline">{chatHistory.length} повідомл.</Badge>
            )}
          </div>
        </CardHeader>
        <CardContent className="p-4 pt-0">
          <ChatContainerRoot className="max-h-[600px] min-h-[200px] flex-1 rounded-lg bg-muted/20 p-4">
            <ChatContainerContent className="gap-4">
              {chatHistory.length === 0 ? (
                <p className="py-8 text-center text-sm text-muted-foreground">
                  Немає записів чату для цієї заявки.
                </p>
              ) : (
                chatHistory.map((entry) => (
                  <Message
                    key={entry.id}
                    className={entry.direction === "user" ? "flex-row-reverse" : ""}
                  >
                    <MessageAvatar
                      src=""
                      alt={entry.direction === "user" ? "Користувач" : "Бот"}
                      fallback={entry.direction === "user" ? "К" : "Б"}
                    />
                    <div className="flex min-w-0 flex-1 flex-col gap-1">
                      <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        <span>{entry.direction === "user" ? "Користувач" : "Бот"}</span>
                        <span>{formatDateTime(entry.createdAt)}</span>
                        {entry.contentType === "photo" && (
                          <span className="rounded bg-muted px-1 py-0.5">Фото</span>
                        )}
                        {entry.contentType === "callback" && (
                          <span className="rounded bg-muted px-1 py-0.5">Кнопка</span>
                        )}
                      </div>
                      <MessageContent
                        markdown={false}
                        className="whitespace-pre-wrap break-words text-sm"
                      >
                        {entry.content}
                      </MessageContent>
                    </div>
                  </Message>
                ))
              )}
              <ChatContainerScrollAnchor />
            </ChatContainerContent>
          </ChatContainerRoot>
        </CardContent>
      </Card>
    </div>
  );
}
