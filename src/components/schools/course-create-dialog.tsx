"use client";

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";

import { StepperIndicator } from "@/components/ui/stepper";
import { Button } from "@/components/ui/button";
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
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { useCreateCourseMutation } from "@/hooks/api";
import { ApiError } from "@/lib/api-http";
import { courseCreateSchema, courseCreateSchemaBase } from "@/services/validation";

const STEPS = [
  { title: "Курс", description: "Назва і тип сертифіката" },
  { title: "Термін і відгук", description: "Дні та посилання" },
  { title: "Вимоги", description: "Текст для студента" },
] as const;

const stepSchemas = [
  courseCreateSchemaBase.pick({ title: true, certificateType: true }),
  courseCreateSchemaBase.pick({
    daysToSend: true,
    reviewLink: true,
    bprEnabled: true,
    bprSpecialtyCheckLink: true,
    bprTestLink: true,
  }),
  courseCreateSchemaBase.pick({ requirementsText: true }),
] as const;

type CertType = "electronic" | "physical" | "both";

type FormState = {
  title: string;
  certificateType: CertType;
  daysToSend: number;
  reviewLink: string;
  requirementsText: string;
  bprEnabled: boolean;
  bprSpecialtyCheckLink: string;
  bprTestLink: string;
};

const emptyForm: FormState = {
  title: "",
  certificateType: "electronic",
  daysToSend: 1,
  reviewLink: "",
  requirementsText: "",
  bprEnabled: false,
  bprSpecialtyCheckLink: "",
  bprTestLink: "",
};

const certificateSelectLabels: Record<CertType, string> = {
  electronic: "Електронний",
  physical: "Фізичний (друкований)",
  both: "Електронний і фізичний",
};

const certificateHints: Record<CertType, string> = {
  electronic: "Студент отримує сертифікат електронно (файл, посилання тощо).",
  physical: "Сертифікат друкується та відправляється фізично (наприклад, поштою).",
  both: "Передбачено обидва варіанти — електронний і друкований.",
};

const stepHints = [
  "Як курс називається в системі та який формат сертифіката показувати в боті.",
  "Термін у днях для повідомлення після схвалення (стовпець E) і посилання на відгук (F).",
  "Обов’язковий текст вимог — скріни, умови тощо.",
];

