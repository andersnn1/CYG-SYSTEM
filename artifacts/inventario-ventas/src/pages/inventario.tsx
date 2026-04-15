import { useState, useMemo } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  useListPerfumery,
  useCreatePerfumeryItem,
  useUpdatePerfumeryItem,
  useDeletePerfumeryItem,
  getListPerfumeryQueryKey,
  useListSublimationItems,
  useCreateSublimationItem,
  useUpdateSublimationItem,
  useDeleteSublimationItem,
  getListSublimationItemsQueryKey,
} from "@workspace/api-client-react";
import type {
  PerfumeryItem,
  SublimationItem,
  CreatePerfumeryItemBody,
  UpdatePerfumeryItemBody,
  CreateSublimationItemBody,
  UpdateSublimationItemBody,
} from "@workspace/api-client-react";
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
import { Plus, Pencil, Trash2, AlertTriangle, Package, Search, Droplets, Printer } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

type ItemSource = "perfumeria" | "sublimacion";
type FilterTab = "todos" | "perfumeria" | "sublimacion";

interface UnifiedItem {
  _source: ItemSource;
  _raw: PerfumeryItem | SublimationItem;
  id: number;
  name: string;
  code: string | null | undefined;
  description: string | null | undefined;
  stock: number | null;
  costPrice: number;
  salePrice: number;
  categoryLabel: string;
  detail: string;
}

type FormData = {
  source: ItemSource;
  name: string;
  brand: string;
  ml: number;
  stock: number;
  subCategory: string;
  itemType: "maquinaria" | "consumible";
  subStock: string;
  costPrice: number;
  salePrice: number;
  description: string;
  code: string;
};

const defaultForm: FormData = {
  source: "perfumeria",
  name: "",
  brand: "",
  ml: 100,
  stock: 0,
  subCategory: "",
  itemType: "consumible",
  subStock: "",
  costPrice: 0,
  salePrice: 0,
  description: "",
  code: "",
};

const CATEGORY_CONFIG: Record<ItemSource, { label: string; color: string; icon: typeof Package }> = {
  perfumeria: { label: "Perfumería", color: "bg-purple-100 text-purple-700 border-purple-200 dark:bg-purple-900/30 dark:text-purple-300 dark:border-purple-700", icon: Droplets },
  sublimacion: { label: "Sublimación", color: "bg-blue-100 text-blue-700 border-blue-200 dark:bg-blue-900/30 dark:text-blue-300 dark:border-blue-700", icon: Printer },
};

