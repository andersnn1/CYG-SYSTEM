import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  useListSublimationItems,
  useCreateSublimationItem,
  useUpdateSublimationItem,
  useDeleteSublimationItem,
  getListSublimationItemsQueryKey,
} from "@workspace/api-client-react";
import type { SublimationItem, CreateSublimationItemBody, UpdateSublimationItemBody } from "@workspace/api-client-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { formatCurrency } from "@/lib/format";
import { Plus, Pencil, Trash2, AlertTriangle, Printer } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

type FormData = {
  name: string;
  category: string;
  itemType: "maquinaria" | "consumible";
  stock: string;
  costPrice: number;
  salePrice: number;
  description: string;
  code: string;
};

const defaultForm: FormData = {
  name: "",
  category: "",
  itemType: "consumible",
  stock: "",
  costPrice: 0,
  salePrice: 0,
  description: "",
  code: "",
};

export default function Sublimacion() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { data: items, isLoading } = useListSublimationItems();
  const createMutation = useCreateSublimationItem();
  const updateMutation = useUpdateSublimationItem();
  const deleteMutation = useDeleteSublimationItem();

  const [formOpen, setFormOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [editItem, setEditItem] = useState<SublimationItem | null>(null);
  const [deleteId, setDeleteId] = useState<number | null>(null);
  const [form, setForm] = useState<FormData>(defaultForm);

  const invalidate = () => queryClient.invalidateQueries({ queryKey: getListSublimationItemsQueryKey() });

  const openCreate = () => {
    setEditItem(null);
    setForm(defaultForm);
    setFormOpen(true);
  };

  const openEdit = (item: SublimationItem) => {
    setEditItem(item);
    setForm({
      name: item.name,
      category: item.category,
      itemType: item.itemType as "maquinaria" | "consumible",
      stock: item.stock !== null && item.stock !== undefined ? String(item.stock) : "",
      costPrice: item.costPrice,
      salePrice: item.salePrice,
      description: item.description ?? "",
      code: item.code ?? "",
    });
    setFormOpen(true);
  };

  const openDelete = (id: number) => {
    setDeleteId(id);
    setDeleteOpen(true);
  };

  const handleSubmit = () => {
    const body = {
      name: form.name,
      category: form.category,
      itemType: form.itemType,
      stock: form.stock !== "" ? Number(form.stock) : null,
      costPrice: Number(form.costPrice),
      salePrice: Number(form.salePrice),
      description: form.description || null,
      code: form.code || null,
    };

    if (editItem) {
      updateMutation.mutate(
        { id: editItem.id, data: body as UpdateSublimationItemBody },
        {
          onSuccess: () => { invalidate(); setFormOpen(false); toast({ title: "Item actualizado" }); },
          onError: () => toast({ title: "Error al actualizar", variant: "destructive" }),
        }
      );
    } else {
      createMutation.mutate(
        { data: body as CreateSublimationItemBody },
        {
          onSuccess: () => { invalidate(); setFormOpen(false); toast({ title: "Item creado" }); },
          onError: () => toast({ title: "Error al crear", variant: "destructive" }),
        }
      );
    }
  };

  const handleDelete = () => {
    if (!deleteId) return;
    deleteMutation.mutate(
      { id: deleteId },
      {
        onSuccess: () => { invalidate(); setDeleteOpen(false); toast({ title: "Item eliminado" }); },
        onError: () => toast({ title: "Error al eliminar", variant: "destructive" }),
      }
    );
  };

  const maquinaria = items?.filter(i => i.itemType === "maquinaria") ?? [];
  const consumibles = items?.filter(i => i.itemType === "consumible") ?? [];

  const ItemTable = ({ data, title }: { data: SublimationItem[], title: string }) => (
    <div>
      {/* Section header */}
      <div className="flex items-center gap-2 mb-3">
        <h2 className="font-semibold text-sm">{title}</h2>
        <Badge variant="secondary">{data.length}</Badge>
      </div>

      {/* ── Desktop Table ── */}
      <div className="hidden sm:block">
        <Card>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-muted/50">
                    <th className="text-left font-medium px-4 py-3 w-16">ID</th>
                    <th className="text-left font-medium px-4 py-3 w-28">Código</th>
                    <th className="text-left font-medium px-4 py-3">Nombre</th>
                    <th className="text-left font-medium px-4 py-3">Categoria</th>
                    <th className="text-center font-medium px-4 py-3">Stock</th>
                    <th className="text-right font-medium px-4 py-3">Costo</th>
                    <th className="text-right font-medium px-4 py-3">Precio Venta</th>
                    <th className="text-center font-medium px-4 py-3">Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {data.length > 0 ? data.map(item => {
                    const isLowStock = item.stock !== null && item.stock !== undefined && item.stock < 5;
                    return (
                      <tr key={item.id} className="border-b hover:bg-muted/30 transition-colors">
                        <td className="px-4 py-3">
                          <span className="font-mono text-xs font-semibold text-muted-foreground">#{String(item.id).padStart(3, "0")}</span>
                        </td>
                        <td className="px-4 py-3">
                          {item.code
                            ? <Badge variant="secondary" className="font-mono text-xs">{item.code}</Badge>
                            : <span className="text-xs text-muted-foreground">—</span>}
                        </td>
                        <td className="px-4 py-3">
                          <div className="font-medium">{item.name}</div>
                          {item.description && <div className="text-xs text-muted-foreground">{item.description}</div>}
                        </td>
                        <td className="px-4 py-3 text-muted-foreground">{item.category}</td>
                        <td className="px-4 py-3 text-center">
                          {item.stock === null || item.stock === undefined ? (
                            <Badge variant="outline">N/A</Badge>
                          ) : isLowStock ? (
                            <Badge variant="destructive" className="gap-1">
                              <AlertTriangle className="h-3 w-3" /> {item.stock}
                            </Badge>
                          ) : (
                            <Badge variant="outline">{item.stock}</Badge>
                          )}
                        </td>
                        <td className="px-4 py-3 text-right text-muted-foreground">{formatCurrency(item.costPrice)}</td>
                        <td className="px-4 py-3 text-right font-medium">{formatCurrency(item.salePrice)}</td>
                        <td className="px-4 py-3">
                          <div className="flex justify-center gap-2">
                            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openEdit(item)}>
                              <Pencil className="h-4 w-4" />
                            </Button>
                            <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive hover:text-destructive" onClick={() => openDelete(item.id)}>
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        </td>
                      </tr>
                    );
                  }) : (
                    <tr>
                      <td colSpan={8} className="px-4 py-8 text-center text-muted-foreground">No hay items en esta categoria.</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* ── Mobile Cards ── */}
      <div className="sm:hidden space-y-3">
        {data.length > 0 ? data.map(item => {
          const isLowStock = item.stock !== null && item.stock !== undefined && item.stock < 5;
          return (
            <div key={item.id} className="bg-card border border-border rounded-xl p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-semibold text-base truncate">{item.name}</span>
                    {item.code && (
                      <Badge variant="secondary" className="font-mono text-xs flex-shrink-0">{item.code}</Badge>
                    )}
                  </div>
                  <p className="text-sm text-muted-foreground mt-0.5">{item.category}</p>
                  {item.description && (
                    <p className="text-xs text-muted-foreground mt-1 truncate">{item.description}</p>
                  )}
                </div>
                <div className="flex gap-1 flex-shrink-0">
                  <Button variant="ghost" size="icon" className="h-11 w-11" onClick={() => openEdit(item)}>
                    <Pencil className="h-4 w-4" />
                  </Button>
                  <Button variant="ghost" size="icon" className="h-11 w-11 text-destructive hover:text-destructive" onClick={() => openDelete(item.id)}>
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
              <div className="mt-3 grid grid-cols-3 gap-2 text-sm">
                <div className="bg-muted/50 rounded-lg p-2 text-center">
                  <div className="text-xs text-muted-foreground mb-1">Stock</div>
                  {item.stock === null || item.stock === undefined ? (
                    <Badge variant="outline" className="text-xs">N/A</Badge>
                  ) : isLowStock ? (
                    <Badge variant="destructive" className="gap-1 text-xs">
                      <AlertTriangle className="h-3 w-3" /> {item.stock}
                    </Badge>
                  ) : (
                    <span className="font-semibold">{item.stock}</span>
                  )}
                </div>
                <div className="bg-muted/50 rounded-lg p-2 text-center">
                  <div className="text-xs text-muted-foreground mb-1">Venta</div>
                  <span className="font-semibold">{formatCurrency(item.salePrice)}</span>
                </div>
                <div className="bg-muted/50 rounded-lg p-2 text-center">
                  <div className="text-xs text-muted-foreground mb-1">Costo</div>
                  <span className="font-medium text-muted-foreground">{formatCurrency(item.costPrice)}</span>
                </div>
              </div>
            </div>
          );
        }) : (
          <div className="bg-card border border-border rounded-xl py-8 text-center text-muted-foreground">
            No hay items en esta categoria.
          </div>
        )}
      </div>
    </div>
  );

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight flex items-center gap-2">
            <Printer className="h-6 w-6 sm:h-8 sm:w-8 text-primary flex-shrink-0" />
            Sublimación
          </h1>
          <p className="text-muted-foreground mt-1 text-sm sm:text-base">Control de maquinaria y consumibles</p>
        </div>
        <Button onClick={openCreate} className="gap-2 flex-shrink-0 h-11">
          <Plus className="h-4 w-4" />
          <span className="hidden sm:inline">Nuevo Item</span>
        </Button>
      </div>

      {isLoading ? (
        <div className="space-y-3">{[1, 2, 3].map(i => <Skeleton key={i} className="h-16 w-full" />)}</div>
      ) : (
        <div className="space-y-6">
          <ItemTable data={maquinaria} title="Maquinaria" />
          <ItemTable data={consumibles} title="Consumibles" />
        </div>
      )}

      <Dialog open={formOpen} onOpenChange={setFormOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{editItem ? "Editar Item" : "Nuevo Item"}</DialogTitle>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-4">
            <div className="col-span-2 space-y-1">
              <Label>Nombre</Label>
              <Input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="Nombre del item" />
            </div>
            <div className="space-y-1">
              <Label>Categoria</Label>
              <Input value={form.category} onChange={e => setForm({ ...form, category: e.target.value })} placeholder="Maquinaria, Consumibles..." />
            </div>
            <div className="space-y-1">
              <Label>Tipo</Label>
              <Select value={form.itemType} onValueChange={(v) => setForm({ ...form, itemType: v as "maquinaria" | "consumible" })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="maquinaria">Maquinaria</SelectItem>
                  <SelectItem value="consumible">Consumible</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>Stock (dejar vacio si no aplica)</Label>
              <Input type="number" value={form.stock} onChange={e => setForm({ ...form, stock: e.target.value })} placeholder="-" />
            </div>
            <div className="space-y-1">
              <Label>Precio de Costo (L.)</Label>
              <Input type="number" step="0.01" value={form.costPrice} onChange={e => setForm({ ...form, costPrice: Number(e.target.value) })} />
            </div>
            <div className="space-y-1">
              <Label>Precio de Venta (L.)</Label>
              <Input type="number" step="0.01" value={form.salePrice} onChange={e => setForm({ ...form, salePrice: Number(e.target.value) })} />
            </div>
            <div className="space-y-1">
              <Label>Código (opcional)</Label>
              <Input value={form.code} onChange={e => setForm({ ...form, code: e.target.value })} placeholder="Ej: SUB-001" />
            </div>
            <div className="space-y-1">
              <Label>Descripcion (opcional)</Label>
              <Input value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} placeholder="Descripcion..." />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setFormOpen(false)}>Cancelar</Button>
            <Button onClick={handleSubmit} disabled={createMutation.isPending || updateMutation.isPending}>
              {editItem ? "Guardar Cambios" : "Crear Item"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Eliminar Item</AlertDialogTitle>
            <AlertDialogDescription>Esta accion no se puede deshacer.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">Eliminar</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
