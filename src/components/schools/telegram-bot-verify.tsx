"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useVerifyTelegramBotMutation } from "@/hooks/api";
import { cn } from "@/lib/utils";

export function TelegramBotTokenField({
  id,
  label = "Токен бота",
  value,
  onChange,
  placeholder,
  disabled,
}: {
  id: string;
  label?: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  disabled?: boolean;
}) {
  const [show, setShow] = useState(false);
  const verifyBot = useVerifyTelegramBotMutation();
  const [result, setResult] = useState<
    | { status: "ok"; username: string | null; firstName: string }
    | { status: "error"; message: string }
    | null
  >(null);

  useEffect(() => {
    /* eslint-disable react-hooks/set-state-in-effect -- clear verification when token changes */
    setResult(null);
    /* eslint-enable react-hooks/set-state-in-effect */
  }, [value]);

  async function verify() {
    const trimmed = value.trim();
    if (trimmed.length < 5) {
      toast.error("Введіть токен бота (щонайменше 5 символів)");
      return;
    }
    setResult(null);
    try {
      const payload = await verifyBot.mutateAsync(trimmed);
      setResult({
        status: "ok",
        username: payload.username,
        firstName: payload.firstName,
      });
      toast.success("Токен дійсний");
    } catch (e) {
      const message =
        e instanceof Error ? e.message : "Помилка мережі або час очікування вичерпано.";
      setResult({ status: "error", message });
      toast.error(message);
    }
  }

  return (
    <div className="grid gap-2">
      <div className="flex items-center justify-between gap-2">
        <Label htmlFor={id}>{label}</Label>
        <Button type="button" variant="ghost" size="sm" className="h-7 text-xs" onClick={() => setShow((s) => !s)}>
          {show ? "Приховати" : "Показати"}
        </Button>
      </div>
      <div className="flex min-w-0 items-center gap-2">
        <Input
          id={id}
          className="min-w-0 flex-1"
          type={show ? "text" : "password"}
          autoComplete="off"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          disabled={disabled}
        />
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="shrink-0"
          disabled={verifyBot.isPending || disabled || value.trim().length < 5}
          onClick={() => void verify()}
        >
          {verifyBot.isPending ? "Перевірка…" : "Перевірити бота"}
        </Button>
      </div>
      {result?.status === "ok" ? (
        <p
          className={cn(
            "rounded-md border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-900 dark:text-emerald-100",
          )}
        >
          <span className="font-medium">Усе гаразд.</span>{" "}
          {result.username ? (
            <>
              Бот <span className="font-mono">@{result.username}</span>
              {result.firstName ? <> ({result.firstName})</> : null}. Токен працює.
            </>
          ) : (
            <>
              Бот «{result.firstName}». Токен працює (username не задано в BotFather).
            </>
          )}
        </p>
      ) : null}
      {result?.status === "error" ? (
        <p className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-destructive text-sm">
          <span className="font-medium">Помилка.</span> {result.message}
        </p>
      ) : null}
    </div>
  );
}
