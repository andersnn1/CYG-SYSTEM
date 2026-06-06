import { useState, useMemo, useEffect, useCallback } from "react";
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
import { Plus, Pencil, Trash2, AlertTriangle, Package, Search, Droplets, Printer, Settings, Tag, X, Upload, Download } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import Papa from "papaparse";

type ItemSource = "perfumeria" | "sublimacion" | "custom";
type FilterTab = "todos" | "perfumeria" | "sublimacion" | string; // string allows custom category IDs

// ── Custom inventory types ──────────────────────────────────────────────────
interface InventoryCategory { id: number; name: string; color: string; description?: string | null; createdAt: string; }
interface CustomItem { id: number; categoryId: number; categoryName: string; categoryColor: string; name: string; subCategory?: string|null; brand?: string|null; stock?: number|null; costPrice: number; salePrice: number; description?: string|null; code?: string|null; createdAt: string; updatedAt: string; }

const API_BASE = "/api";
async function apiFetch(path: string, opts?: RequestInit) {
  const res = await fetch(`${API_BASE}${path}`, { headers: { "Content-Type": "application/json" }, ...opts });
  if (res.status === 204) return null;
  let data: any;
  try { data = await res.json(); } catch { data = {}; }
  if (!res.ok) throw new Error(data?.error || `HTTP ${res.status}`);
  return data;
}

// Color map for category badges
const COLOR_MAP: Record<string, string> = {
  slate:  "bg-slate-100 text-slate-700 border-slate-200 dark:bg-slate-800/40 dark:text-slate-300 dark:border-slate-700",
  green:  "bg-green-100 text-green-700 border-green-200 dark:bg-green-900/30 dark:text-green-300 dark:border-green-700",
  orange: "bg-orange-100 text-orange-700 border-orange-200 dark:bg-orange-900/30 dark:text-orange-300 dark:border-orange-700",
  cyan:   "bg-cyan-100 text-cyan-700 border-cyan-200 dark:bg-cyan-900/30 dark:text-cyan-300 dark:border-cyan-700",
  rose:   "bg-rose-100 text-rose-700 border-rose-200 dark:bg-rose-900/30 dark:text-rose-300 dark:border-rose-700",
  amber:  "bg-amber-100 text-amber-700 border-amber-200 dark:bg-amber-900/30 dark:text-amber-300 dark:border-amber-700",
  indigo: "bg-indigo-100 text-indigo-700 border-indigo-200 dark:bg-indigo-900/30 dark:text-indigo-300 dark:border-indigo-700",
  teal:   "bg-teal-100 text-teal-700 border-teal-200 dark:bg-teal-900/30 dark:text-teal-300 dark:border-teal-700",
};
const COLORS = Object.keys(COLOR_MAP);
const colorClass = (c: string) => COLOR_MAP[c] ?? COLOR_MAP["slate"];

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
  // custom category fields
  customCategoryId: number | null;
  customBrand: string;
  customSubCategory: string;
  customStock: string;
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
  customCategoryId: null,
  customBrand: "",
  customSubCategory: "",
  customStock: "",
};

