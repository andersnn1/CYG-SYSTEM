import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  useListPerfumery,
  useCreatePerfumeryItem,
  useUpdatePerfumeryItem,
  useDeletePerfumeryItem,
  getListPerfumeryQueryKey,
} from "@workspace/api-client-react";
import type { PerfumeryItem, CreatePerfumeryItemBody, UpdatePerfumeryItemBody } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { formatCurrency } from "@/lib/format";
import { Plus, Pencil, Trash2, AlertTriangle, Droplets } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

type FormData = {
  name: string;
  brand: string;
  ml: number;
  stock: number;
  costPrice: number;
  salePrice: number;
  description: string;
  code: string;
};

const defaultForm: FormData = {
  name: "",
  brand: "",
  ml: 100,
  stock: 0,
  costPrice: 0,
  salePrice: 0,
  description: "",
  code: "",
};

export default function Perfumeria() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { data: items, isLoading } = useListPerfumery();
  const createMutation = useCreatePerfumeryItem();
  const updateMutation = useUpdatePerfumeryItem();
  const deleteMutation = useDeletePerfumeryItem();

  const [formOpen, setFormOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [editItem, setEditItem] = useState<PerfumeryItem | null>(null);
  const [deleteId, setDeleteId] = useState<number | null>(null);
  const [form, setForm] = useState<FormData>(defaultForm);

  const invalidate = () => queryClient.invalidateQueries({ queryKey: getListPerfumeryQueryKey() });

  const openCreate = () => {
    setEditItem(null);
    setForm(defaultForm);
    setFormOpen(true);
  };

  const openEdit = (item: PerfumeryItem) => {
    setEditItem(item);
    setForm({
      name: item.name,
      brand: item.brand,
      ml: item.ml,
      stock: item.stock,
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
      brand: form.brand,
      ml: Number(form.ml),
      stock: Number(form.stock),
      costPrice: Number(form.costPrice),
      salePrice: Number(form.salePrice),
      description: form.description || null,
      code: form.code || null,
    };

    if (editItem) {
      updateMutation.mutate(
        { id: editItem.id, data: body as UpdatePerfumeryItemBody },
        {
          onSuccess: () => {
            invalidate();
            setFormOpen(false);
            toast({ title: "Producto actualizado" });
          },
          onError: () => toast({ title: "Error al actualizar", variant: "destructive" }),
        }
      );
    } else {
      createMutation.mutate(
        { data: body as CreatePerfumeryItemBody },
        {
          onSuccess: () => {
            invalidate();
            setFormOpen(false);
            toast({ title: "Producto creado" });
          },
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
        onSuccess: () => {
          invalidate();
          setDeleteOpen(false);
          toast({ title: "Producto eliminado" });
        },
        onError: () => toast({ title: "Error al eliminar", variant: "destructive" }),
      }
    );
  };

  const margin = form.salePrice && form.costPrice
    ? (((Number(form.salePrice) - Number(form.costPrice)) / Number(form.salePrice)) * 100).toFixed(1)
    : "0";

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight flex items-center gap-3">
            <Droplets className="h-8 w-8 text-primary" />
            Perfumeria
          </h1>
          <p className="text-muted-foreground mt-1">Control de fragancias, marcas y stock</p>
        </div>
        <Button onClick={openCreate} className="gap-2">
          <Plus className="h-4 w-4" /> Nuevo Producto
        </Button>
      </div>

      {isLoading ? (
        <div className="space-y-3">
          {[1, 2, 3].map(i => <Skeleton key={i} className="h-16 w-full" />)}
        </div>
      ) : (
        <Card>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-muted/50">
                    <th className="text-left font-medium px-4 py-3 w-16">ID</th>
                    <th className="text-left font-medium px-4 py-3 w-28">Código</th>
                    <th className="text-left font-medium px-4 py-3">Producto</th>
                    <th className="text-left font-medium px-4 py-3">Marca</th>
                    <th className="text-center font-medium px-4 py-3">ml</th>
                    <th className="text-center font-medium px-4 py-3">Stock</th>
                    <th className="text-right font-medium px-4 py-3">Costo</th>
                    <th className="text-right font-medium px-4 py-3">Precio Venta</th>
                    <th className="text-right font-medium px-4 py-3">Margen</th>
                    <th className="text-center font-medium px-4 py-3">Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {items && items.length > 0 ? items.map(item => {
                    const marginPct = item.salePrice > 0
                      ? (((item.salePrice - item.costPrice) / item.salePrice) * 100).toFixed(1)
                      : "0";
                    const isLowStock = item.stock < 5;
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
                        <td className="px-4 py-3 text-muted-foreground">{item.brand}</td>
                        <td className="px-4 py-3 text-center">
                          <Badge variant="secondary">{item.ml}ml</Badge>
                        </td>
                        <td className="px-4 py-3 text-center">
                          {isLowStock ? (
                            <Badge variant="destructive" className="gap-1">
                              <AlertTriangle className="h-3 w-3" /> {item.stock}
                            </Badge>
                          ) : (
                            <Badge variant="outline">{item.stock}</Badge>
                          )}
                        </td>
                        <td className="px-4 py-3 text-right text-muted-foreground">{formatCurrency(item.costPrice)}</td>
                        <td className="px-4 py-3 text-right font-medium">{formatCurrency(item.salePrice)}</td>
                        <td className="px-4 py-3 text-right">
                          <span className="text-green-600 dark:text-green-400 font-medium">{marginPct}%</span>
                        </td>
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
                      <td colSpan={10} className="px-4 py-12 text-center text-muted-foreground">
                        No hay productos registrados. Crea el primero.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Form Dialog */}
      <Dialog open={formOpen} onOpenChange={setFormOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{editItem ? "Editar Producto" : "Nuevo Producto"}</DialogTitle>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-4">
            <div className="col-span-2 space-y-1">
              <Label>Nombre del Producto</Label>
              <Input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="Polo Blue" />
            </div>
            <div className="space-y-1">
              <Label>Marca</Label>
              <Input value={form.brand} onChange={e => setForm({ ...form, brand: e.target.value })} placeholder="Ralph Lauren" />
            </div>
            <div className="space-y-1">
              <Label>Mililitros (ml)</Label>
              <Input type="number" value={form.ml} onChange={e => setForm({ ...form, ml: Number(e.target.value) })} placeholder="100" />
            </div>
            <div className="space-y-1">
              <Label>Stock</Label>
              <Input type="number" value={form.stock} onChange={e => setForm({ ...form, stock: Number(e.target.value) })} placeholder="0" />
            </div>
            <div className="space-y-1">
              <Label>Precio de Costo (L.)</Label>
              <Input type="number" step="0.01" value={form.costPrice} onChange={e => setForm({ ...form, costPrice: Number(e.target.value) })} placeholder="0.00" />
            </div>
            <div className="space-y-1">
              <Label>Precio de Venta (L.)</Label>
              <Input type="number" step="0.01" value={form.salePrice} onChange={e => setForm({ ...form, salePrice: Number(e.target.value) })} placeholder="0.00" />
            </div>
            <div className="col-span-2">
              <p className="text-sm text-muted-foreground">
                Margen de ganancia: <span className="font-medium text-green-600">{margin}%</span>
                {form.salePrice > 0 && form.costPrice > 0 && (
                  <span className="ml-2">| Ganancia por unidad: <span className="font-medium">{formatCurrency(Number(form.salePrice) - Number(form.costPrice))}</span></span>
                )}
              </p>
            </div>
            <div className="space-y-1">
              <Label>Código (opcional)</Label>
              <Input value={form.code} onChange={e => setForm({ ...form, code: e.target.value })} placeholder="Ej: PERF-001" />
            </div>
            <div className="space-y-1">
              <Label>Descripcion (opcional)</Label>
              <Input value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} placeholder="Notas o descripcion..." />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setFormOpen(false)}>Cancelar</Button>
            <Button onClick={handleSubmit} disabled={createMutation.isPending || updateMutation.isPending}>
              {editItem ? "Guardar Cambios" : "Crear Producto"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Dialog */}
      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Eliminar Producto</AlertDialogTitle>
            <AlertDialogDescription>Esta accion no se puede deshacer. El producto sera eliminado permanentemente.</AlertDialogDescription>
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
