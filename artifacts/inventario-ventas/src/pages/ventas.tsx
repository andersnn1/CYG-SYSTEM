import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  useListSales,
  useCreateSale,
  useUpdateSale,
  useDeleteSale,
  useListPerfumery,
  useListSublimationItems,
  useListClients,
  getListSalesQueryKey,
} from "@workspace/api-client-react";
import type { CreateSaleBody, Sale, UpdateSaleBody } from "@workspace/api-client-react";
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
import { Plus, Trash2, ShoppingCart, TrendingUp, Truck, Package, AlertCircle, Pencil } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

const MONTHS = ["Enero","Febrero","Marzo","Abril","Mayo","Junio","Julio","Agosto","Septiembre","Octubre","Noviembre","Diciembre"];

type SaleForm = {
  productType: "perfumeria" | "sublimacion";
  productId: string;
  clientId: string;
  quantity: number;
  unitPrice: number;
  shippingCost: number;
  notes: string;
  saleDate: string;
};

const defaultForm: SaleForm = {
  productType: "perfumeria",
  productId: "",
  clientId: "",
  quantity: 1,
  unitPrice: 0,
  shippingCost: 0,
  notes: "",
  saleDate: new Date().toISOString().split("T")[0],
};

type EditForm = {
  clientId: string;
  quantity: number;
  unitPrice: number;
  costPrice: number;
  shippingCost: number;
  notes: string;
  saleDate: string;
};