export function CourseCreateDialog({
  open,
  onOpenChange,
  schoolId,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  schoolId: string;
  onCreated: () => void;
}) {
  const [step, setStep] = useState(0);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [error, setError] = useState<string | null>(null);
  const createCourse = useCreateCourseMutation();

  useEffect(() => {
    if (!open) return;
    /* eslint-disable react-hooks/set-state-in-effect -- reset wizard when dialog opens */
    setStep(0);
    setForm(emptyForm);
    setError(null);
    /* eslint-enable react-hooks/set-state-in-effect */
  }, [open]);

  const validateStep = useCallback(
    (index: number): boolean => {
      const data =
        index === 0
          ? { title: form.title, certificateType: form.certificateType }
          : index === 1
            ? {
                daysToSend: Number(form.daysToSend),
                reviewLink: form.reviewLink,
                bprEnabled: form.bprEnabled,
                bprSpecialtyCheckLink: form.bprSpecialtyCheckLink,
                bprTestLink: form.bprTestLink,
              }
            : { requirementsText: form.requirementsText };
      const parsed = stepSchemas[index].safeParse(data);
      if (!parsed.success) {
        const message = parsed.error.issues[0]?.message ?? "Перевірте поля";
        setError(message);
        toast.error(message);
        return false;
      }
      setError(null);
      return true;
    },
    [form],
  );

  const goNext = useCallback(() => {
    if (!validateStep(step)) return;
    setStep((s) => Math.min(s + 1, STEPS.length - 1));
  }, [step, validateStep]);

  const goBack = useCallback(() => {
    setError(null);
    setStep((s) => Math.max(s - 1, 0));
  }, []);

  const submit = useCallback(async () => {
    if (!validateStep(2)) return;
    if (!schoolId.trim()) {
      toast.error("Оберіть школу");
      return;
    }
    setError(null);
    try {
      const parsed = courseCreateSchema.safeParse({
        schoolId,
        title: form.title,
        certificateType: form.certificateType,
        daysToSend: Number(form.daysToSend),
        reviewLink: form.reviewLink,
        requirementsText: form.requirementsText,
        bprEnabled: form.bprEnabled,
        bprSpecialtyCheckLink: form.bprSpecialtyCheckLink,
        bprTestLink: form.bprTestLink,
      });
      if (!parsed.success) {
        const message = parsed.error.issues[0]?.message ?? "Некоректні дані";
        setError(message);
        toast.error(message);
        return;
      }
      await createCourse.mutateAsync(parsed.data);
      toast.success("Курс створено");
      onCreated();
      onOpenChange(false);
    } catch (e) {
      const message =
        e instanceof ApiError ? e.message : e instanceof Error ? e.message : "Помилка";
      setError(message);
      toast.error(message);
    }
  }, [createCourse, form, onCreated, onOpenChange, schoolId, validateStep]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        showCloseButton
        className="flex max-h-[min(90vh,640px)] max-w-[calc(100%-2rem)] flex-col gap-0 overflow-hidden p-0 sm:max-w-lg"
      >
        <DialogHeader className="space-y-1 px-6 pt-6 pb-4">
          <DialogTitle>Новий курс</DialogTitle>
          <DialogDescription>{stepHints[step]}</DialogDescription>
        </DialogHeader>

        <div className="border-y bg-muted/40 px-6 py-5">
          <StepperIndicator steps={STEPS} currentIndex={step} />
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-6 py-5">
          {step === 0 ? (
            <div className="space-y-4">
              <div className="grid gap-2">
                <Label htmlFor="course-wizard-title">Назва курсу</Label>
                <Input
                  id="course-wizard-title"
                  value={form.title}
                  onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
                  placeholder="Наприклад, «Python для початківців»"
                  autoComplete="off"
                  autoFocus
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="course-wizard-cert">Тип сертифіката</Label>
                <Select
                  value={form.certificateType}
                  onValueChange={(v) => {
                    if (v == null) return;
                    if (v !== "electronic" && v !== "physical" && v !== "both") return;
                    setForm((f) => ({ ...f, certificateType: v }));
                  }}
                >
                  <SelectTrigger id="course-wizard-cert" className="h-9 w-full">
                    <SelectValue placeholder="Оберіть тип">
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
          ) : null}

          {step === 1 ? (
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="course-wizard-days">Термін, дні</Label>
                <Input
                  id="course-wizard-days"
                  type="number"
                  min={0}
                  max={365}
                  inputMode="numeric"
                  value={String(form.daysToSend)}
                  onChange={(e) => setForm((f) => ({ ...f, daysToSend: Number(e.target.value) }))}
                  className="max-w-[8rem]"
                  autoFocus
                />
                <p className="text-muted-foreground text-xs">
                  Підставляється в повідомлення після схвалення («протягом N днів»). Діапазон 0–365.
                </p>
              </div>
              <Separator />
              <div className="space-y-2">
                <Label htmlFor="course-wizard-review">Посилання на відгук</Label>
                <Input
                  id="course-wizard-review"
                  type="url"
                  value={form.reviewLink}
                  onChange={(e) => setForm((f) => ({ ...f, reviewLink: e.target.value }))}
                  placeholder="https://… (необов'язково)"
                  autoComplete="off"
                />
              </div>

              <Separator />

              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <Checkbox
                    checked={form.bprEnabled}
                    onCheckedChange={(checked) => setForm((f) => ({ ...f, bprEnabled: Boolean(checked) }))}
                    id="course-wizard-bpr"
                  />
                  <Label htmlFor="course-wizard-bpr" className="cursor-pointer">
                    Бали БПР
                  </Label>
                </div>
                <p className="text-muted-foreground text-xs">
                  Якщо увімкнено — бот додасть додаткові кроки та запросить посилання на перевірку спеціальності й тест.
                </p>
              </div>

              {form.bprEnabled ? (
                <div className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="course-wizard-bpr-specialty">Посилання для перевірки спеціальності</Label>
                    <Input
                      id="course-wizard-bpr-specialty"
                      type="url"
                      value={form.bprSpecialtyCheckLink}
                      onChange={(e) => setForm((f) => ({ ...f, bprSpecialtyCheckLink: e.target.value }))}
                      placeholder="https://…"
                      autoComplete="off"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="course-wizard-bpr-test">Посилання для тесту</Label>
                    <Input
                      id="course-wizard-bpr-test"
                      type="url"
                      value={form.bprTestLink}
                      onChange={(e) => setForm((f) => ({ ...f, bprTestLink: e.target.value }))}
                      placeholder="https://…"
                      autoComplete="off"
                    />
                  </div>
                </div>
              ) : null}
            </div>
          ) : null}

          {step === 2 ? (
            <div className="space-y-2">
              <Label htmlFor="course-wizard-req">Вимоги та умови</Label>
              <Textarea
                id="course-wizard-req"
                className="min-h-28"
                value={form.requirementsText}
                onChange={(e) => setForm((f) => ({ ...f, requirementsText: e.target.value }))}
                placeholder="Опишіть, що потрібно студенту…"
                autoFocus
              />
            </div>
          ) : null}

          {error ? <p className="text-destructive mt-4 text-sm">{error}</p> : null}
        </div>

        <div className="flex flex-col-reverse gap-2 border-t bg-muted/30 px-6 py-4 sm:flex-row sm:items-center sm:justify-between">
          <Button type="button" variant="ghost" className="sm:mr-auto" onClick={() => onOpenChange(false)}>
            Скасувати
          </Button>
          <div className="flex justify-end gap-2">
            {step > 0 ? (
              <Button type="button" variant="outline" onClick={goBack}>
                Назад
              </Button>
            ) : null}
            {step < STEPS.length - 1 ? (
              <Button type="button" onClick={goNext}>
                Далі
              </Button>
            ) : (
              <Button type="button" disabled={createCourse.isPending} onClick={() => void submit()}>
                {createCourse.isPending ? "Створення…" : "Створити курс"}
              </Button>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
