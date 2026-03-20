"use client";

import { useQueryClient } from "@tanstack/react-query";
import { useCallback, useMemo, useState } from "react";
import { toast } from "sonner";

import {
  MESSAGE_TEMPLATE_FLOW,
  KNOWN_TEMPLATE_CODES,
  getSuggestedDefault,
  type MessageTemplateFlowItem,
  type TemplatePhase,
} from "@/config/message-template-flow";
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
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
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
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import {
  useCreateTemplateMutation,
  useDeleteTemplateMutation,
  usePatchTemplateMutation,
  useTemplatesQuery,
} from "@/hooks/api";
import { ApiError } from "@/lib/api-http";
import { apiRoutes } from "@/lib/api-routes";
import { queryKeys } from "@/lib/query-keys";
import { DEFAULT_MESSAGE_TEMPLATES } from "@/services/template-defaults";
import { templateCreateSchema, templateUpdateSchema } from "@/services/validation";
import { cn } from "@/lib/utils";

import type { SchoolOption, TemplateRow } from "./school-admin-types";

const SCHOOL_PLACEHOLDER_VALUE = "__no_school__";

const FLOW_DIALOG = MESSAGE_TEMPLATE_FLOW.filter((f) => f.phase === "dialog").sort((a, b) => a.step - b.step);
const FLOW_MANAGER = MESSAGE_TEMPLATE_FLOW.filter((f) => f.phase === "manager").sort((a, b) => a.step - b.step);

const phaseLabel: Record<TemplatePhase, string> = {
  dialog: "Діалог у боті",
  manager: "Після схвалення менеджером",
};

type EditTarget =
  | { kind: "flow"; flow: MessageTemplateFlowItem; row: TemplateRow | null }
  | { kind: "extra"; row: TemplateRow };

function TemplateListSkeleton({ rows = 5 }: { rows?: number }) {
  return (
    <div className="space-y-3">
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="rounded-lg border border-border/80 p-4">
          <div className="flex items-center justify-between gap-2">
            <Skeleton className="h-5 w-40 max-w-[60%]" />
            <Skeleton className="h-8 w-24 shrink-0" />
          </div>
          <Skeleton className="mt-3 h-12 w-full" />
        </div>
      ))}
    </div>
  );
}

