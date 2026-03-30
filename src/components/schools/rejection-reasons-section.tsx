"use client";

import { useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import {
  useCreateRejectionReasonMutation,
  useDeleteRejectionReasonMutation,
  useRejectionReasonsQuery,
  useUpdateRejectionReasonMutation,
  type RejectionReasonRow,
} from "@/hooks/api";
import { ApiError } from "@/lib/api-http";

type FormState = { label: string; messageText: string };
const emptyForm: FormState = { label: "", messageText: "" };

export function RejectionReasonsSection({ schoolId }: { schoolId: string }) {
  const { data: reasonsPayload, isFetching } = useRejectionReasonsQuery(schoolId);
  const reasons = reasonsPayload?.data ?? [];

  const createMutation = useCreateRejectionReasonMutation(schoolId);
  const updateMutation = useUpdateRejectionReasonMutation(schoolId);
  const deleteMutation = useDeleteRejectionReasonMutation(schoolId);

  const [createOpen, setCreateOpen] = useState(false);
  const [editingReason, setEditingReason] = useState<RejectionReasonRow | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm);

  function openCreate() {
    setForm(emptyForm);
    setCreateOpen(true);
  }

  function openEdit(reason: RejectionReasonRow) {
    setForm({ label: reason.label, messageText: reason.messageText });
    setEditingReason(reason);
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!form.label.trim() || !form.messageText.trim()) {
      toast.error("Заповніть усі поля");
      return;
    }
    try {
      await createMutation.mutateAsync({
        label: form.label.trim(),
        messageText: form.messageText.trim(),
        sortOrder: reasons.length,
      });
      toast.success("Причину додано");
      setCreateOpen(false);
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "Помилка");
    }
  }

  async function handleUpdate(e: React.FormEvent) {
    e.preventDefault();
    if (!editingReason) return;
    if (!form.label.trim() || !form.messageText.trim()) {
      toast.error("Заповніть усі поля");
      return;
    }
    try {
      await updateMutation.mutateAsync({
        reasonId: editingReason.id,
        body: { label: form.label.trim(), messageText: form.messageText.trim() },
      });
      toast.success("Причину оновлено");
      setEditingReason(null);
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "Помилка");
    }
  }

  async function handleDelete(reasonId: string) {
    try {
      await deleteMutation.mutateAsync(reasonId);
      toast.success("Причину видалено");
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "Помилка");
    }
  }

  return (
    <>
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Нова причина відхилення</DialogTitle>
          </DialogHeader>
          <form className="space-y-4" onSubmit={(e) => void handleCreate(e)}>
            <div className="space-y-2">
              <Label htmlFor="rr-create-label">Назва</Label>
              <Input
                id="rr-create-label"
                value={form.label}
                onChange={(e) => setForm((f) => ({ ...f, label: e.target.value }))}
                placeholder="Коротка назва для адміна"
                autoFocus
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="rr-create-text">Текст повідомлення студенту</Label>
              <Textarea
                id="rr-create-text"
                className="min-h-24"
                value={form.messageText}
                onChange={(e) => setForm((f) => ({ ...f, messageText: e.target.value }))}
                placeholder="Текст, який буде надіслано студенту в Telegram…"
              />
            </div>
            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => setCreateOpen(false)}>
                Скасувати
              </Button>
              <Button type="submit" disabled={createMutation.isPending}>
                {createMutation.isPending ? "Збереження…" : "Додати"}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={editingReason !== null} onOpenChange={(open) => { if (!open) setEditingReason(null); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Редагувати причину відхилення</DialogTitle>
          </DialogHeader>
          <form className="space-y-4" onSubmit={(e) => void handleUpdate(e)}>
            <div className="space-y-2">
              <Label htmlFor="rr-edit-label">Назва</Label>
              <Input
                id="rr-edit-label"
                value={form.label}
                onChange={(e) => setForm((f) => ({ ...f, label: e.target.value }))}
                placeholder="Коротка назва для адміна"
                autoFocus
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="rr-edit-text">Текст повідомлення студенту</Label>
              <Textarea
                id="rr-edit-text"
                className="min-h-24"
                value={form.messageText}
                onChange={(e) => setForm((f) => ({ ...f, messageText: e.target.value }))}
                placeholder="Текст, який буде надіслано студенту в Telegram…"
              />
            </div>
            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => setEditingReason(null)}>
                Скасувати
              </Button>
              <Button type="submit" disabled={updateMutation.isPending}>
                {updateMutation.isPending ? "Збереження…" : "Зберегти"}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      <Card>
        <CardHeader className="border-b border-border/60 pb-4">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div className="min-w-0 space-y-1">
              <CardTitle>Причини відхилення</CardTitle>
              <CardDescription>
                При відхиленні заявки менеджер обирає причину — студент отримає відповідне повідомлення в Telegram.
              </CardDescription>
            </div>
            <Button type="button" className="shrink-0 self-start sm:self-auto" onClick={openCreate}>
              Додати причину
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-3 pt-6">
          {isFetching ? (
            <div className="space-y-3">
              {Array.from({ length: 3 }, (_, i) => (
                <div key={i} className="rounded-lg border p-4">
                  <Skeleton className="h-4 w-40" />
                  <Skeleton className="mt-2 h-3 w-64" />
                </div>
              ))}
            </div>
          ) : reasons.length === 0 ? (
            <div className="rounded-lg border border-dashed p-8 text-center">
              <p className="text-muted-foreground text-sm">Немає причин відхилення.</p>
              <p className="text-muted-foreground mt-1 text-xs">
                Натисніть «Додати причину», щоб створити першу.
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {reasons.map((reason) => (
                <div
                  key={reason.id}
                  className="rounded-lg border border-border/80 p-4 transition-colors hover:bg-muted/30"
                >
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div className="min-w-0 space-y-1">
                      <div className="font-medium">{reason.label}</div>
                      <p className="text-muted-foreground line-clamp-2 text-xs">{reason.messageText}</p>
                    </div>
                    <div className="flex shrink-0 gap-2 self-start">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => openEdit(reason)}
                      >
                        Редагувати
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => void handleDelete(reason.id)}
                        disabled={deleteMutation.isPending}
                      >
                        Видалити
                      </Button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </>
  );
}
