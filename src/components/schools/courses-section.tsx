"use client";

import { useMemo, useState } from "react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { CourseCreateDialog } from "@/components/schools/course-create-dialog";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { useCoursesQuery, useDeleteCourseMutation, usePatchCourseMutation } from "@/hooks/api";
import { ApiError } from "@/lib/api-http";
import { courseUpdateSchema } from "@/services/validation";
import { cn } from "@/lib/utils";

import type { CourseRow, SchoolOption } from "./school-admin-types";

const SCHOOL_PLACEHOLDER_VALUE = "__no_school__";

type CourseEditFormState = {
  title: string;
  certificateType: CourseRow["certificateType"];
  daysToSend: number;
  reviewLink: string;
  requirementsText: string;
  bprEnabled: boolean;
  bprSpecialtyCheckLink: string;
  bprTestLink: string;
};

const initialEditForm: CourseEditFormState = {
  title: "",
  certificateType: "electronic",
  daysToSend: 1,
  reviewLink: "",
  requirementsText: "",
  bprEnabled: false,
  bprSpecialtyCheckLink: "",
  bprTestLink: "",
};

const certificateSelectLabels: Record<CourseEditFormState["certificateType"], string> = {
  electronic: "Електронний",
  physical: "Фізичний (друкований)",
  both: "Електронний і фізичний",
};

const certificateHints: Record<CourseEditFormState["certificateType"], string> = {
  electronic: "Студент отримує сертифікат електронно (файл, посилання тощо).",
  physical: "Сертифікат друкується та відправляється фізично (наприклад, поштою).",
  both: "Передбачено обидва варіанти — електронний і друкований.",
};

function certTypeLabel(t: string) {
  if (t === "electronic") return "Електронний";
  if (t === "physical") return "Фізичний";
  return "Обидва";
}

function daysWordUa(n: number): string {
  const x = n % 100;
  if (x >= 11 && x <= 14) return `${n} днів`;
  const r = n % 10;
  if (r === 1) return `${n} день`;
  if (r >= 2 && r <= 4) return `${n} дні`;
  return `${n} днів`;
}

function courseRowToForm(course: CourseRow): CourseEditFormState {
  const ct = course.certificateType;
  const certificateType: CourseEditFormState["certificateType"] =
    ct === "electronic" || ct === "physical" || ct === "both" ? ct : "electronic";
  return {
    title: course.title,
    certificateType,
    daysToSend: course.daysToSend,
    reviewLink: course.reviewLink ?? "",
    requirementsText: course.requirementsText,
    bprEnabled: course.bprEnabled,
    bprSpecialtyCheckLink: course.bprSpecialtyCheckLink ?? "",
    bprTestLink: course.bprTestLink ?? "",
  };
}