export default function Ventas() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const now = new Date();
  const [filterMonth, setFilterMonth] = useState<string>(String(now.getMonth() + 1));
  const [filterYear, setFilterYear] = useState<string>(String(now.getFullYear()));
  const [formOpen, setFormOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteId, setDeleteId] = useState<number | null>(null);
  const [form, setForm] = useState<SaleForm>(defaultForm);

  // Edit state
  const [editOpen, setEditOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editForm, setEditForm] = useState<EditForm>({
    clientId: "",
    quantity: 1,
    unitPrice: 0,
    costPrice: 0,
    shippingCost: 0,
    notes: "",
    saleDate: "",
  });

  const { data: sales, isLoading } = useListSales(
    { month: Number(filterMonth), year: Number(filterYear) },
    { query: { queryKey: getListSalesQueryKey({ month: Number(filterMonth), year: Number(filterYear) }) } }
  );
  const { data: perfumery } = useListPerfumery();
  const { data: sublimation } = useListSublimationItems();
  const { data: clients } = useListClients();
  const createMutation = useCreateSale();
  const updateMutation = useUpdateSale();
  const deleteMutation = useDeleteSale();

  // Auto-fetch cost from the selected product (never manually entered)
  const selectedProduct = form.productType === "perfumeria"
    ? perfumery?.find(p => String(p.id) === form.productId)
    : sublimation?.find(p => String(p.id) === form.productId);

  const autoCostPrice = selectedProduct ? Number(selectedProduct.costPrice) : 0;
  const productStock = selectedProduct
    ? (form.productType === "perfumeria"
        ? (selectedProduct as typeof perfumery extends undefined ? never : NonNullable<typeof perfumery>[number]).stock
        : (selectedProduct as NonNullable<typeof sublimation>[number]).stock ?? null)
    : null;

  const totalAmount = Number(form.unitPrice) * Number(form.quantity);
  const fondoReposicion = autoCostPrice * Number(form.quantity);
  const shippingCost = Number(form.shippingCost);
  const gananciaBruta = totalAmount - fondoReposicion - shippingCost;
  const pfOperacion = gananciaBruta * 0.50;
  const pfDueno = gananciaBruta * 0.40;
  const pfGanancia = gananciaBruta * 0.10;

  // Edit form financial preview
  const editTotal = Number(editForm.unitPrice) * Number(editForm.quantity);
  const editCostTotal = Number(editForm.costPrice) * Number(editForm.quantity);
  const editShipping = Number(editForm.shippingCost);
  const editGanancia = editTotal - editCostTotal - editShipping;
  const editPfOp = editGanancia * 0.50;
  const editPfDueno = editGanancia * 0.40;
  const editPfGanancia = editGanancia * 0.10;

  const handleProductTypeChange = (type: "perfumeria" | "sublimacion") => {
    setForm({ ...form, productType: type, productId: "", unitPrice: 0 });
  };

  const handleProductChange = (productId: string) => {
    const product = form.productType === "perfumeria"
      ? perfumery?.find(p => String(p.id) === productId)
      : sublimation?.find(p => String(p.id) === productId);
    setForm({ ...form, productId, unitPrice: product ? Number(product.salePrice) : 0 });
  };

  const handleSubmit = () => {
    if (!form.productId) {
      toast({ title: "Selecciona un producto", variant: "destructive" });
      return;
    }
    const body: CreateSaleBody = {
      productType: form.productType,
      productId: Number(form.productId),
      clientId: form.clientId ? Number(form.clientId) : null,
      quantity: Number(form.quantity),
      unitPrice: Number(form.unitPrice),
      shippingCost: Number(form.shippingCost),
      notes: form.notes || null,
      saleDate: form.saleDate,
    };
    createMutation.mutate(
      { data: body },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getListSalesQueryKey() });
          setFormOpen(false);
          setForm(defaultForm);
          toast({ title: "Venta registrada exitosamente" });
        },
        onError: () => toast({ title: "Error al registrar venta", variant: "destructive" }),
      }
    );
  };

  const openEdit = (sale: Sale) => {
    setEditingId(sale.id);
    setEditForm({
      clientId: sale.clientId ? String(sale.clientId) : "",
      quantity: sale.quantity,
      unitPrice: sale.unitPrice,
      costPrice: sale.costPrice,
      shippingCost: sale.shippingCost,
      notes: sale.notes ?? "",
      saleDate: sale.saleDate,
    });
    setEditOpen(true);
  };

  const handleEditSubmit = () => {
    if (!editingId) return;
    const body: UpdateSaleBody = {
      clientId: editForm.clientId ? Number(editForm.clientId) : null,
      quantity: Number(editForm.quantity),
      unitPrice: Number(editForm.unitPrice),
      costPrice: Number(editForm.costPrice),
      shippingCost: Number(editForm.shippingCost),
      notes: editForm.notes || null,
      saleDate: editForm.saleDate,
    };
    updateMutation.mutate(
      { id: editingId, data: body },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getListSalesQueryKey() });
          setEditOpen(false);
          setEditingId(null);
          toast({ title: "Venta actualizada correctamente" });
        },
        onError: () => toast({ title: "Error al actualizar venta", variant: "destructive" }),
      }
    );
  };

  const handleDelete = () => {
    if (!deleteId) return;
    deleteMutation.mutate(
      { id: deleteId },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getListSalesQueryKey() });
          setDeleteOpen(false);
          toast({ title: "Venta eliminada" });
        },
        onError: () => toast({ title: "Error al eliminar", variant: "destructive" }),
      }
    );
  };

  const totalMonthIncome = sales?.reduce((sum, s) => sum + s.totalAmount, 0) ?? 0;
  const totalMonthProfit = sales?.reduce((sum, s) => sum + s.netProfit, 0) ?? 0;

  const years = Array.from({ length: 5 }, (_, i) => String(now.getFullYear() - i));

  const products = form.productType === "perfumeria"
    ? (perfumery ?? []).map(p => ({ id: p.id, label: `${p.brand} ${p.name} ${p.ml}ml`, stock: p.stock, cost: Number(p.costPrice) }))
    : (sublimation ?? []).map(p => ({ id: p.id, label: p.name, stock: p.stock ?? null, cost: Number(p.costPrice) }));

  const isBajoStock = productStock !== null && productStock < Number(form.quantity);
  const isStockNegativo = productStock !== null && productStock <= 0;

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight flex items-center gap-3">
            <ShoppingCart className="h-8 w-8 text-primary" />
            Ventas
          </h1>
          <p className="text-muted-foreground mt-1">Registro y seguimiento de ventas</p>
        </div>
        <Button onClick={() => setFormOpen(true)} className="gap-2">
          <Plus className="h-4 w-4" /> Nueva Venta
        </Button>
      </div>

      <div className="flex flex-wrap gap-4 items-end">
        <div className="space-y-1">
          <Label className="text-xs text-muted-foreground">Mes</Label>
          <Select value={filterMonth} onValueChange={setFilterMonth}>
            <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
            <SelectContent>
              {MONTHS.map((m, i) => <SelectItem key={i} value={String(i + 1)}>{m}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <Label className="text-xs text-muted-foreground">Año</Label>
          <Select value={filterYear} onValueChange={setFilterYear}>
            <SelectTrigger className="w-28"><SelectValue /></SelectTrigger>
            <SelectContent>
              {years.map(y => <SelectItem key={y} value={y}>{y}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        {!isLoading && sales && sales.length > 0 && (
          <div className="flex gap-6 ml-2 p-3 rounded-lg bg-muted/50 border">
            <div className="text-sm">
              <span className="text-muted-foreground block text-xs">Total Ventas</span>
              <span className="font-semibold">{formatCurrency(totalMonthIncome)}</span>
            </div>
            <div className="text-sm">
              <span className="text-muted-foreground block text-xs">Ganancia Distribuible</span>
              <span className="font-semibold text-green-600 dark:text-green-400">{formatCurrency(totalMonthProfit)}</span>
            </div>
          </div>
        )}
      </div>

      {isLoading ? (
        <div className="space-y-3">{[1, 2, 3].map(i => <Skeleton key={i} className="h-16 w-full" />)}</div>
      ) : (
        <Card>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-muted/50">
                    <th className="text-left font-medium px-4 py-3">Fecha</th>
                    <th className="text-left font-medium px-4 py-3">Producto</th>
                    <th className="text-left font-medium px-4 py-3">Cliente</th>
                    <th className="text-center font-medium px-4 py-3">Tipo</th>
                    <th className="text-center font-medium px-4 py-3">Cant.</th>
                    <th className="text-right font-medium px-4 py-3">Precio Unit.</th>
                    <th className="text-right font-medium px-4 py-3">Costo</th>
                    <th className="text-right font-medium px-4 py-3">Envío</th>
                    <th className="text-right font-medium px-4 py-3">Total</th>
                    <th className="text-right font-medium px-4 py-3">Ganancia</th>
                    <th className="text-center font-medium px-4 py-3"></th>
                  </tr>
                </thead>
                <tbody>
                  {sales && sales.length > 0 ? sales.map(sale => (
                    <tr key={sale.id} className="border-b hover:bg-muted/30 transition-colors">
                      <td className="px-4 py-3 text-muted-foreground whitespace-nowrap">
                        {new Date(sale.saleDate + "T12:00:00").toLocaleDateString("es-HN")}
                      </td>
                      <td className="px-4 py-3 font-medium max-w-[180px] truncate">{sale.productName}</td>
                      <td className="px-4 py-3 text-muted-foreground">{sale.clientName ?? "General"}</td>
                      <td className="px-4 py-3 text-center">
                        <Badge variant={sale.productType === "perfumeria" ? "default" : "secondary"} className="text-xs">
                          {sale.productType === "perfumeria" ? "Perfumeria" : "Sublimacion"}
                        </Badge>
                      </td>
                      <td className="px-4 py-3 text-center">{sale.quantity}</td>
                      <td className="px-4 py-3 text-right">{formatCurrency(sale.unitPrice)}</td>
                      <td className="px-4 py-3 text-right text-muted-foreground text-xs">{formatCurrency(sale.costPrice)}</td>
                      <td className="px-4 py-3 text-right text-muted-foreground">
                        {sale.shippingCost > 0 ? formatCurrency(sale.shippingCost) : "—"}
                      </td>
                      <td className="px-4 py-3 text-right font-medium">{formatCurrency(sale.totalAmount)}</td>
                      <td className="px-4 py-3 text-right">
                        <span className={`font-medium flex items-center justify-end gap-1 ${sale.netProfit >= 0 ? 'text-green-600 dark:text-green-400' : 'text-destructive'}`}>
                          <TrendingUp className="h-3 w-3" />{formatCurrency(sale.netProfit)}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1">
                          <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-foreground"
                            onClick={() => openEdit(sale)}>
                            <Pencil className="h-3.5 w-3.5" />
                          </Button>
                          <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive hover:text-destructive"
                            onClick={() => { setDeleteId(sale.id); setDeleteOpen(true); }}>
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  )) : (
                    <tr>
                      <td colSpan={11} className="px-4 py-12 text-center text-muted-foreground">
                        No hay ventas en {MONTHS[Number(filterMonth) - 1]} {filterYear}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}

      {/* New Sale Dialog */}
      <Dialog open={formOpen} onOpenChange={setFormOpen}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Registrar Nueva Venta</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1">
                <Label>Tipo de Producto</Label>
                <Select value={form.productType} onValueChange={(v) => handleProductTypeChange(v as "perfumeria" | "sublimacion")}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="perfumeria">Perfumeria</SelectItem>
                    <SelectItem value="sublimacion">Sublimacion</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label>Fecha de Venta</Label>
                <Input type="date" value={form.saleDate} onChange={e => setForm({ ...form, saleDate: e.target.value })} />
              </div>
            </div>

            <div className="space-y-1">
              <Label>Producto</Label>
              <Select value={form.productId} onValueChange={handleProductChange}>
                <SelectTrigger><SelectValue placeholder="Seleccionar producto..." /></SelectTrigger>
                <SelectContent>
                  {products.map(p => (
                    <SelectItem key={p.id} value={String(p.id)}>
                      <span className="flex items-center gap-2">
                        {p.label}
                        {p.stock !== null && p.stock <= 0 && (
                          <span className="text-xs text-orange-500 font-medium">(stock: {p.stock})</span>
                        )}
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {form.productId && selectedProduct && (
                <div className={`flex items-center gap-2 text-xs px-2 py-1.5 rounded mt-1 ${
                  isStockNegativo
                    ? "bg-orange-500/10 text-orange-700 dark:text-orange-400 border border-orange-500/20"
                    : isBajoStock
                    ? "bg-yellow-500/10 text-yellow-700 dark:text-yellow-400 border border-yellow-500/20"
                    : "bg-muted/50 text-muted-foreground"
                }`}>
                  <Package className="h-3 w-3 shrink-0" />
                  {isStockNegativo
                    ? `Stock pendiente de reposición: ${productStock} unidades`
                    : isBajoStock
                    ? `Stock insuficiente (${productStock} disponibles) — se procesará como pedido`
                    : `Stock disponible: ${productStock ?? "sin límite"} unidades`}
                  {isBajoStock && <AlertCircle className="h-3 w-3 ml-auto shrink-0" />}
                </div>
              )}
            </div>

            <div className="space-y-1">
              <Label>Cliente (opcional)</Label>
              <Select value={form.clientId} onValueChange={(v) => setForm({ ...form, clientId: v === "_none" ? "" : v })}>
                <SelectTrigger><SelectValue placeholder="Cliente General" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="_none">Cliente General</SelectItem>
                  {clients?.map(c => <SelectItem key={c.id} value={String(c.id)}>{c.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1">
                <Label>Cantidad</Label>
                <Input type="number" min="1" value={form.quantity}
                  onChange={e => setForm({ ...form, quantity: Number(e.target.value) })} />
              </div>
              <div className="space-y-1">
                <Label>Precio de Venta (L.)</Label>
                <Input type="number" step="0.01" min="0" value={form.unitPrice}
                  onChange={e => setForm({ ...form, unitPrice: Number(e.target.value) })} />
              </div>
            </div>

            <div className="space-y-1">
              <Label className="flex items-center gap-1.5">
                <Truck className="h-3.5 w-3.5 text-muted-foreground" />
                Gasto de Envío / Flete (L.)
              </Label>
              <Input type="number" step="0.01" min="0" value={form.shippingCost}
                onChange={e => setForm({ ...form, shippingCost: Number(e.target.value) })}
                placeholder="0.00 — escribe el costo de envío si aplica" />
            </div>

            {form.productId && autoCostPrice > 0 && (
              <div className="flex items-center gap-2 text-xs px-3 py-2 rounded bg-blue-500/10 border border-blue-500/20 text-blue-700 dark:text-blue-400">
                <Package className="h-3.5 w-3.5 shrink-0" />
                Costo de inventario (automático): <span className="font-semibold ml-1">{formatCurrency(autoCostPrice)} / ud</span>
              </div>
            )}

            {form.productId && form.unitPrice > 0 && (
              <div className="rounded-lg border bg-muted/30 overflow-hidden">
                <div className="px-4 py-2 border-b bg-muted/50">
                  <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Resumen Financiero</p>
                </div>
                <div className="p-4 space-y-2.5">
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Total venta ({form.quantity} ud{Number(form.quantity) !== 1 ? "s" : ""}):</span>
                    <span className="font-semibold">{formatCurrency(totalAmount)}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="flex items-center gap-1.5 text-muted-foreground">
                      <span className="inline-block w-2 h-2 rounded-full bg-amber-500"></span>
                      Costo de inventario:
                    </span>
                    <span className="text-amber-600 dark:text-amber-400 font-medium">− {formatCurrency(fondoReposicion)}</span>
                  </div>
                  {shippingCost > 0 && (
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Gasto de envío:</span>
                      <span className="text-muted-foreground">− {formatCurrency(shippingCost)}</span>
                    </div>
                  )}
                  <div className="flex justify-between text-sm font-semibold border-t pt-2">
                    <span>Ganancia Bruta Distribuible:</span>
                    <span className={gananciaBruta >= 0 ? "text-green-600 dark:text-green-400" : "text-destructive"}>
                      {formatCurrency(gananciaBruta)}
                    </span>
                  </div>
                  {gananciaBruta > 0 && (
                    <div className="pt-2 border-t space-y-2">
                      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Distribución Profit First</p>
                      <div className="grid grid-cols-3 gap-2 text-center text-xs">
                        <div className="rounded-md p-2 bg-blue-500/10 border border-blue-500/20">
                          <p className="text-blue-600 dark:text-blue-400 font-semibold">Operación (50%)</p>
                          <p className="font-bold mt-1">{formatCurrency(pfOperacion)}</p>
                        </div>
                        <div className="rounded-md p-2 bg-purple-500/10 border border-purple-500/20">
                          <p className="text-purple-600 dark:text-purple-400 font-semibold">Dueño (40%)</p>
                          <p className="font-bold mt-1">{formatCurrency(pfDueno)}</p>
                        </div>
                        <div className="rounded-md p-2 bg-green-500/10 border border-green-500/20">
                          <p className="text-green-600 dark:text-green-400 font-semibold">Reserva (10%)</p>
                          <p className="font-bold mt-1">{formatCurrency(pfGanancia)}</p>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}

            <div className="space-y-1">
              <Label>Notas (opcional)</Label>
              <Input value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })}
                placeholder="Notas adicionales..." />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setFormOpen(false)}>Cancelar</Button>
            <Button onClick={handleSubmit} disabled={createMutation.isPending || !form.productId}>
              {isBajoStock ? "Registrar como Pedido" : "Registrar Venta"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Sale Dialog */}
      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Pencil className="h-4 w-4" /> Editar Venta
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1">
                <Label>Fecha de Venta</Label>
                <Input type="date" value={editForm.saleDate}
                  onChange={e => setEditForm({ ...editForm, saleDate: e.target.value })} />
              </div>
              <div className="space-y-1">
                <Label>Cantidad</Label>
                <Input type="number" min="1" value={editForm.quantity}
                  onChange={e => setEditForm({ ...editForm, quantity: Number(e.target.value) })} />
              </div>
            </div>

            <div className="space-y-1">
              <Label>Cliente (opcional)</Label>
              <Select
                value={editForm.clientId || "_none"}
                onValueChange={(v) => setEditForm({ ...editForm, clientId: v === "_none" ? "" : v })}
              >
                <SelectTrigger><SelectValue placeholder="Cliente General" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="_none">Cliente General</SelectItem>
                  {clients?.map(c => <SelectItem key={c.id} value={String(c.id)}>{c.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1">
                <Label>Precio de Venta (L.)</Label>
                <Input type="number" step="0.01" min="0" value={editForm.unitPrice}
                  onChange={e => setEditForm({ ...editForm, unitPrice: Number(e.target.value) })} />
              </div>
              <div className="space-y-1">
                <Label>Costo Inventario / ud (L.)</Label>
                <Input type="number" step="0.01" min="0" value={editForm.costPrice}
                  onChange={e => setEditForm({ ...editForm, costPrice: Number(e.target.value) })} />
              </div>
            </div>

            <div className="space-y-1">
              <Label className="flex items-center gap-1.5">
                <Truck className="h-3.5 w-3.5 text-muted-foreground" />
                Gasto de Envío / Flete (L.)
              </Label>
              <Input type="number" step="0.01" min="0" value={editForm.shippingCost}
                onChange={e => setEditForm({ ...editForm, shippingCost: Number(e.target.value) })} />
            </div>

            {/* Real-time financial preview for edit */}
            <div className="rounded-lg border bg-muted/30 overflow-hidden">
              <div className="px-4 py-2 border-b bg-muted/50">
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Resumen Actualizado</p>
              </div>
              <div className="p-4 space-y-2.5">
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Total venta ({editForm.quantity} ud{editForm.quantity !== 1 ? "s" : ""}):</span>
                  <span className="font-semibold">{formatCurrency(editTotal)}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="flex items-center gap-1.5 text-muted-foreground">
                    <span className="inline-block w-2 h-2 rounded-full bg-amber-500"></span>
                    Costo de inventario:
                  </span>
                  <span className="text-amber-600 dark:text-amber-400 font-medium">− {formatCurrency(editCostTotal)}</span>
                </div>
                {editShipping > 0 && (
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Gasto de envío:</span>
                    <span className="text-muted-foreground">− {formatCurrency(editShipping)}</span>
                  </div>
                )}
                <div className="flex justify-between text-sm font-semibold border-t pt-2">
                  <span>Ganancia Bruta Distribuible:</span>
                  <span className={editGanancia >= 0 ? "text-green-600 dark:text-green-400" : "text-destructive"}>
                    {formatCurrency(editGanancia)}
                  </span>
                </div>
                {editGanancia > 0 && (
                  <div className="pt-2 border-t space-y-2">
                    <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Distribución Profit First</p>
                    <div className="grid grid-cols-3 gap-2 text-center text-xs">
                      <div className="rounded-md p-2 bg-blue-500/10 border border-blue-500/20">
                        <p className="text-blue-600 dark:text-blue-400 font-semibold">Operación (50%)</p>
                        <p className="font-bold mt-1">{formatCurrency(editPfOp)}</p>
                      </div>
                      <div className="rounded-md p-2 bg-purple-500/10 border border-purple-500/20">
                        <p className="text-purple-600 dark:text-purple-400 font-semibold">Dueño (40%)</p>
                        <p className="font-bold mt-1">{formatCurrency(editPfDueno)}</p>
                      </div>
                      <div className="rounded-md p-2 bg-green-500/10 border border-green-500/20">
                        <p className="text-green-600 dark:text-green-400 font-semibold">Reserva (10%)</p>
                        <p className="font-bold mt-1">{formatCurrency(editPfGanancia)}</p>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>

            <div className="space-y-1">
              <Label>Notas (opcional)</Label>
              <Input value={editForm.notes} onChange={e => setEditForm({ ...editForm, notes: e.target.value })}
                placeholder="Notas adicionales..." />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditOpen(false)}>Cancelar</Button>
            <Button onClick={handleEditSubmit} disabled={updateMutation.isPending}>
              {updateMutation.isPending ? "Guardando..." : "Guardar Cambios"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Eliminar Venta</AlertDialogTitle>
            <AlertDialogDescription>Esta accion no se puede deshacer. La venta sera eliminada permanentemente.</AlertDialogDescription>
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