export default function Inventario() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const { data: perfumeryItems, isLoading: loadingPerf } = useListPerfumery();
  const { data: sublimationItems, isLoading: loadingSub } = useListSublimationItems();

  const createPerf = useCreatePerfumeryItem();
  const updatePerf = useUpdatePerfumeryItem();
  const deletePerf = useDeletePerfumeryItem();
  const createSub = useCreateSublimationItem();
  const updateSub = useUpdateSublimationItem();
  const deleteSub = useDeleteSublimationItem();

  const [tab, setTab] = useState<FilterTab>("todos");
  const [search, setSearch] = useState("");
  const [formOpen, setFormOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [editSource, setEditSource] = useState<ItemSource | null>(null);
  const [editId, setEditId] = useState<number | null>(null);
  const [deleteSource, setDeleteSource] = useState<ItemSource | null>(null);
  const [deleteId, setDeleteId] = useState<number | null>(null);
  const [form, setForm] = useState<FormData>(defaultForm);

  const isLoading = loadingPerf || loadingSub;

  const allItems = useMemo((): UnifiedItem[] => {
    const perf: UnifiedItem[] = (perfumeryItems ?? []).map(item => ({
      _source: "perfumeria",
      _raw: item,
      id: item.id,
      name: item.name,
      code: item.code,
      description: item.description,
      stock: item.stock,
      costPrice: item.costPrice,
      salePrice: item.salePrice,
      categoryLabel: "Perfumería",
      detail: `${item.brand} · ${item.ml}ml`,
    }));
    const sub: UnifiedItem[] = (sublimationItems ?? []).map(item => ({
      _source: "sublimacion",
      _raw: item,
      id: item.id,
      name: item.name,
      code: item.code,
      description: item.description,
      stock: item.stock ?? null,
      costPrice: item.costPrice,
      salePrice: item.salePrice,
      categoryLabel: "Sublimación",
      detail: item.category ? `${item.category} · ${item.itemType}` : item.itemType,
    }));
    return [...perf, ...sub].sort((a, b) => a.name.localeCompare(b.name, "es"));
  }, [perfumeryItems, sublimationItems]);

  const filtered = useMemo(() => {
    let items = allItems;
    if (tab === "perfumeria") items = items.filter(i => i._source === "perfumeria");
    else if (tab === "sublimacion") items = items.filter(i => i._source === "sublimacion");
    if (search.trim()) {
      const q = search.toLowerCase();
      items = items.filter(i =>
        i.name.toLowerCase().includes(q) ||
        (i.code ?? "").toLowerCase().includes(q) ||
        i.detail.toLowerCase().includes(q)
      );
    }
    return items;
  }, [allItems, tab, search]);

  const invalidateAll = () => {
    queryClient.invalidateQueries({ queryKey: getListPerfumeryQueryKey() });
    queryClient.invalidateQueries({ queryKey: getListSublimationItemsQueryKey() });
  };

  const openCreate = () => {
    setEditSource(null);
    setEditId(null);
    setForm(defaultForm);
    setFormOpen(true);
  };

  const openEdit = (item: UnifiedItem) => {
    setEditSource(item._source);
    setEditId(item.id);
    if (item._source === "perfumeria") {
      const p = item._raw as PerfumeryItem;
      setForm({
        ...defaultForm,
        source: "perfumeria",
        name: p.name,
        brand: p.brand,
        ml: p.ml,
        stock: p.stock,
        costPrice: p.costPrice,
        salePrice: p.salePrice,
        description: p.description ?? "",
        code: p.code ?? "",
      });
    } else {
      const s = item._raw as SublimationItem;
      setForm({
        ...defaultForm,
        source: "sublimacion",
        name: s.name,
        subCategory: s.category,
        itemType: s.itemType as "maquinaria" | "consumible",
        subStock: s.stock !== null && s.stock !== undefined ? String(s.stock) : "",
        costPrice: s.costPrice,
        salePrice: s.salePrice,
        description: s.description ?? "",
        code: s.code ?? "",
      });
    }
    setFormOpen(true);
  };

  const openDelete = (item: UnifiedItem) => {
    setDeleteSource(item._source);
    setDeleteId(item.id);
    setDeleteOpen(true);
  };

  const handleSubmit = () => {
    const isEditing = editSource !== null && editId !== null;
    const actualSource = isEditing ? editSource : form.source;

    if (actualSource === "perfumeria") {
      const body: CreatePerfumeryItemBody = {
        name: form.name,
        brand: form.brand,
        ml: Number(form.ml),
        stock: Number(form.stock),
        costPrice: Number(form.costPrice),
        salePrice: Number(form.salePrice),
        description: form.description || undefined,
        code: form.code || undefined,
      };
      if (isEditing) {
        updatePerf.mutate({ id: editId!, data: body as UpdatePerfumeryItemBody }, {
          onSuccess: () => { invalidateAll(); setFormOpen(false); toast({ title: "Producto actualizado" }); },
          onError: () => toast({ title: "Error al actualizar", variant: "destructive" }),
        });
      } else {
        createPerf.mutate({ data: body }, {
          onSuccess: () => { invalidateAll(); setFormOpen(false); toast({ title: "Producto creado" }); },
          onError: () => toast({ title: "Error al crear", variant: "destructive" }),
        });
      }
    } else {
      const body: CreateSublimationItemBody = {
        name: form.name,
        category: form.subCategory,
        itemType: form.itemType,
        stock: form.subStock !== "" ? Number(form.subStock) : null,
        costPrice: Number(form.costPrice),
        salePrice: Number(form.salePrice),
        description: form.description || undefined,
        code: form.code || undefined,
      };
      if (isEditing) {
        updateSub.mutate({ id: editId!, data: body as UpdateSublimationItemBody }, {
          onSuccess: () => { invalidateAll(); setFormOpen(false); toast({ title: "Producto actualizado" }); },
          onError: () => toast({ title: "Error al actualizar", variant: "destructive" }),
        });
      } else {
        createSub.mutate({ data: body }, {
          onSuccess: () => { invalidateAll(); setFormOpen(false); toast({ title: "Producto creado" }); },
          onError: () => toast({ title: "Error al crear", variant: "destructive" }),
        });
      }
    }
  };

  const handleDelete = () => {
    if (!deleteId || !deleteSource) return;
    if (deleteSource === "perfumeria") {
      deletePerf.mutate({ id: deleteId }, {
        onSuccess: () => { invalidateAll(); setDeleteOpen(false); toast({ title: "Producto eliminado" }); },
        onError: () => toast({ title: "Error al eliminar", variant: "destructive" }),
      });
    } else {
      deleteSub.mutate({ id: deleteId }, {
        onSuccess: () => { invalidateAll(); setDeleteOpen(false); toast({ title: "Producto eliminado" }); },
        onError: () => toast({ title: "Error al eliminar", variant: "destructive" }),
      });
    }
  };

  const margin = form.salePrice && form.costPrice
    ? (((Number(form.salePrice) - Number(form.costPrice)) / Number(form.salePrice)) * 100).toFixed(1)
    : "0";

  const isEditing = editSource !== null;
  const isPending = createPerf.isPending || updatePerf.isPending || createSub.isPending || updateSub.isPending;

  const tabs: { key: FilterTab; label: string; count: number }[] = [
    { key: "todos", label: "Todos", count: allItems.length },
    { key: "perfumeria", label: "Perfumería", count: (perfumeryItems ?? []).length },
    { key: "sublimacion", label: "Sublimación", count: (sublimationItems ?? []).length },
  ];

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
      {/* Header */}
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight flex items-center gap-2">
            <Package className="h-6 w-6 sm:h-8 sm:w-8 text-primary flex-shrink-0" />
            Inventario
          </h1>
          <p className="text-muted-foreground mt-1 text-sm sm:text-base">Gestión unificada de productos y materiales</p>
        </div>
        <Button onClick={openCreate} className="gap-2 flex-shrink-0 h-11">
          <Plus className="h-4 w-4" />
          <span className="hidden sm:inline">Nuevo Producto</span>
        </Button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-3">
        <div className="rounded-xl border bg-card p-3 text-center">
          <p className="text-2xl font-bold">{allItems.length}</p>
          <p className="text-xs text-muted-foreground mt-0.5">Total productos</p>
        </div>
        <div className="rounded-xl border bg-purple-50 dark:bg-purple-900/20 border-purple-200 dark:border-purple-800/50 p-3 text-center">
          <p className="text-2xl font-bold text-purple-700 dark:text-purple-300">{(perfumeryItems ?? []).length}</p>
          <p className="text-xs text-purple-600 dark:text-purple-400 mt-0.5">Perfumería</p>
        </div>
        <div className="rounded-xl border bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-800/50 p-3 text-center">
          <p className="text-2xl font-bold text-blue-700 dark:text-blue-300">{(sublimationItems ?? []).length}</p>
          <p className="text-xs text-blue-600 dark:text-blue-400 mt-0.5">Sublimación</p>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="flex gap-1 bg-muted rounded-xl p-1 flex-shrink-0">
          {tabs.map(t => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                tab === t.key
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {t.label}
              <span className={`text-xs rounded-full px-1.5 py-0 min-w-[20px] text-center ${
                tab === t.key ? "bg-primary text-primary-foreground" : "bg-muted-foreground/20 text-muted-foreground"
              }`}>{t.count}</span>
            </button>
          ))}
        </div>
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Buscar por nombre, código..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
      </div>

      {/* Table / Cards */}
      {isLoading ? (
        <div className="space-y-3">
          {[1, 2, 3, 4, 5].map(i => <Skeleton key={i} className="h-16 w-full" />)}
        </div>
      ) : (
        <>
          {/* Desktop Table */}
          <div className="hidden sm:block">
            <Card>
              <CardContent className="p-0">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b bg-muted/50">
                        <th className="text-left font-medium px-4 py-3 w-28">Código</th>
                        <th className="text-left font-medium px-4 py-3">Producto</th>
                        <th className="text-left font-medium px-4 py-3">Categoría</th>
                        <th className="text-left font-medium px-4 py-3">Detalle</th>
                        <th className="text-center font-medium px-4 py-3">Stock</th>
                        <th className="text-right font-medium px-4 py-3">Costo</th>
                        <th className="text-right font-medium px-4 py-3">Venta</th>
                        <th className="text-right font-medium px-4 py-3">Margen</th>
                        <th className="text-center font-medium px-4 py-3">Acciones</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filtered.length > 0 ? filtered.map(item => {
                        const cfg = CATEGORY_CONFIG[item._source];
                        const isLowStock = item.stock !== null && item.stock !== undefined && item.stock < 5;
                        const marginPct = item.salePrice > 0
                          ? (((item.salePrice - item.costPrice) / item.salePrice) * 100).toFixed(1)
                          : "0";
                        const CatIcon = cfg.icon;
                        return (
                          <tr key={`${item._source}-${item.id}`} className="border-b hover:bg-muted/30 transition-colors">
                            <td className="px-4 py-3">
                              {item.code
                                ? <Badge variant="secondary" className="font-mono text-xs">{item.code}</Badge>
                                : <span className="text-xs text-muted-foreground">—</span>}
                            </td>
                            <td className="px-4 py-3">
                              <div className="font-medium">{item.name}</div>
                              {item.description && <div className="text-xs text-muted-foreground">{item.description}</div>}
                            </td>
                            <td className="px-4 py-3">
                              <span className={`inline-flex items-center gap-1 text-xs font-medium px-2 py-1 rounded-full border ${cfg.color}`}>
                                <CatIcon className="h-3 w-3" />
                                {cfg.label}
                              </span>
                            </td>
                            <td className="px-4 py-3 text-sm text-muted-foreground">{item.detail}</td>
                            <td className="px-4 py-3 text-center">
                              {item.stock === null ? (
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
                            <td className="px-4 py-3 text-right">
                              <span className="text-green-600 dark:text-green-400 font-medium">{marginPct}%</span>
                            </td>
                            <td className="px-4 py-3">
                              <div className="flex justify-center gap-2">
                                <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openEdit(item)}>
                                  <Pencil className="h-4 w-4" />
                                </Button>
                                <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive hover:text-destructive" onClick={() => openDelete(item)}>
                                  <Trash2 className="h-4 w-4" />
                                </Button>
                              </div>
                            </td>
                          </tr>
                        );
                      }) : (
                        <tr>
                          <td colSpan={9} className="px-4 py-12 text-center text-muted-foreground">
                            {search ? "No se encontraron productos con ese criterio de búsqueda." : "No hay productos registrados. Crea el primero."}
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Mobile Cards */}
          <div className="sm:hidden space-y-3">
            {filtered.length > 0 ? filtered.map(item => {
              const cfg = CATEGORY_CONFIG[item._source];
              const isLowStock = item.stock !== null && item.stock !== undefined && item.stock < 5;
              const marginPct = item.salePrice > 0
                ? (((item.salePrice - item.costPrice) / item.salePrice) * 100).toFixed(1)
                : "0";
              const CatIcon = cfg.icon;
              return (
                <div key={`${item._source}-${item.id}`} className="bg-card border border-border rounded-xl p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap mb-1">
                        <span className="font-semibold text-base truncate">{item.name}</span>
                        {item.code && (
                          <Badge variant="secondary" className="font-mono text-xs flex-shrink-0">{item.code}</Badge>
                        )}
                      </div>
                      <span className={`inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full border ${cfg.color}`}>
                        <CatIcon className="h-3 w-3" />
                        {cfg.label}
                      </span>
                      <p className="text-xs text-muted-foreground mt-1">{item.detail}</p>
                      {item.description && (
                        <p className="text-xs text-muted-foreground mt-0.5 truncate">{item.description}</p>
                      )}
                    </div>
                    <div className="flex gap-1 flex-shrink-0">
                      <Button variant="ghost" size="icon" className="h-11 w-11" onClick={() => openEdit(item)}>
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button variant="ghost" size="icon" className="h-11 w-11 text-destructive hover:text-destructive" onClick={() => openDelete(item)}>
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                  <div className="mt-3 grid grid-cols-3 gap-2 text-sm">
                    <div className="bg-muted/50 rounded-lg p-2 text-center">
                      <div className="text-xs text-muted-foreground mb-1">Stock</div>
                      {item.stock === null ? (
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
                      <span className="font-semibold text-foreground">{formatCurrency(item.salePrice)}</span>
                    </div>
                    <div className="bg-muted/50 rounded-lg p-2 text-center">
                      <div className="text-xs text-muted-foreground mb-1">Margen</div>
                      <span className="font-semibold text-green-600 dark:text-green-400">{marginPct}%</span>
                    </div>
                  </div>
                </div>
              );
            }) : (
              <div className="bg-card border border-border rounded-xl py-12 text-center text-muted-foreground">
                {search ? "No se encontraron productos con ese criterio." : "No hay productos. Crea el primero."}
              </div>
            )}
          </div>
        </>
      )}

      {/* Form Dialog */}
      <Dialog open={formOpen} onOpenChange={setFormOpen}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{isEditing ? "Editar Producto" : "Nuevo Producto"}</DialogTitle>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-4">
            {/* Category selector — only show when creating */}
            {!isEditing && (
              <div className="col-span-2 space-y-1">
                <Label>Categoría *</Label>
                <Select
                  value={form.source}
                  onValueChange={(v) => setForm({ ...defaultForm, source: v as ItemSource })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Seleccionar categoría" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="perfumeria">
                      <span className="flex items-center gap-2"><Droplets className="h-4 w-4 text-purple-500" /> Perfumería</span>
                    </SelectItem>
                    <SelectItem value="sublimacion">
                      <span className="flex items-center gap-2"><Printer className="h-4 w-4 text-blue-500" /> Sublimación</span>
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>
            )}

            {/* Category badge when editing */}
            {isEditing && editSource && (
              <div className="col-span-2">
                <span className={`inline-flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-full border ${CATEGORY_CONFIG[editSource].color}`}>
                  {editSource === "perfumeria" ? <Droplets className="h-3.5 w-3.5" /> : <Printer className="h-3.5 w-3.5" />}
                  {CATEGORY_CONFIG[editSource].label}
                </span>
              </div>
            )}

            {/* Shared: Name */}
            <div className="col-span-2 space-y-1">
              <Label>Nombre del Producto *</Label>
              <Input
                value={form.name}
                onChange={e => setForm({ ...form, name: e.target.value })}
                placeholder={form.source === "perfumeria" ? "Polo Blue, One Million..." : "Camiseta, Mug, Plancha..."}
              />
            </div>

            {/* Perfumería specific fields */}
            {(form.source === "perfumeria" || editSource === "perfumeria") && (
              <>
                <div className="space-y-1">
                  <Label>Marca *</Label>
                  <Input value={form.brand} onChange={e => setForm({ ...form, brand: e.target.value })} placeholder="Ralph Lauren, Paco Rabanne..." />
                </div>
                <div className="space-y-1">
                  <Label>Mililitros (ml) *</Label>
                  <Input type="number" value={form.ml} onChange={e => setForm({ ...form, ml: Number(e.target.value) })} placeholder="100" />
                </div>
                <div className="space-y-1">
                  <Label>Stock</Label>
                  <Input type="number" value={form.stock} onChange={e => setForm({ ...form, stock: Number(e.target.value) })} placeholder="0" />
                </div>
              </>
            )}

            {/* Sublimación specific fields */}
            {(form.source === "sublimacion" || editSource === "sublimacion") && (
              <>
                <div className="space-y-1">
                  <Label>Sub-categoría</Label>
                  <Input value={form.subCategory} onChange={e => setForm({ ...form, subCategory: e.target.value })} placeholder="Consumibles, Maquinaria..." />
                </div>
                <div className="space-y-1">
                  <Label>Tipo *</Label>
                  <Select value={form.itemType} onValueChange={(v) => setForm({ ...form, itemType: v as "maquinaria" | "consumible" })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="consumible">Consumible</SelectItem>
                      <SelectItem value="maquinaria">Maquinaria</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label>Stock (dejar vacío si N/A)</Label>
                  <Input type="number" value={form.subStock} onChange={e => setForm({ ...form, subStock: e.target.value })} placeholder="—" />
                </div>
              </>
            )}

            {/* Shared: Prices */}
            <div className="space-y-1">
              <Label>Precio de Costo (L.) *</Label>
              <Input type="number" step="0.01" value={form.costPrice} onChange={e => setForm({ ...form, costPrice: Number(e.target.value) })} placeholder="0.00" />
            </div>
            <div className="space-y-1">
              <Label>Precio de Venta (L.) *</Label>
              <Input type="number" step="0.01" value={form.salePrice} onChange={e => setForm({ ...form, salePrice: Number(e.target.value) })} placeholder="0.00" />
            </div>

            {/* Margin indicator */}
            <div className="col-span-2">
              <p className="text-sm text-muted-foreground">
                Margen: <span className="font-medium text-green-600">{margin}%</span>
                {form.salePrice > 0 && form.costPrice > 0 && (
                  <span className="ml-2">| Ganancia/ud: <span className="font-medium">{formatCurrency(Number(form.salePrice) - Number(form.costPrice))}</span></span>
                )}
              </p>
            </div>

            {/* Shared: Code & Description */}
            <div className="space-y-1">
              <Label>Código (opcional)</Label>
              <Input value={form.code} onChange={e => setForm({ ...form, code: e.target.value })} placeholder="Ej: PERF-001" />
            </div>
            <div className="space-y-1">
              <Label>Descripción (opcional)</Label>
              <Input value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} placeholder="Notas adicionales..." />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setFormOpen(false)}>Cancelar</Button>
            <Button onClick={handleSubmit} disabled={isPending}>
              {isEditing ? "Guardar Cambios" : "Crear Producto"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Dialog */}
      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Eliminar Producto</AlertDialogTitle>
            <AlertDialogDescription>Esta acción no se puede deshacer. El producto será eliminado permanentemente.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Eliminar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