function CourseEditFormFields({
  form,
  setForm,
  idPrefix,
}: {
  form: CourseEditFormState;
  setForm: React.Dispatch<React.SetStateAction<CourseEditFormState>>;
  idPrefix: string;
}) {
  const pid = (s: string) => `${idPrefix}-${s}`;
  return (
    <div className="space-y-6">
      <div className="space-y-4">
        <div>
          <h4 className="text-sm font-medium">Основне</h4>
          <p className="text-muted-foreground text-xs">Як курс називається в системі та який формат сертифіката.</p>
        </div>
        <div className="space-y-2">
          <Label htmlFor={pid("title")}>Назва курсу</Label>
          <Input
            id={pid("title")}
            value={form.title}
            onChange={(e) => setForm((s) => ({ ...s, title: e.target.value }))}
            placeholder="Наприклад, «Python для початківців»"
            autoComplete="off"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor={pid("cert-type")}>Тип сертифіката</Label>
          <Select
            value={form.certificateType}
            onValueChange={(v) => {
              if (v == null) return;
              if (v !== "electronic" && v !== "physical" && v !== "both") return;
              setForm((s) => ({ ...s, certificateType: v }));
            }}
          >
            <SelectTrigger id={pid("cert-type")} className="h-9 w-full max-w-xl">
              <SelectValue placeholder="Оберіть тип сертифіката">
                {certificateSelectLabels[form.certificateType]}
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="electronic">{certificateSelectLabels.electronic}</SelectItem>
              <SelectItem value="physical">{certificateSelectLabels.physical}</SelectItem>
              <SelectItem value="both">{certificateSelectLabels.both}</SelectItem>
            </SelectContent>
          </Select>
          <p className="text-muted-foreground text-xs">{certificateHints[form.certificateType]}</p>
        </div>
      </div>

      <Separator />

      <div className="space-y-4">
        <div>
          <h4 className="text-sm font-medium">Підтвердження та відгук</h4>
          <p className="text-muted-foreground text-xs">
            Термін для тексту після перевірки менеджером і посилання на зовнішній відгук (як стовпець F).
          </p>
        </div>
        <div className="space-y-2">
          <Label htmlFor={pid("days")}>Термін, дні</Label>
          <Input
            id={pid("days")}
            type="number"
            min={0}
            max={365}
            inputMode="numeric"
            value={String(form.daysToSend)}
            onChange={(e) => setForm((s) => ({ ...s, daysToSend: Number(e.target.value) }))}
            className="max-w-[8rem]"
          />
          <p className="text-muted-foreground text-xs">
            За ТЗ (лист «Налаштування»): стовпець <span className="font-medium">E</span> — термін у днях для цього курсу.
            Після перевірки менеджером бот надсилає текст на кшталт «оформлення та відправку…{" "}
            <span className="font-medium">протягом N днів</span>» — підставляється це число. Допустимо{" "}
            <span className="font-medium">0</span>–<span className="font-medium">365</span>.
          </p>
        </div>
        <div className="space-y-2">
          <Label htmlFor={pid("review")}>Посилання на відгук</Label>
          <Input
            id={pid("review")}
            type="url"
            value={form.reviewLink}
            onChange={(e) => setForm((s) => ({ ...s, reviewLink: e.target.value }))}
            placeholder="https://… (необов'язково)"
            autoComplete="off"
          />
          <p className="text-muted-foreground text-xs">Google Форма або сторінка з відгуком — можна залишити порожнім.</p>
        </div>

        <div className="space-y-2 pt-2">
          <div className="flex items-center gap-2">
            <Checkbox
              checked={form.bprEnabled}
              onCheckedChange={(checked) => setForm((s) => ({ ...s, bprEnabled: Boolean(checked) }))}
              id={pid("bpr")}
            />
            <Label htmlFor={pid("bpr")} className="cursor-pointer">
              Бали БПР
            </Label>
          </div>
          <p className="text-muted-foreground text-xs">
            Якщо увімкнено — бот поставить додаткові кроки та запросить посилання на перевірку спеціальності й тест.
          </p>

          {form.bprEnabled ? (
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor={pid("bpr-specialty")}>Посилання для перевірки спеціальності</Label>
                <Input
                  id={pid("bpr-specialty")}
                  type="url"
                  value={form.bprSpecialtyCheckLink}
                  onChange={(e) => setForm((s) => ({ ...s, bprSpecialtyCheckLink: e.target.value }))}
                  placeholder="https://…"
                  autoComplete="off"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor={pid("bpr-test")}>Посилання для тесту</Label>
                <Input
                  id={pid("bpr-test")}
                  type="url"
                  value={form.bprTestLink}
                  onChange={(e) => setForm((s) => ({ ...s, bprTestLink: e.target.value }))}
                  placeholder="https://…"
                  autoComplete="off"
                />
              </div>
            </div>
          ) : null}
        </div>
      </div>

      <Separator />

      <div className="space-y-2">
        <Label htmlFor={pid("requirements")}>Вимоги та умови</Label>
        <Textarea
          id={pid("requirements")}
          className="min-h-28"
          value={form.requirementsText}
          onChange={(e) => setForm((s) => ({ ...s, requirementsText: e.target.value }))}
          placeholder="Опишіть, що потрібно студенту: завершені модулі, тест, присутність…"
        />
        <p className="text-muted-foreground text-xs">
          Обов&apos;язкове поле. Цей текст можна показувати в заявці або повідомленнях — формулюйте чітко для студента.
        </p>
      </div>
    </div>
  );
}

function CourseListSkeleton({ rows = 4 }: { rows?: number }) {
  return (
    <div className="space-y-3">
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="rounded-lg border border-border/80 p-4">
          <div className="flex items-center justify-between gap-2">
            <Skeleton className="h-4 w-48 max-w-[70%]" />
            <Skeleton className="h-8 w-20 shrink-0" />
          </div>
          <Skeleton className="mt-3 h-3 w-64 max-w-[85%]" />
        </div>
      ))}
    </div>
  );
}

