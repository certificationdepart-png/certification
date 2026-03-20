"use client";

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";

import type { SchoolListRow } from "@/components/schools/school-admin-types";
import { TelegramBotTokenField } from "@/components/schools/telegram-bot-verify";
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
import { useCreateSchoolMutation } from "@/hooks/api";
import { ApiError } from "@/lib/api-http";
import { schoolCreateSchema } from "@/services/validation";

const STEPS = [
  { title: "Школа", description: "Назва" },
  { title: "Telegram", description: "Чат і бот" },
  { title: "Інтеграції", description: "НП і таблиця" },
] as const;

const stepSchemas = [
  schoolCreateSchema.pick({ name: true }),
  schoolCreateSchema.pick({ telegramChatId: true, telegramBotToken: true }),
  schoolCreateSchema.pick({ novaPoshtaApiKey: true, googleSheetUrl: true }),
] as const;

type FormState = {
  name: string;
  telegramChatId: string;
  telegramBotToken: string;
  novaPoshtaApiKey: string;
  googleSheetUrl: string;
};

const emptyForm: FormState = {
  name: "",
  telegramChatId: "",
  telegramBotToken: "",
  novaPoshtaApiKey: "",
  googleSheetUrl: "",
};

function WizardSecretField({
  id,
  label,
  value,
  onChange,
  placeholder,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  const [show, setShow] = useState(false);
  return (
    <div className="grid gap-2">
      <div className="flex items-center justify-between gap-2">
        <Label htmlFor={id}>{label}</Label>
        <Button type="button" variant="ghost" size="sm" className="h-7 text-xs" onClick={() => setShow((s) => !s)}>
          {show ? "Приховати" : "Показати"}
        </Button>
      </div>
      <Input
        id={id}
        type={show ? "text" : "password"}
        autoComplete="off"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
      />
    </div>
  );
}

const stepHints = [
  "Як школа відображатиметься в адмін-панелі.",
  "Куди надсилати заявки та токен бота для webhook.",
  "Ключ Нової пошти та посилання на таблицю «Заявки».",
];

export function SchoolCreateDialog({
  open,
  onOpenChange,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: (school: SchoolListRow) => void;
}) {
  const [step, setStep] = useState(0);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [error, setError] = useState<string | null>(null);
  const createSchool = useCreateSchoolMutation();

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
          ? { name: form.name }
          : index === 1
            ? { telegramChatId: form.telegramChatId, telegramBotToken: form.telegramBotToken }
            : { novaPoshtaApiKey: form.novaPoshtaApiKey, googleSheetUrl: form.googleSheetUrl };
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
    setError(null);
    try {
      const parsed = schoolCreateSchema.safeParse(form);
      if (!parsed.success) {
        const message = parsed.error.issues[0]?.message ?? "Некоректні дані";
        setError(message);
        toast.error(message);
        return;
      }
      const data = await createSchool.mutateAsync(parsed.data);
      toast.success("Школу створено");
      const row = {
        ...(data as unknown as SchoolListRow),
        syncStats: { pending: 0, processing: 0, completed: 0, failed: 0 },
      };
      onCreated(row);
      onOpenChange(false);
    } catch (e) {
      const message =
        e instanceof ApiError ? e.message : e instanceof Error ? e.message : "Помилка";
      setError(message);
      toast.error(message);
    }
  }, [createSchool, form, onCreated, onOpenChange, validateStep]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        showCloseButton
        className="flex max-h-[min(90vh,640px)] max-w-[calc(100%-2rem)] flex-col gap-0 overflow-hidden p-0 sm:max-w-lg"
      >
        <DialogHeader className="space-y-1 px-6 pt-6 pb-4">
          <DialogTitle>Нова школа</DialogTitle>
          <DialogDescription>{stepHints[step]}</DialogDescription>
        </DialogHeader>

        <div className="border-y bg-muted/40 px-6 py-5">
          <StepperIndicator steps={STEPS} currentIndex={step} />
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-6 py-5">
          {step === 0 ? (
            <div className="grid gap-2">
              <Label htmlFor="wizard-name">Назва школи</Label>
              <Input
                id="wizard-name"
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                placeholder="Наприклад, Main School"
                autoFocus
              />
            </div>
          ) : null}

          {step === 1 ? (
            <div className="space-y-4">
              <div className="grid gap-2">
                <Label htmlFor="wizard-chat">ID чату Telegram</Label>
                <Input
                  id="wizard-chat"
                  value={form.telegramChatId}
                  onChange={(e) => setForm((f) => ({ ...f, telegramChatId: e.target.value }))}
                  placeholder="-100…"
                  autoFocus
                />
              </div>
              <TelegramBotTokenField
                id="wizard-bot-token"
                label="Токен бота"
                value={form.telegramBotToken}
                onChange={(v) => setForm((f) => ({ ...f, telegramBotToken: v }))}
              />
            </div>
          ) : null}

          {step === 2 ? (
            <div className="space-y-4">
              <WizardSecretField
                id="wizard-np"
                label="API ключ Нової пошти"
                value={form.novaPoshtaApiKey}
                onChange={(v) => setForm((f) => ({ ...f, novaPoshtaApiKey: v }))}
              />
              <div className="grid gap-2">
                <Label htmlFor="wizard-sheet">Посилання на Google Таблицю</Label>
                <Input
                  id="wizard-sheet"
                  type="url"
                  value={form.googleSheetUrl}
                  onChange={(e) => setForm((f) => ({ ...f, googleSheetUrl: e.target.value }))}
                  placeholder="https://docs.google.com/spreadsheets/d/..."
                  autoFocus
                />
                <p className="text-muted-foreground text-xs">
                  ID таблиці визначається автоматично з посилання.
                </p>
              </div>
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
              <Button type="button" disabled={createSchool.isPending} onClick={() => void submit()}>
                {createSchool.isPending ? "Створення…" : "Створити школу"}
              </Button>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