export function TemplatesSection({
  schools,
  selectedSchoolId,
  initialTemplates,
  initialTemplatesSchoolId,
  hideSchoolSelect = false,
  onSchoolChange,
}: {
  schools: SchoolOption[];
  selectedSchoolId: string;
  initialTemplates: TemplateRow[];
  initialTemplatesSchoolId: string;
  hideSchoolSelect?: boolean;
  onSchoolChange?: (schoolId: string) => void | Promise<void>;
}) {
  const qc = useQueryClient();
  const { data: templates = [], isFetching: listLoading } = useTemplatesQuery(selectedSchoolId, {
    initialData: initialTemplates,
    initialSchoolId: initialTemplatesSchoolId,
  });
  const createTemplate = useCreateTemplateMutation();
  const patchTemplate = usePatchTemplateMutation(selectedSchoolId);
  const deleteTemplate = useDeleteTemplateMutation(selectedSchoolId);

  const [seeding, setSeeding] = useState(false);
  const [editTarget, setEditTarget] = useState<EditTarget | null>(null);
  const [editText, setEditText] = useState("");
  const [editDescription, setEditDescription] = useState("");
  const [editError, setEditError] = useState<string | null>(null);
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [customForm, setCustomForm] = useState({ code: "", text: "", description: "" });
  const [customError, setCustomError] = useState<string | null>(null);
  const [deleteExtra, setDeleteExtra] = useState<TemplateRow | null>(null);

  const templateMutating =
    createTemplate.isPending || patchTemplate.isPending || deleteTemplate.isPending;

  const hasSchool = useMemo(() => selectedSchoolId.length > 0, [selectedSchoolId]);

  const byCode = useMemo(() => {
    const m = new Map<string, TemplateRow>();
    for (const t of templates) {
      m.set(t.code, t);
    }
    return m;
  }, [templates]);

  const missingPresetCount = useMemo(
    () => DEFAULT_MESSAGE_TEMPLATES.filter((d) => !byCode.has(d.code)).length,
    [byCode],
  );

  const extraTemplates = useMemo(
    () => templates.filter((t) => !KNOWN_TEMPLATE_CODES.has(t.code)).sort((a, b) => a.code.localeCompare(b.code)),
    [templates],
  );

  async function handleSchoolChange(nextSchoolId: string) {
    setEditTarget(null);
    await onSchoolChange?.(nextSchoolId);
  }

  const openFlowEditor = useCallback((flow: MessageTemplateFlowItem) => {
    const row = byCode.get(flow.code) ?? null;
    const suggested = getSuggestedDefault(flow.code);
    setEditTarget({ kind: "flow", flow, row });
    setEditText(row?.text ?? suggested?.text ?? "");
    setEditDescription(row?.description ?? suggested?.description ?? "");
    setEditError(null);
  }, [byCode]);

  const openExtraEditor = useCallback((row: TemplateRow) => {
    setEditTarget({ kind: "extra", row });
    setEditText(row.text);
    setEditDescription(row.description ?? "");
    setEditError(null);
  }, []);

  function applySuggestedText() {
    const code =
      editTarget?.kind === "flow" ? editTarget.flow.code : editTarget?.kind === "extra" ? editTarget.row.code : null;
    if (!code) return;
    const suggested = getSuggestedDefault(code);
    if (!suggested) {
      toast.info("Для цього коду немає типового тексту в системі");
      return;
    }
    setEditText(suggested.text);
    setEditDescription(suggested.description);
    toast.success("Підставлено типовий текст");
  }

  async function saveEdit() {
    if (!editTarget || !selectedSchoolId) return;
    setEditError(null);
    try {
      if (editTarget.kind === "flow") {
        const parsedCreate = templateCreateSchema.safeParse({
          schoolId: selectedSchoolId,
          code: editTarget.flow.code,
          text: editText,
          description: editDescription,
        });
        if (!parsedCreate.success) {
          const message = parsedCreate.error.issues[0]?.message ?? "Некоректні дані";
          setEditError(message);
          toast.error(message);
          return;
        }
        if (editTarget.row) {
          const parsedPatch = templateUpdateSchema.safeParse({
            text: editText,
            description: editDescription,
          });
          if (!parsedPatch.success) {
            const message = parsedPatch.error.issues[0]?.message ?? "Некоректні дані";
            setEditError(message);
            toast.error(message);
            return;
          }
          await patchTemplate.mutateAsync({ templateId: editTarget.row.id, body: parsedPatch.data });
        } else {
          await createTemplate.mutateAsync(parsedCreate.data);
        }
      } else {
        const parsedPatch = templateUpdateSchema.safeParse({
          text: editText,
          description: editDescription,
        });
        if (!parsedPatch.success) {
          const message = parsedPatch.error.issues[0]?.message ?? "Некоректні дані";
          setEditError(message);
          toast.error(message);
          return;
        }
        await patchTemplate.mutateAsync({ templateId: editTarget.row.id, body: parsedPatch.data });
      }
      setEditTarget(null);
      toast.success("Збережено");
    } catch (e) {
      const message =
        e instanceof ApiError ? e.message : e instanceof Error ? e.message : "Не вдалося зберегти";
      setEditError(message);
      toast.error(message);
    }
  }

  async function seedMissing() {
    if (!selectedSchoolId || missingPresetCount === 0) return;
    setSeeding(true);
    let added = 0;
    try {
      for (const d of DEFAULT_MESSAGE_TEMPLATES) {
        if (byCode.has(d.code)) continue;
        const parsed = templateCreateSchema.safeParse({
          schoolId: selectedSchoolId,
          code: d.code,
          text: d.text,
          description: d.description,
        });
        if (!parsed.success) continue;
        const res = await fetch(apiRoutes.messageTemplates, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(parsed.data),
        });
        if (res.ok) added += 1;
      }
      await qc.invalidateQueries({ queryKey: queryKeys.templates.bySchool(selectedSchoolId) });
      if (added > 0) {
        toast.success(`Додано шаблонів у базу: ${added}`);
      } else {
        toast.info("Нічого не додано — перевірте помилки або наявність записів");
      }
    } finally {
      setSeeding(false);
    }
  }

  async function submitCustomTemplate(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedSchoolId) return;
    setCustomError(null);
    const parsed = templateCreateSchema.safeParse({
      schoolId: selectedSchoolId,
      code: customForm.code,
      text: customForm.text,
      description: customForm.description,
    });
    if (!parsed.success) {
      const message = parsed.error.issues[0]?.message ?? "Некоректні дані";
      setCustomError(message);
      toast.error(message);
      return;
    }
    try {
      await createTemplate.mutateAsync(parsed.data);
      setCustomForm({ code: "", text: "", description: "" });
      setAdvancedOpen(false);
      toast.success("Шаблон створено");
    } catch (e) {
      const message =
        e instanceof ApiError ? e.message : e instanceof Error ? e.message : "Не вдалося створити";
      setCustomError(message);
      toast.error(message);
    }
  }

  async function confirmDeleteExtra() {
    if (!deleteExtra || !selectedSchoolId) return;
    try {
      await deleteTemplate.mutateAsync(deleteExtra.id);
      toast.success("Видалено");
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "Не вдалося видалити");
    } finally {
      setDeleteExtra(null);
    }
  }

  const schoolSelectValue = selectedSchoolId || SCHOOL_PLACEHOLDER_VALUE;
  const schoolTriggerLabel = selectedSchoolId
    ? (schools.find((s) => s.id === selectedSchoolId)?.name ?? "Школа")
    : "— Оберіть школу —";

  const dialogFlow = editTarget?.kind === "flow" ? editTarget.flow : null;
  const dialogCode =
    editTarget?.kind === "flow" ? editTarget.flow.code : editTarget?.kind === "extra" ? editTarget.row.code : "";
  const canResetToDefault = Boolean(getSuggestedDefault(dialogCode));

  function renderFlowRow(flow: MessageTemplateFlowItem) {
    const row = byCode.get(flow.code) ?? null;
    const suggested = getSuggestedDefault(flow.code);
    const preview = row?.text ?? suggested?.text ?? "";
    return (
      <div
        key={flow.code}
        className="rounded-lg border border-border/80 p-4 transition-colors hover:bg-muted/25"
      >
        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div className="min-w-0 flex-1 space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="outline" className="font-mono text-xs">
                {flow.code}
              </Badge>
              <span className="text-muted-foreground text-xs">Крок {flow.step}</span>
              {row ? (
                <Badge className="bg-emerald-600/90 text-white hover:bg-emerald-600">У базі</Badge>
              ) : (
                <Badge variant="secondary">Лише резерв у коді</Badge>
              )}
            </div>
            <div className="font-medium">{flow.title}</div>
            <p className="text-muted-foreground text-xs leading-relaxed">{flow.summary}</p>
            {flow.variables.length > 0 ? (
              <div className="flex flex-wrap gap-1.5">
                {flow.variables.map((v) => (
                  <Badge key={v.key} variant="outline" className="font-normal">
                    <span className="font-mono text-[11px]">{`{{${v.key}}}`}</span>
                    <span className="text-muted-foreground"> — {v.label}</span>
                  </Badge>
                ))}
              </div>
            ) : null}
            <p className="text-muted-foreground line-clamp-2 border-l-2 border-muted pl-2 text-xs italic">
              {preview}
            </p>
          </div>
          <div className="flex shrink-0 gap-2 self-start">
            <Button type="button" size="sm" variant={row ? "outline" : "default"} onClick={() => openFlowEditor(flow)}>
              {row ? "Редагувати" : "Налаштувати"}
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <Dialog
        open={editTarget !== null}
        onOpenChange={(open) => {
          if (!open) {
            setEditTarget(null);
            setEditError(null);
          }
        }}
      >
        <DialogContent
          showCloseButton
          className="flex max-h-[min(92vh,800px)] max-w-[calc(100%-2rem)] flex-col gap-0 overflow-hidden p-0 sm:max-w-2xl"
        >
          <DialogHeader className="shrink-0 space-y-2 border-b px-5 py-4">
            <DialogTitle>
              {dialogFlow ? dialogFlow.title : editTarget?.kind === "extra" ? "Редагувати шаблон" : "Шаблон"}
            </DialogTitle>
            <DialogDescription className="space-y-2">
              <span className="font-mono text-foreground/90">{dialogCode}</span>
              {dialogFlow ? <span className="block text-pretty">{dialogFlow.summary}</span> : null}
            </DialogDescription>
            {dialogFlow && dialogFlow.variables.length > 0 ? (
              <div className="flex flex-wrap gap-2 pt-1">
                {dialogFlow.variables.map((v) => (
                  <Button
                    key={v.key}
                    type="button"
                    variant="secondary"
                    size="sm"
                    className="h-8 font-mono text-xs"
                    onClick={() => {
                      void navigator.clipboard.writeText(`{{${v.key}}}`);
                      toast.success(`Скопійовано {{${v.key}}}`);
                    }}
                  >
                    {`{{${v.key}}}`}
                  </Button>
                ))}
              </div>
            ) : null}
          </DialogHeader>
          <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-5 py-4">
            <div className="space-y-2">
              <Label htmlFor="tpl-internal-desc">Примітка для адмінів (не показується студенту)</Label>
              <Input
                id="tpl-internal-desc"
                value={editDescription}
                onChange={(e) => setEditDescription(e.target.value)}
                placeholder="Коротко навіщо цей меседж"
              />
            </div>
            <div className="space-y-2">
              <div className="flex items-center justify-between gap-2">
                <Label htmlFor="tpl-body">Текст повідомлення</Label>
                {canResetToDefault ? (
                  <Button type="button" variant="ghost" size="sm" className="h-8 text-xs" onClick={applySuggestedText}>
                    Повернути типовий текст
                  </Button>
                ) : null}
              </div>
              <Textarea
                id="tpl-body"
                className="min-h-48 font-sans text-sm leading-relaxed"
                value={editText}
                onChange={(e) => setEditText(e.target.value)}
                placeholder="Текст для Telegram…"
              />
              <p className="text-muted-foreground text-xs">
                Змінні вставляйте як <span className="font-mono">{"{{назва}}"}</span> — вони підставляються під час
                відправки.
              </p>
            </div>
            {editError ? <p className="text-destructive text-sm">{editError}</p> : null}
          </div>
          <div className="flex shrink-0 flex-col-reverse gap-2 border-t bg-muted/40 px-5 py-3 sm:flex-row sm:justify-end">
            <Button type="button" variant="outline" onClick={() => setEditTarget(null)}>
              Скасувати
            </Button>
            <Button type="button" disabled={templateMutating} onClick={() => void saveEdit()}>
              {templateMutating ? "Збереження…" : "Зберегти"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <AlertDialog open={deleteExtra !== null} onOpenChange={(o) => !o && setDeleteExtra(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Видалити шаблон?</AlertDialogTitle>
            <AlertDialogDescription>
              Код <span className="font-mono">{deleteExtra?.code}</span>. Для стандартних кроків бота краще
              редагувати текст, а не видаляти запис.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Скасувати</AlertDialogCancel>
            <AlertDialogAction onClick={() => void confirmDeleteExtra()}>Видалити</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Card>
        <CardHeader className="border-b border-border/60 pb-4">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div className="min-w-0 space-y-1">
              <CardTitle>Шаблони повідомлень</CardTitle>
              <CardDescription>
                Тексти кроків Telegram-бота та повідомлень після схвалення заявки — окремо для кожної школи. Якщо запису
                немає в базі, бот використовує вбудований резервний текст; збережіть шаблон тут, щоб керувати формулюваннями
                без оновлення коду.
              </CardDescription>
            </div>
            <div className="flex shrink-0 flex-col gap-2 sm:flex-row sm:items-center">
              <Button
                type="button"
                variant="secondary"
                disabled={!hasSchool || missingPresetCount === 0 || seeding}
                onClick={() => void seedMissing()}
              >
                {seeding ? "Додавання…" : `Додати типові (${missingPresetCount})`}
              </Button>
            </div>
          </div>
          {hideSchoolSelect ? null : (
            <div className={cn("mt-4 space-y-2", !hasSchool && "opacity-90")}>
              <Label htmlFor="tpl-school">Школа</Label>
              <Select
                value={schoolSelectValue}
                onValueChange={(v) => {
                  if (v == null) return;
                  void handleSchoolChange(v === SCHOOL_PLACEHOLDER_VALUE ? "" : v);
                }}
                disabled={schools.length === 0}
              >
                <SelectTrigger id="tpl-school" className="h-9 w-full max-w-xl">
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
                <p className="text-muted-foreground text-xs">Спочатку створіть школу.</p>
              ) : !hasSchool ? (
                <p className="text-amber-700 text-xs dark:text-amber-400">Оберіть школу, щоб редагувати шаблони.</p>
              ) : null}
            </div>
          )}
        </CardHeader>
        <CardContent className="space-y-8 pt-6">
          {!hideSchoolSelect && !hasSchool ? (
            <p className="text-muted-foreground text-sm">Оберіть школу, щоб побачити шаблони.</p>
          ) : listLoading ? (
            <TemplateListSkeleton />
          ) : (
            <>
              <section className="space-y-3">
                <div className="flex items-center gap-2">
                  <h3 className="text-sm font-semibold">{phaseLabel.dialog}</h3>
                  <Badge variant="outline">{FLOW_DIALOG.length} кроків</Badge>
                </div>
                <p className="text-muted-foreground text-xs">
                  Послідовність відповідає сценарію заявки на сертифікат у боті.
                </p>
                <div className="space-y-3">{FLOW_DIALOG.map(renderFlowRow)}</div>
              </section>

              <section className="space-y-3">
                <div className="flex items-center gap-2">
                  <h3 className="text-sm font-semibold">{phaseLabel.manager}</h3>
                  <Badge variant="outline">{FLOW_MANAGER.length} повідомлення</Badge>
                </div>
                <p className="text-muted-foreground text-xs">
                  Надсилаються автоматично після зміни статусу заявки (підтвердження менеджером).
                </p>
                <div className="space-y-3">{FLOW_MANAGER.map(renderFlowRow)}</div>
              </section>

              {extraTemplates.length > 0 ? (
                <section className="space-y-3">
                  <h3 className="text-sm font-semibold">Додаткові шаблони</h3>
                  <p className="text-muted-foreground text-xs">
                    Коди поза стандартним сценарієм (розширення або legacy). Можна змінювати чи видаляти.
                  </p>
                  <div className="space-y-3">
                    {extraTemplates.map((row) => (
                      <div
                        key={row.id}
                        className="rounded-lg border border-border/80 border-dashed p-4"
                      >
                        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                          <div className="min-w-0 flex-1 space-y-1">
                            <Badge variant="outline" className="font-mono">
                              {row.code}
                            </Badge>
                            {row.description ? (
                              <p className="text-muted-foreground text-xs">{row.description}</p>
                            ) : null}
                            <p className="text-muted-foreground line-clamp-2 text-xs">{row.text}</p>
                          </div>
                          <div className="flex shrink-0 gap-2">
                            <Button type="button" size="sm" variant="outline" onClick={() => openExtraEditor(row)}>
                              Редагувати
                            </Button>
                            <Button type="button" size="sm" variant="outline" onClick={() => setDeleteExtra(row)}>
                              Видалити
                            </Button>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </section>
              ) : null}

              <Collapsible open={advancedOpen} onOpenChange={setAdvancedOpen}>
                <CollapsibleTrigger render={<Button variant="ghost" size="sm" className="text-muted-foreground" />}>
                  Розширено: шаблон з власним кодом
                </CollapsibleTrigger>
                <CollapsibleContent className="mt-3 rounded-lg border bg-muted/20 p-4">
                  <form className="space-y-3" onSubmit={(e) => void submitCustomTemplate(e)}>
                    <p className="text-muted-foreground text-xs">
                      Латиниця, цифри, <span className="font-mono">_</span> та <span className="font-mono">:</span>. Код має
                      збігатися з тим, що читає бот, інакше шаблон не використається.
                    </p>
                    <Input
                      placeholder="my_custom_code"
                      value={customForm.code}
                      onChange={(e) => setCustomForm((s) => ({ ...s, code: e.target.value }))}
                      disabled={!hasSchool}
                      autoComplete="off"
                    />
                    <Input
                      placeholder="Примітка (необов'язково)"
                      value={customForm.description}
                      onChange={(e) => setCustomForm((s) => ({ ...s, description: e.target.value }))}
                      disabled={!hasSchool}
                    />
                    <Textarea
                      className="min-h-24"
                      placeholder="Текст шаблону"
                      value={customForm.text}
                      onChange={(e) => setCustomForm((s) => ({ ...s, text: e.target.value }))}
                      disabled={!hasSchool}
                    />
                    {customError ? <p className="text-destructive text-sm">{customError}</p> : null}
                    <Button type="submit" size="sm" disabled={!hasSchool || createTemplate.isPending}>
                      {createTemplate.isPending ? "Створення…" : "Створити"}
                    </Button>
                  </form>
                </CollapsibleContent>
              </Collapsible>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
