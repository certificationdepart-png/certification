"use client";

import {
  getCoreRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  type SortingState,
  useReactTable,
  type ColumnDef,
} from "@tanstack/react-table";
import { useCallback, useMemo, useState } from "react";
import { toast } from "sonner";

import { DataTable } from "@/components/data-table/data-table";
import { DataTableToolbar } from "@/components/data-table/data-table-toolbar";
import { DataTableColumnHeader } from "@/components/data-table/data-table-column-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
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
import {
  useManagersQuery,
  useRevokeManagerAccessMutation,
  useUpdateManagerAccessMutation,
} from "@/hooks/api";
import { ApiError } from "@/lib/api-http";
import type { ManagerWithAccess } from "@/lib/admin-fetchers";

type SchoolOption = { id: string; name: string };

type DraftGrant = {
  schoolId: string;
  canViewApplications: boolean;
  canDeleteApplications: boolean;
  canEditSchool: boolean;
  canAddSchool: boolean;
  canAddCourses: boolean;
};

const PERMISSION_LABELS: { key: keyof Omit<DraftGrant, "schoolId" | "canAddSchool">; label: string }[] = [
  { key: "canViewApplications", label: "Перегляд заявок" },
  { key: "canDeleteApplications", label: "Видалення заявок" },
  { key: "canEditSchool", label: "Редагування школи" },
  { key: "canAddCourses", label: "Додавання курсів" },
];

function emptyGrant(schoolId: string): DraftGrant {
  return {
    schoolId,
    canViewApplications: false,
    canDeleteApplications: false,
    canEditSchool: false,
    canAddSchool: false,
    canAddCourses: false,
  };
}

function roleBadgeVariant(role: string): "default" | "secondary" | "outline" {
  if (role === "admin") return "default";
  if (role === "manager") return "secondary";
  return "outline";
}