export function CoursesSection({
  schools,
  selectedSchoolId,
  initialCourses,
  initialCoursesSchoolId,
  hideSchoolSelect = false,
  onSchoolChange,
}: {
  schools: SchoolOption[];
  selectedSchoolId: string;
  initialCourses: CourseRow[];
  initialCoursesSchoolId: string;
  hideSchoolSelect?: boolean;
  onSchoolChange?: (schoolId: string) => void | Promise<void>;
}) {
  const { data: courses = [], isFetching: listLoading } = useCoursesQuery(selectedSchoolId, {
    initialData: initialCourses,
    initialSchoolId: initialCoursesSchoolId,
  });
  const patchCourse = usePatchCourseMutation(selectedSchoolId);
  const deleteCourse = useDeleteCourseMutation(selectedSchoolId);

  const [createOpen, setCreateOpen] = useState(false);

  const [editingCourse, setEditingCourse] = useState<CourseRow | null>(null);
  const [editForm, setEditForm] = useState<CourseEditFormState>(initialEditForm);
  const [editError, setEditError] = useState<string | null>(null);

  const hasSchool = useMemo(() => selectedSchoolId.length > 0, [selectedSchoolId]);

  async function handleSaveEdit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!editingCourse || !selectedSchoolId) return;
    setEditError(null);
    const parsed = courseUpdateSchema.safeParse({
      title: editForm.title,
      certificateType: editForm.certificateType,
      daysToSend: Number(editForm.daysToSend),
      reviewLink: editForm.reviewLink,
      requirementsText: editForm.requirementsText,
      bprEnabled: editForm.bprEnabled,
      bprSpecialtyCheckLink: editForm.bprSpecialtyCheckLink,
      bprTestLink: editForm.bprTestLink,
    });
    if (!parsed.success) {
      const message = parsed.error.issues[0]?.message ?? "Некоректні дані";
      setEditError(message);
      toast.error(message);
      return;
    }
    try {
      await patchCourse.mutateAsync({ courseId: editingCourse.id, body: parsed.data });
      setEditingCourse(null);
      toast.success("Курс оновлено");
    } catch (e) {
      const message =
        e instanceof ApiError ? e.message : e instanceof Error ? e.message : "Не вдалося зберегти курс";
      setEditError(message);
      toast.error(message);
    }
  }

  async function handleSchoolChange(nextSchoolId: string) {
    setEditingCourse(null);
    setCreateOpen(false);
    await onSchoolChange?.(nextSchoolId);
  }

  async function handleDelete(id: string) {
    if (!selectedSchoolId) return;
    try {
      await deleteCourse.mutateAsync(id);
      toast.success("Курс видалено");
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "Не вдалося видалити курс");
    }
  }

  function openEdit(course: CourseRow) {
    setEditForm(courseRowToForm(course));
    setEditError(null);
    setEditingCourse(course);
  }

  const schoolSelectValue = selectedSchoolId || SCHOOL_PLACEHOLDER_VALUE;
  const schoolTriggerLabel = selectedSchoolId
    ? (schools.find((s) => s.id === selectedSchoolId)?.name ?? "Школа")
    : "— Оберіть школу —";

  return (
    <div className="space-y-6">
      <CourseCreateDialog open={createOpen} onOpenChange={setCreateOpen} schoolId={selectedSchoolId} onCreated={() => {}} />

      <Dialog
        open={editingCourse !== null}
        onOpenChange={(open) => {
          if (!open) {
            setEditingCourse(null);
            setEditError(null);
          }
        }}
      >
        <DialogContent
          showCloseButton
          className="flex max-h-[min(90vh,720px)] max-w-[calc(100%-2rem)] flex-col gap-0 overflow-hidden p-0 sm:max-w-lg"
        >
          <DialogHeader className="shrink-0 space-y-1 border-b px-4 py-4">
            <DialogTitle>Редагувати курс</DialogTitle>
            <DialogDescription className="line-clamp-2">{editingCourse?.title ?? ""}</DialogDescription>
          </DialogHeader>
          <form className="flex min-h-0 flex-1 flex-col" onSubmit={(e) => void handleSaveEdit(e)}>
            <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
              <CourseEditFormFields form={editForm} setForm={setEditForm} idPrefix="edit-course" />
              {editError ? <p className="text-destructive mt-4 text-sm">{editError}</p> : null}
            </div>
            <div className="flex shrink-0 flex-col-reverse gap-2 border-t bg-muted/40 px-4 py-3 sm:flex-row sm:justify-end">
              <Button type="button" variant="outline" onClick={() => setEditingCourse(null)}>
                Скасувати
              </Button>
              <Button type="submit" disabled={patchCourse.isPending}>
                {patchCourse.isPending ? "Збереження…" : "Зберегти"}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      <Card>
        <CardHeader className="border-b border-border/60 pb-4">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div className="min-w-0 space-y-1">
              <CardTitle>Курси</CardTitle>
              <CardDescription>
                Курси школи для бота та заявок. Створення — покроковий майстер; редагування — у діалозі з усіма полями.
              </CardDescription>
            </div>
            <Button
              type="button"
              className="shrink-0 self-start sm:self-auto"
              disabled={!hasSchool}
              onClick={() => setCreateOpen(true)}
            >
              Створити курс
            </Button>
          </div>
          {hideSchoolSelect ? null : (
            <div className={cn("mt-4 space-y-2", !hasSchool && "opacity-90")}>
              <Label htmlFor="course-school">Школа</Label>
              <Select
                value={schoolSelectValue}
                onValueChange={(v) => {
                  if (v == null) return;
                  void handleSchoolChange(v === SCHOOL_PLACEHOLDER_VALUE ? "" : v);
                }}
                disabled={schools.length === 0}
              >
                <SelectTrigger id="course-school" className="h-9 w-full max-w-xl">
                  <SelectValue placeholder="Оберіть школу">{schoolTriggerLabel}</SelectValue>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={SCHOOL_PLACEHOLDER_VALUE}>— Оберіть школу —</SelectItem>
                  {schools.map((school) => (
                    <SelectItem key={school.id} value={school.id}>
                      {school.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {schools.length === 0 ? (
                <p className="text-muted-foreground text-xs">Спочатку створіть школу в розділі «Школи».</p>
              ) : !hasSchool ? (
                <p className="text-amber-700 text-xs dark:text-amber-400">Оберіть школу, щоб бачити курси та створювати нові.</p>
              ) : null}
            </div>
          )}
        </CardHeader>
        <CardContent className="space-y-3 pt-6">
          {!hideSchoolSelect && !hasSchool ? (
            <p className="text-muted-foreground text-sm">Оберіть школу вище, щоб побачити список курсів.</p>
          ) : listLoading ? (
            <CourseListSkeleton />
          ) : (
            <>
              {courses.map((course) => (
                <div
                  key={course.id}
                  className="rounded-lg border border-border/80 p-4 transition-colors hover:bg-muted/30"
                >
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div className="min-w-0 flex-1 space-y-2">
                      <div className="font-medium">{course.title}</div>
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge variant="secondary">{certTypeLabel(course.certificateType)}</Badge>
                        <span className="text-muted-foreground text-xs">
                          Термін у повідомленні після схвалення:{" "}
                          <span className="font-medium text-foreground">протягом {daysWordUa(course.daysToSend)}</span>
                        </span>
                      </div>
                      {course.reviewLink ? (
                        <p className="truncate text-xs">
                          <span className="text-muted-foreground">Відгук: </span>
                          <a
                            href={course.reviewLink}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-primary underline-offset-4 hover:underline"
                          >
                            {course.reviewLink}
                          </a>
                        </p>
                      ) : null}
                      {course.requirementsText ? (
                        <p className="text-muted-foreground line-clamp-2 text-xs">{course.requirementsText}</p>
                      ) : null}
                    </div>
                    <div className="flex shrink-0 flex-wrap gap-2 self-start">
                      <Button type="button" variant="outline" size="sm" onClick={() => openEdit(course)}>
                        Редагувати
                      </Button>
                      <Button type="button" variant="outline" size="sm" onClick={() => void handleDelete(course.id)}>
                        Видалити
                      </Button>
                    </div>
                  </div>
                </div>
              ))}
              {courses.length === 0 && hasSchool ? (
                <div className="rounded-lg border border-dashed p-8 text-center">
                  <p className="text-muted-foreground text-sm">Поки немає курсів.</p>
                  <p className="text-muted-foreground mt-1 text-xs">
                    Натисніть «Створити курс» — відкриється майстер з кроками.
                  </p>
                </div>
              ) : null}
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
