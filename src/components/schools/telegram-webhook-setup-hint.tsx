"use client";

import { toast } from "sonner";

import { Button } from "@/components/ui/button";

/** Default ngrok host for local testing — must match ngrok’s printed URL (free tier uses `.ngrok-free.app`, not `.de`). */
const DEFAULT_NGROK_TUNNEL_URL = "https://emily-rhinologic-streakedly.ngrok-free.dev";

function normalizeBase(url: string): string {
  return url.replace(/\/$/, "");
}

function webhookPublicBase(): {
  base: string;
  source: "env_webhook" | "env_app" | "window_url" | "default_ngrok";
} {
  const tunnel = process.env.NEXT_PUBLIC_TELEGRAM_WEBHOOK_BASE_URL?.trim();
  if (tunnel) {
    return { base: normalizeBase(tunnel), source: "env_webhook" };
  }

  // In production, prefer the actual browser origin. This avoids cases where
  // NEXT_PUBLIC_* values on Vercel are missing/left over from another env.
  if (typeof window !== "undefined") {
    const origin = window.location.origin;
    if (origin && !/^https?:\/\/(localhost|127\.0\.0\.1)(?::\d+)?\/?$/i.test(origin)) {
      return { base: normalizeBase(origin), source: "window_url" };
    }
  }

  const app = process.env.NEXT_PUBLIC_APP_URL?.trim();
  if (app && !/^https?:\/\/(localhost|127\.0\.0\.1)(?::\d+)?\/?$/i.test(app)) {
    return { base: normalizeBase(app), source: "env_app" };
  }
  return { base: normalizeBase(DEFAULT_NGROK_TUNNEL_URL), source: "default_ngrok" };
}

async function copyText(label: string, text: string) {
  try {
    await navigator.clipboard.writeText(text);
    toast.success(`Скопійовано: ${label}`);
  } catch {
    toast.error("Не вдалося скопіювати");
  }
}

export function TelegramWebhookSetupHint({ schoolKey }: { schoolKey: string }) {
  const { base, source } = webhookPublicBase();
  const webhookUrl = `${base}/api/telegram/webhook`;
  const setWebhookExample = `# Замість 123456789:AA... вставте СПРАВЖНІЙ токен з BotFather (не літерали <BOT_TOKEN> — інакше Telegram відповість 404).
curl -sS -X POST "https://api.telegram.org/bot123456789:AA_heCCoQxxxxxxxxxxxxxxxxxxxxxxxxxxx/setWebhook" \\
  -d "url=${webhookUrl}" \\
  -d "secret_token=${schoolKey}"

# Перевірка токена (має бути "ok":true):
# curl -sS "https://api.telegram.org/bot123456789:AA_heCCoQxxxxxxxxxxxxxxxxxxxxxxxxxxx/getMe"`;

  return (
    <div className="rounded-md border border-dashed border-muted-foreground/25 bg-muted/30 px-3 py-3 text-sm">
      <p className="font-medium text-foreground">Webhook для Telegram (тест через ngrok)</p>
      <p className="text-muted-foreground mt-1 text-xs">
        Після збереження токена бота сервер викликає <span className="font-mono">setWebhook</span> автоматично (якщо
        задана публічна HTTPS-база вище). Нижче — для ручної перевірки або curl.
      </p>
      <p className="text-muted-foreground mt-1 text-xs">
        Telegram не досягає <span className="font-mono">localhost</span>. Скопіюйте HTTPS з рядка{" "}
        <span className="font-mono">Forwarding</span> у терміналі ngrok (зазвичай{" "}
        <span className="font-mono">*.ngrok-free.app</span>) — домен <span className="font-mono">.ngrok-free.de</span>{" "}
        не існує, через це <span className="font-mono">setWebhook</span> дає «Failed to resolve host». У{" "}
        <span className="font-mono">.env</span>:{" "}
        <span className="font-mono break-all">
          NEXT_PUBLIC_TELEGRAM_WEBHOOK_BASE_URL={DEFAULT_NGROK_TUNNEL_URL}
        </span>
        {source === "default_ngrok" ? (
          <>
            {" "}
            (зараз у підказці використано цю адресу; змініть змінну, якщо у вас інший ngrok).
          </>
        ) : null}
      </p>
      <div className="mt-3 space-y-2">
        <div>
          <div className="text-muted-foreground text-xs">URL webhook</div>
          <div className="mt-1 flex flex-wrap items-center gap-2">
            <code className="bg-background max-w-full flex-1 overflow-x-auto rounded border px-2 py-1 font-mono text-xs break-all">
              {webhookUrl}
            </code>
            <Button type="button" variant="outline" size="sm" className="shrink-0" onClick={() => void copyText("URL", webhookUrl)}>
              Копіювати
            </Button>
          </div>
        </div>
        <div>
          <div className="text-muted-foreground text-xs">
            <span className="font-mono">secret_token</span> (те саме, що <span className="font-mono">schoolKey</span> цієї школи)
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-2">
            <code className="bg-background max-w-full flex-1 overflow-x-auto rounded border px-2 py-1 font-mono text-xs break-all">
              {schoolKey}
            </code>
            <Button type="button" variant="outline" size="sm" className="shrink-0" onClick={() => void copyText("secret_token", schoolKey)}>
              Копіювати
            </Button>
          </div>
        </div>
        <div>
          <div className="text-muted-foreground text-xs">
            Приклад <span className="font-mono">setWebhook</span>. Якщо відповідь{" "}
            <span className="font-mono">404 Not Found</span> — у URL досі плейсхолдер або недійсний токен; спочатку
            перевірте <span className="font-mono">getMe</span>.
          </div>
          <pre className="bg-background mt-1 max-h-40 overflow-auto rounded border p-2 font-mono text-[11px] leading-relaxed whitespace-pre-wrap break-all">
            {setWebhookExample}
          </pre>
          <Button
            type="button"
            variant="secondary"
            size="sm"
            className="mt-2"
            onClick={() => void copyText("curl", setWebhookExample)}
          >
            Копіювати curl
          </Button>
        </div>
      </div>
    </div>
  );
}