export function ManagersClient({
  initialManagers,
  allSchools,
}: {
  initialManagers: ManagerWithAccess[];
  allSchools: SchoolOption[];
}) {
  const { data: managers = initialManagers } = useManagersQuery(initialManagers);
  const updateMutation = useUpdateManagerAccessMutation();
  const revokeMutation = useRevokeManagerAccessMutation();

  const [sorting, setSorting] = useState<SortingState>([]);
  const [search, setSearch] = useState("");
  const [selectedManager, setSelectedManager] = useState<ManagerWithAccess | null>(null);
  const [draftGrants, setDraftGrants] = useState<DraftGrant[]>([]);
  const [globalCanAddSchool, setGlobalCanAddSchool] = useState(false);
  const [revokeTarget, setRevokeTarget] = useState<ManagerWithAccess | null>(null);
  const [schoolPickerOpen, setSchoolPickerOpen] = useState(false);
  const [schoolSearch, setSchoolSearch] = useState("");

  const filtered = useMemo(() => {
    const needle = search.trim().toLowerCase();
    if (!needle) return managers;
    return managers.filter(
      (m) =>
        m.name.toLowerCase().includes(needle) ||
        m.email.toLowerCase().includes(needle),
    );
  }, [managers, search]);

  const openSheet = useCallback((manager: ManagerWithAccess) => {
    const grants: DraftGrant[] = manager.schoolAccess.map((a) => ({
      schoolId: a.schoolId,
      canViewApplications: a.canViewApplications,
      canDeleteApplications: a.canDeleteApplications,
      canEditSchool: a.canEditSchool,
      canAddSchool: a.canAddSchool,
      canAddCourses: a.canAddCourses,
    }));
    setDraftGrants(grants);
    setGlobalCanAddSchool(manager.schoolAccess.some((a) => a.canAddSchool));
    setSelectedManager(manager);
  }, []);

  const closeSheet = useCallback(() => {
    setSelectedManager(null);
    setDraftGrants([]);
    setGlobalCanAddSchool(false);
    setSchoolPickerOpen(false);
    setSchoolSearch("");
  }, []);

  const assignedSchoolIds = useMemo(
    () => new Set(draftGrants.map((g) => g.schoolId)),
    [draftGrants],
  );

  const availableSchools = useMemo(
    () => {
      const needle = schoolSearch.trim().toLowerCase();
      return allSchools.filter(
        (s) => !assignedSchoolIds.has(s.id) && s.name.toLowerCase().includes(needle),
      );
    },
    [allSchools, assignedSchoolIds, schoolSearch],
  );

  const schoolNameById = useMemo(() => {
    const map = new Map(allSchools.map((s) => [s.id, s.name]));
    // also pull from manager.schoolAccess for schools not in allSchools
    selectedManager?.schoolAccess.forEach((a) => {
      if (!map.has(a.schoolId)) map.set(a.schoolId, a.schoolName);
    });
    return map;
  }, [allSchools, selectedManager]);

  const updateGrant = useCallback(
    (schoolId: string, key: keyof Omit<DraftGrant, "schoolId">, value: boolean) => {
      setDraftGrants((prev) =>
        prev.map((g) => (g.schoolId === schoolId ? { ...g, [key]: value } : g)),
      );
    },
    [],
  );

  const removeGrant = useCallback((schoolId: string) => {
    setDraftGrants((prev) => prev.filter((g) => g.schoolId !== schoolId));
  }, []);

  const addSchool = useCallback((school: SchoolOption) => {
    setDraftGrants((prev) => [...prev, emptyGrant(school.id)]);
    setSchoolPickerOpen(false);
    setSchoolSearch("");
  }, []);

  const handleSave = useCallback(async () => {
    if (!selectedManager) return;
    const grants = draftGrants.map((g) => ({ ...g, canAddSchool: globalCanAddSchool }));
    try {
      await updateMutation.mutateAsync({ userId: selectedManager.id, grants });
      toast.success("Доступ збережено");
      closeSheet();
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "Не вдалося зберегти доступ");
    }
  }, [selectedManager, draftGrants, globalCanAddSchool, updateMutation, closeSheet]);

  const confirmRevoke = useCallback(async () => {
    if (!revokeTarget) return;
    try {
      await revokeMutation.mutateAsync(revokeTarget.id);
      toast.success("Доступ відкликано");
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "Не вдалося відкликати доступ");
    } finally {
      setRevokeTarget(null);
      closeSheet();
    }
  }, [revokeTarget, revokeMutation, closeSheet]);

  const columns = useMemo<ColumnDef<ManagerWithAccess>[]>(
    () => [
      {
        accessorKey: "name",
        header: ({ column }) => <DataTableColumnHeader column={column} title="Ім'я" />,
        cell: ({ row }) => <span className="font-medium">{row.original.name}</span>,
      },
      {
        accessorKey: "email",
        header: ({ column }) => <DataTableColumnHeader column={column} title="Email" />,
        cell: ({ row }) => (
          <span className="text-muted-foreground">{row.original.email}</span>
        ),
      },
      {
        accessorKey: "role",
        header: ({ column }) => <DataTableColumnHeader column={column} title="Роль" />,
        cell: ({ row }) => (
          <Badge variant={roleBadgeVariant(row.original.role)}>
            {row.original.role}
          </Badge>
        ),
      },
      {
        id: "schools",
        header: "Школи",
        cell: ({ row }) => (
          <span className="text-muted-foreground">
            {row.original.schoolAccess.length > 0
              ? row.original.schoolAccess.map((a) => a.schoolName).join(", ")
              : "—"}
          </span>
        ),
      },
      {
        id: "actions",
        cell: ({ row }) => (
          <Button
            variant="outline"
            size="sm"
            onClick={() => openSheet(row.original)}
          >
            Налаштувати
          </Button>
        ),
      },
    ],
    [openSheet],
  );

  const table = useReactTable({
    data: filtered,
    columns,
    state: { sorting },
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    initialState: { pagination: { pageSize: 20 } },
    getRowId: (row) => row.id,
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Менеджери</h1>
        <p className="text-muted-foreground text-sm">
          Управління доступом користувачів до шкіл та їх дозволами.
        </p>
      </div>

      <div className="data-table-container">
        <DataTable table={table}>
          <DataTableToolbar table={table}>
            <Input
              placeholder="Пошук за ім'ям або email…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="h-8 w-56 lg:w-72"
            />
          </DataTableToolbar>
        </DataTable>
      </div>

      {/* Access editor sheet */}
      <Sheet open={!!selectedManager} onOpenChange={(open) => { if (!open) closeSheet(); }}>
        <SheetContent side="right" className="w-full sm:max-w-lg overflow-y-auto">
          {selectedManager && (
            <>
              <SheetHeader>
                <SheetTitle>{selectedManager.name}</SheetTitle>
                <SheetDescription>{selectedManager.email}</SheetDescription>
              </SheetHeader>

              <div className="flex flex-col gap-4 px-4 py-2">
                {/* Global canAddSchool toggle */}
                <div className="flex items-center gap-3 rounded-md border p-3">
                  <Checkbox
                    checked={globalCanAddSchool}
                    onCheckedChange={(checked) => setGlobalCanAddSchool(!!checked)}
                    id="global-can-add-school"
                  />
                  <label htmlFor="global-can-add-school" className="text-sm font-medium cursor-pointer">
                    Може створювати нові школи
                  </label>
                </div>

                <Separator />

                {/* Per-school permissions */}
                <div className="flex flex-col gap-3">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium">Доступ до шкіл</span>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => setSchoolPickerOpen((v) => !v)}
                    >
                      + Додати школу
                    </Button>
                  </div>

                  {/* School picker */}
                  {schoolPickerOpen && (
                    <div className="rounded-md border p-2 flex flex-col gap-1">
                      <Input
                        placeholder="Пошук школи…"
                        value={schoolSearch}
                        onChange={(e) => setSchoolSearch(e.target.value)}
                        className="h-7 text-sm"
                      />
                      <div className="max-h-40 overflow-y-auto mt-1">
                        {availableSchools.length === 0 ? (
                          <p className="text-muted-foreground text-sm px-2 py-1">Немає доступних шкіл</p>
                        ) : (
                          availableSchools.map((s) => (
                            <button
                              key={s.id}
                              type="button"
                              className="w-full text-left px-2 py-1.5 text-sm rounded hover:bg-muted"
                              onClick={() => addSchool(s)}
                            >
                              {s.name}
                            </button>
                          ))
                        )}
                      </div>
                    </div>
                  )}

                  {draftGrants.length === 0 ? (
                    <p className="text-muted-foreground text-sm">Жодної школи не призначено</p>
                  ) : (
                    draftGrants.map((grant) => (
                      <div key={grant.schoolId} className="rounded-md border p-3 flex flex-col gap-2">
                        <div className="flex items-center justify-between">
                          <span className="font-medium text-sm">
                            {schoolNameById.get(grant.schoolId) ?? grant.schoolId}
                          </span>
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            className="h-6 text-xs text-destructive hover:text-destructive"
                            onClick={() => removeGrant(grant.schoolId)}
                          >
                            Видалити
                          </Button>
                        </div>
                        <div className="grid grid-cols-2 gap-2">
                          {PERMISSION_LABELS.map(({ key, label }) => (
                            <label key={key} className="flex items-center gap-2 text-sm cursor-pointer">
                              <Checkbox
                                checked={grant[key]}
                                onCheckedChange={(checked) =>
                                  updateGrant(grant.schoolId, key, !!checked)
                                }
                              />
                              {label}
                            </label>
                          ))}
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>

              <SheetFooter className="flex flex-row gap-2 justify-between">
                <Button
                  variant="destructive"
                  size="sm"
                  onClick={() => setRevokeTarget(selectedManager)}
                  disabled={selectedManager.role === "admin"}
                >
                  Відкликати весь доступ
                </Button>
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" onClick={closeSheet}>
                    Скасувати
                  </Button>
                  <Button
                    size="sm"
                    onClick={handleSave}
                    disabled={updateMutation.isPending}
                  >
                    {updateMutation.isPending ? "Збереження…" : "Зберегти"}
                  </Button>
                </div>
              </SheetFooter>
            </>
          )}
        </SheetContent>
      </Sheet>

      {/* Revoke confirmation */}
      <AlertDialog open={!!revokeTarget} onOpenChange={(open) => { if (!open) setRevokeTarget(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Відкликати весь доступ?</AlertDialogTitle>
            <AlertDialogDescription>
              Користувач <strong>{revokeTarget?.email}</strong> більше не матиме доступу до жодної
              школи. Дію можна скасувати, призначивши доступ знову.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Скасувати</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmRevoke}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Відкликати
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