const CATEGORY_CONFIG: Record<string, { label: string; color: string; icon: typeof Package }> = {
  perfumeria: { label: "Perfumería", color: "bg-purple-100 text-purple-700 border-purple-200 dark:bg-purple-900/30 dark:text-purple-300 dark:border-purple-700", icon: Droplets },
  sublimacion: { label: "Sublimación", color: "bg-blue-100 text-blue-700 border-blue-200 dark:bg-blue-900/30 dark:text-blue-300 dark:border-blue-700", icon: Printer },
  custom: { label: "Personalizado", color: "bg-slate-100 text-slate-700 border-slate-200 dark:bg-slate-800/40 dark:text-slate-300", icon: Tag },
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

  // CSV Import State
  const [importOpen, setImportOpen] = useState(false);
  const [importLoading, setImportLoading] = useState(false);
  const [importFile, setImportFile] = useState<File | null>(null);

  // ─ Custom inventory state ────────────────────────────────────────────
  const [categories, setCategories] = useState<InventoryCategory[]>([]);
  const [customItems, setCustomItems] = useState<CustomItem[]>([]);
  const [catOpen, setCatOpen] = useState(false);
  const [catForm, setCatForm] = useState({ name: "", color: "slate", description: "" });
  const [catSubmitting, setCatSubmitting] = useState(false);
  const [catDeleteId, setCatDeleteId] = useState<number | null>(null);
  const [catDeleteOpen, setCatDeleteOpen] = useState(false);

  const loadCustom = useCallback(async () => {
    try {
      const cats = await apiFetch("/inventory-categories").catch(err => {
        console.error("Error loading categories:", err);
        return [];
      });
      const items = await apiFetch("/custom-inventory").catch(err => {
        console.error("Error loading custom inventory:", err);
        return [];
      });
      setCategories(Array.isArray(cats) ? cats : []);
      setCustomItems(Array.isArray(items) ? items : []);
    } catch (e) {
      console.error("Error in loadCustom:", e);
    }
  }, []);

  useEffect(() => { loadCustom(); }, [loadCustom]);

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
    const cust: UnifiedItem[] = customItems.map(item => ({
      _source: "custom" as ItemSource,
      _raw: item as any,
      id: item.id,
      name: item.name,
      code: item.code,
      description: item.description,
      stock: item.stock ?? null,
      costPrice: item.costPrice,
      salePrice: item.salePrice,
      categoryLabel: item.categoryName,
      detail: [item.brand, item.subCategory].filter(Boolean).join(" · ") || item.categoryName,
    }));
    return [...perf, ...sub, ...cust].sort((a, b) => a.name.localeCompare(b.name, "es"));
  }, [perfumeryItems, sublimationItems, customItems]);

  const filtered = useMemo(() => {
    let items = allItems;
    if (tab === "perfumeria") items = items.filter(i => i._source === "perfumeria");
    else if (tab === "sublimacion") items = items.filter(i => i._source === "sublimacion");
    else if (tab !== "todos") {
      // Custom category tab: tab is "cat-{id}"
      const catId = tab.startsWith("cat-") ? Number(tab.replace("cat-", "")) : null;
      if (catId) items = items.filter(i => {
        const raw = i._raw as any;
        return i._source === "custom" && raw.categoryId === catId;
      });
    }
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
    loadCustom();
  };

  const openCreate = () => {
    setEditSource(null);
    setEditId(null);
    setForm(defaultForm);
    setFormOpen(true);
  };

  useEffect(() => {
    (window as any).__openNewProduct = openCreate;
    return () => {
      delete (window as any).__openNewProduct;
    };
  }, []);

  const handleExportCsv = () => {
    window.location.href = `${API_BASE}/inventory/export-csv`;
  };

  const handleImportSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!importFile) {
      toast({ title: "Atención", description: "Selecciona un archivo CSV.", variant: "destructive" });
      return;
    }
    setImportLoading(true);
    Papa.parse(importFile, {
      header: true,
      skipEmptyLines: true,
      complete: async (results) => {
        try {
          const res = await apiFetch("/inventory/import-csv", {
            method: "POST",
            body: JSON.stringify({ rows: results.data }),
          });
          invalidateAll();
          setImportOpen(false);
          setImportFile(null);
          
          let desc = `Insertados: ${res.inserted}. Actualizados: ${res.updated}.`;
          if (res.skipped > 0) desc += ` Omitidos: ${res.skipped}.`;
          
          toast({ 
            title: "Importación completada", 
            description: desc 
          });

          if (res.errors && res.errors.length > 0) {
            console.error("Errores de importación:", res.errors);
            toast({
              title: "Advertencia",
              description: `Hubo ${res.errors.length} advertencias. Revisa la consola para detalles.`,
              variant: "destructive"
            });
          }
        } catch (err: any) {
          toast({ title: "Error en importación", description: err.message, variant: "destructive" });
        } finally {
          setImportLoading(false);
        }
      },
      error: (error) => {
        setImportLoading(false);
        toast({ title: "Error al leer archivo", description: error.message, variant: "destructive" });
      }
    });
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
    } else if (item._source === "sublimacion") {
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
    } else if (item._source === "custom") {
      const c = item._raw as unknown as CustomItem;
      setForm({
        ...defaultForm,
        source: "custom",
        name: c.name,
        customCategoryId: c.categoryId,
        customBrand: c.brand ?? "",
        customSubCategory: c.subCategory ?? "",
        customStock: c.stock !== null && c.stock !== undefined ? String(c.stock) : "",
        costPrice: c.costPrice,
        salePrice: c.salePrice,
        description: c.description ?? "",
        code: c.code ?? "",
      });
    }
    setFormOpen(true);
  };

  const openDelete = (item: UnifiedItem) => {
    setDeleteSource(item._source);
    setDeleteId(item.id);
    setDeleteOpen(true);
  };

  const handleSubmit = async () => {
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
    } else if (actualSource === "sublimacion") {
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
    } else if (actualSource === "custom") {
      if (!form.customCategoryId) { toast({ title: "Selecciona una categoría", variant: "destructive" }); return; }
      const body = {
        categoryId: form.customCategoryId,
        name: form.name,
        brand: form.customBrand || undefined,
        subCategory: form.customSubCategory || undefined,
        stock: form.customStock !== "" ? Number(form.customStock) : null,
        costPrice: Number(form.costPrice),
        salePrice: Number(form.salePrice),
        description: form.description || undefined,
        code: form.code || undefined,
      };
      try {
        if (isEditing) {
          await apiFetch(`/custom-inventory/${editId}`, { method: "PATCH", body: JSON.stringify(body) });
          toast({ title: "Producto actualizado" });
        } else {
          await apiFetch("/custom-inventory", { method: "POST", body: JSON.stringify(body) });
          toast({ title: "Producto creado" });
        }
        invalidateAll(); setFormOpen(false);
      } catch (e: any) { toast({ title: "Error", description: e.message, variant: "destructive" }); }
    }
  };

  const handleDelete = async () => {
    if (!deleteId || !deleteSource) return;
    if (deleteSource === "perfumeria") {
      deletePerf.mutate({ id: deleteId }, {
        onSuccess: () => { invalidateAll(); setDeleteOpen(false); toast({ title: "Producto eliminado" }); },
        onError: () => toast({ title: "Error al eliminar", variant: "destructive" }),
      });
    } else if (deleteSource === "sublimacion") {
      deleteSub.mutate({ id: deleteId }, {
        onSuccess: () => { invalidateAll(); setDeleteOpen(false); toast({ title: "Producto eliminado" }); },
        onError: () => toast({ title: "Error al eliminar", variant: "destructive" }),
      });
    } else if (deleteSource === "custom") {
      try {
        await apiFetch(`/custom-inventory/${deleteId}`, { method: "DELETE" });
        invalidateAll(); setDeleteOpen(false); toast({ title: "Producto eliminado" });
      } catch (e: any) { toast({ title: "Error al eliminar", description: e.message, variant: "destructive" }); }
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
    ...categories.map(cat => ({
      key: `cat-${cat.id}`,
      label: cat.name,
      count: customItems.filter(i => i.categoryId === cat.id).length,
    })),
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
        <div className="flex items-center gap-2">
          <Button variant="outline" size="icon" onClick={handleExportCsv} className="h-11 w-11 shrink-0" title="Exportar CSV">
            <Download className="h-4 w-4" />
          </Button>
          <Button variant="outline" size="icon" onClick={() => setImportOpen(true)} className="h-11 w-11 shrink-0" title="Importar CSV">
            <Upload className="h-4 w-4" />
          </Button>
          <Button variant="outline" onClick={() => setCatOpen(true)} className="gap-2 flex-shrink-0 h-11" title="Gestionar categorías personalizadas">
            <Settings className="h-4 w-4" />
            <span className="hidden sm:inline">Categorías</span>
          </Button>
          <Button onClick={openCreate} className="gap-2 flex-shrink-0 h-11">
            <Plus className="h-4 w-4" />
            <span className="hidden sm:inline">Nuevo Producto</span>
          </Button>
        </div>
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
                    {categories.length > 0 && categories.map(cat => (
                      <SelectItem key={cat.id} value="custom" onClick={() => setForm(f => ({ ...f, customCategoryId: cat.id }))}>
                        <span className="flex items-center gap-2"><Tag className="h-4 w-4" /> {cat.name}</span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {/* Sub-select for custom category when source=custom */}
                {form.source === "custom" && categories.length > 0 && (
                  <Select
                    value={form.customCategoryId ? String(form.customCategoryId) : ""}
                    onValueChange={(v) => setForm(f => ({ ...f, customCategoryId: Number(v) }))}
                  >
                    <SelectTrigger className="mt-1">
                      <SelectValue placeholder="Seleccionar categoría personalizada" />
                    </SelectTrigger>
                    <SelectContent>
                      {categories.map(cat => (
                        <SelectItem key={cat.id} value={String(cat.id)}>{cat.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
                {form.source === "custom" && categories.length === 0 && (
                  <p className="text-xs text-amber-600 mt-1">Primero crea una categoría con el botón "Categorías".</p>
                )}
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

            {/* Custom category specific fields */}
            {(form.source === "custom" || editSource === "custom") && (
              <>
                <div className="space-y-1">
                  <Label>Marca (opcional)</Label>
                  <Input value={form.customBrand} onChange={e => setForm({ ...form, customBrand: e.target.value })} placeholder="Samsung, HP, Dell..." />
                </div>
                <div className="space-y-1">
                  <Label>Sub-categoría (opcional)</Label>
                  <Input value={form.customSubCategory} onChange={e => setForm({ ...form, customSubCategory: e.target.value })} placeholder="Laptops, Accesorios..." />
                </div>
                <div className="space-y-1">
                  <Label>Stock (vacío = N/A)</Label>
                  <Input type="number" value={form.customStock} onChange={e => setForm({ ...form, customStock: e.target.value })} placeholder="—" />
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

      {/* Category Management Dialog */}
      <Dialog open={catOpen} onOpenChange={setCatOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><Tag className="h-5 w-5" /> Gestionar Categorías Personalizadas</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            {/* Existing categories */}
            <div className="space-y-2">
              {categories.length === 0 && <p className="text-sm text-muted-foreground text-center py-4">No hay categorías personalizadas aún.</p>}
              {categories.map(cat => (
                <div key={cat.id} className={`flex items-center justify-between px-3 py-2 rounded-lg border text-sm ${colorClass(cat.color)}`}>
                  <div className="flex items-center gap-2">
                    <span className={`w-2.5 h-2.5 rounded-full bg-current opacity-60`} />
                    <span className="font-medium">{cat.name}</span>
                    {cat.description && <span className="opacity-60 text-xs">· {cat.description}</span>}
                    <span className="opacity-50 text-xs">{customItems.filter(i => i.categoryId === cat.id).length} prods.</span>
                  </div>
                  <Button
                    variant="ghost" size="icon" className="h-7 w-7 text-destructive hover:text-destructive"
                    onClick={() => { setCatDeleteId(cat.id); setCatDeleteOpen(true); }}
                    title="Eliminar categoría"
                  >
                    <X className="h-3.5 w-3.5" />
                  </Button>
                </div>
              ))}
            </div>
            {/* New category form */}
            <div className="border-t pt-3 space-y-3">
              <p className="text-sm font-medium">Nueva categoría</p>
              <Input
                placeholder="Nombre (ej: Tecnología)*"
                value={catForm.name}
                onChange={e => setCatForm(f => ({ ...f, name: e.target.value }))}
              />
              <Input
                placeholder="Descripción (opcional)"
                value={catForm.description}
                onChange={e => setCatForm(f => ({ ...f, description: e.target.value }))}
              />
              <div className="space-y-1">
                <p className="text-xs text-muted-foreground">Color del badge:</p>
                <div className="flex gap-2 flex-wrap">
                  {COLORS.map(c => (
                    <button
                      key={c}
                      onClick={() => setCatForm(f => ({ ...f, color: c }))}
                      className={`w-7 h-7 rounded-full border-2 transition-transform ${colorClass(c)} ${catForm.color === c ? "border-foreground scale-110" : "border-transparent"}`}
                      title={c}
                    />
                  ))}
                </div>
              </div>
              <Button
                className="w-full"
                disabled={catSubmitting || !catForm.name.trim()}
                onClick={async () => {
                  const categoryName = catForm.name.trim();
                  setCatSubmitting(true);
                  try {
                    await apiFetch("/inventory-categories", { method: "POST", body: JSON.stringify({ name: categoryName, color: catForm.color, description: catForm.description || null }) });
                    setCatForm({ name: "", color: "slate", description: "" });
                    await loadCustom();
                    toast({ title: `Categoría "${categoryName}" creada` });
                  } catch (e: any) { toast({ title: "Error", description: e.message, variant: "destructive" }); }
                  finally { setCatSubmitting(false); }
                }}
              >
                <Plus className="h-4 w-4 mr-2" /> Crear Categoría
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Confirm delete category */}
      <AlertDialog open={catDeleteOpen} onOpenChange={setCatDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Eliminar Categoría</AlertDialogTitle>
            <AlertDialogDescription>Solo puedes eliminarla si no tiene productos asociados.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={async () => {
                if (!catDeleteId) return;
                try {
                  await apiFetch(`/inventory-categories/${catDeleteId}`, { method: "DELETE" });
                  await loadCustom();
                  toast({ title: "Categoría eliminada" });
                } catch (e: any) { toast({ title: "Error", description: e.message, variant: "destructive" }); }
                finally { setCatDeleteOpen(false); setCatDeleteId(null); }
              }}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Eliminar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      {/* Modal: Import CSV */}
      <Dialog open={importOpen} onOpenChange={setImportOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Importar Inventario (CSV)</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleImportSubmit} className="space-y-4 pt-4">
            <div className="space-y-2">
              <Label htmlFor="csv_file">Archivo CSV</Label>
              <Input
                id="csv_file"
                type="file"
                accept=".csv"
                onChange={(e) => setImportFile(e.target.files?.[0] || null)}
                disabled={importLoading}
                required
              />
              <p className="text-xs text-muted-foreground mt-2">
                El CSV debe tener las cabeceras exactas (ej. descargado desde Exportar).<br/>
                La importación actualizará los productos por Código o insertará nuevos.
              </p>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setImportOpen(false)} disabled={importLoading}>
                Cancelar
              </Button>
              <Button type="submit" disabled={!importFile || importLoading}>
                {importLoading ? "Importando..." : "Importar"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
