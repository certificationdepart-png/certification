"use client";

import { useState } from "react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { TelegramBotTokenField } from "@/components/schools/telegram-bot-verify";
import { TelegramWebhookSetupHint } from "@/components/schools/telegram-webhook-setup-hint";
import { useUpdateSchoolMutation } from "@/hooks/api";
import { ApiError } from "@/lib/api-http";
import { schoolUpdateSchema } from "@/services/validation";

export type SchoolOverviewValues = {
  id?: string;
  schoolKey?: string;
  name: string;
  telegramChatId: string;
  googleSheetUrl: string;
  telegramBotToken: string;
  novaPoshtaApiKey: string;
  hasTelegramBotToken?: boolean;
  hasNovaPoshtaApiKey?: boolean;
};

const emptyForm: SchoolOverviewValues = {
  name: "",
  telegramChatId: "",
  googleSheetUrl: "",
  telegramBotToken: "",
  novaPoshtaApiKey: "",
};

function SecretField({
  id,
  label,
  value,
  onChange,
  placeholder,
  disabled,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
  disabled?: boolean;
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
        disabled={disabled}
      />
    </div>
  );
}

export function SchoolOverviewForm({
  initial,
  onSaved,
  submitLabel = "Зберегти зміни",
}: {
  initial?: Partial<SchoolOverviewValues>;
  onSaved?: () => void;
  submitLabel?: string;
}) {
  const [form, setForm] = useState<SchoolOverviewValues>(() => ({
    ...emptyForm,
    ...initial,
    googleSheetUrl: initial?.googleSheetUrl ?? "",
  }));
  const [error, setError] = useState<string | null>(null);
  const updateSchool = useUpdateSchoolMutation();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!initial?.id) return;
    setError(null);
    try {
      const patch: Record<string, string> = {
        name: form.name,
        telegramChatId: form.telegramChatId,
        googleSheetUrl: form.googleSheetUrl,
      };
      if (form.telegramBotToken.trim()) {
        patch.telegramBotToken = form.telegramBotToken.trim();
      }
      if (form.novaPoshtaApiKey.trim()) {
        patch.novaPoshtaApiKey = form.novaPoshtaApiKey.trim();
      }
      const parsed = schoolUpdateSchema.safeParse(patch);
      if (!parsed.success) {
        const message = parsed.error.issues[0]?.message ?? "Некоректні дані";
        setError(message);
        toast.error(message);
        return;
      }
      const payload = await updateSchool.mutateAsync({ schoolId: initial.id, body: parsed.data });
      toast.success("Збережено");
      const next = payload.data as {
        name?: string;
        telegramChatId?: string;
        googleSheetUrl?: string | null;
        hasTelegramBotToken?: boolean;
        hasNovaPoshtaApiKey?: boolean;
      };
      setForm((s) => ({
        ...s,
        name: next.name ?? s.name,
        telegramChatId: next.telegramChatId ?? s.telegramChatId,
        googleSheetUrl: next.googleSheetUrl ?? s.googleSheetUrl ?? "",
        telegramBotToken: "",
        novaPoshtaApiKey: "",
        hasTelegramBotToken: next.hasTelegramBotToken ?? s.hasTelegramBotToken,
        hasNovaPoshtaApiKey: next.hasNovaPoshtaApiKey ?? s.hasNovaPoshtaApiKey,
      }));
      onSaved?.();
    } catch (err) {
      const message =
        err instanceof ApiError ? err.message : err instanceof Error ? err.message : "Помилка";
      setError(message);
      toast.error(message);
    }
  }

  return (
    <form className="space-y-8" onSubmit={(e) => void handleSubmit(e)}>
      <div className="space-y-4">
        <div>
          <h3 className="text-sm font-medium">Профіль</h3>
          <p className="text-muted-foreground text-xs">Назва школи в системі та для менеджерів.</p>
        </div>
        <div className="grid gap-2">
          <Label htmlFor="school-name">Назва</Label>
          <Input
            id="school-name"
            value={form.name}
            onChange={(e) => setForm((s) => ({ ...s, name: e.target.value }))}
            required
          />
        </div>
      </div>

      <Separator />

      <div className="space-y-4">
        <div>
          <h3 className="text-sm font-medium">Telegram</h3>
          <p className="text-muted-foreground text-xs">Чат для заявок і токен бота (webhook).</p>
        </div>
        <div className="grid gap-4 md:grid-cols-2">
          <div className="grid gap-2">
            <Label htmlFor="telegram-chat">ID чату</Label>
            <Input
              id="telegram-chat"
              value={form.telegramChatId}
              onChange={(e) => setForm((s) => ({ ...s, telegramChatId: e.target.value }))}
              required
            />
          </div>
          <div className="md:col-span-2">
            <TelegramBotTokenField
              id="telegram-token"
              label="Токен бота"
              value={form.telegramBotToken}
              onChange={(v) => setForm((s) => ({ ...s, telegramBotToken: v }))}
              placeholder="Залиште порожнім, щоб не змінювати"
            />
            <p className="text-muted-foreground mt-1 text-xs">
              Збережено:{" "}
              {form.hasTelegramBotToken ? (
                <Badge variant="secondary">так</Badge>
              ) : (
                <Badge variant="outline">ні</Badge>
              )}
            </p>
            {initial?.schoolKey ? <TelegramWebhookSetupHint schoolKey={initial.schoolKey} /> : null}
          </div>
        </div>
      </div>

      <Separator />

      <div className="space-y-4">
        <div>
          <h3 className="text-sm font-medium">Інтеграції</h3>
          <p className="text-muted-foreground text-xs">Нова Пошта та посилання на Google Таблицю заявок.</p>
        </div>
        <div className="grid gap-4">
          <SecretField
            id="np-key"
            label="API ключ Нової пошти"
            value={form.novaPoshtaApiKey}
            onChange={(v) => setForm((s) => ({ ...s, novaPoshtaApiKey: v }))}
            placeholder="Залиште порожнім, щоб не змінювати"
          />
          <p className="text-muted-foreground text-xs">
            Збережено:{" "}
            {form.hasNovaPoshtaApiKey ? (
              <Badge variant="secondary">так</Badge>
            ) : (
              <Badge variant="outline">ні</Badge>
            )}
          </p>
          <div className="grid gap-2">
            <Label htmlFor="sheet-url">Посилання на Google Таблицю</Label>
            <Input
              id="sheet-url"
              type="url"
              placeholder="https://docs.google.com/spreadsheets/d/..."
              value={form.googleSheetUrl}
              onChange={(e) => setForm((s) => ({ ...s, googleSheetUrl: e.target.value }))}
              required
            />
            <p className="text-muted-foreground text-xs">
              Внутрішній ідентифікатор таблиці визначається автоматично з посилання.
            </p>
          </div>
        </div>
      </div>

      {error ? <p className="text-destructive text-sm">{error}</p> : null}
      <Button type="submit" disabled={updateSchool.isPending}>
        {updateSchool.isPending ? "Збереження…" : submitLabel}
      </Button>
    </form>
  );
}
