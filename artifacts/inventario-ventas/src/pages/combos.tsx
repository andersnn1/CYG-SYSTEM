import { useState, useEffect } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { Plus, Pencil, Trash2, Package, X, Search, ToggleLeft, ToggleRight } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { formatCurrency } from "@/lib/format";

const API_BASE = "/api";
async function apiFetch(path: string, options?: RequestInit) {
  const res = await fetch(`${API_BASE}${path}`, {
    headers: { "Content-Type": "application/json" },
    ...options,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error((err as any).error || `HTTP ${res.status}`);
  }
  if (res.status === 204) return null;
  return res.json();
}

// ─── Types ───────────────────────────────────────────────────

interface ProductOption {
  id: number;
  label: string;
  price: number;
  type: "perfumeria" | "sublimacion";
  code?: string | null;
}

interface ComboItemForm {
  productId: number;
  productType: "perfumeria" | "sublimacion";
  productName: string;
  quantity: number;
  unitPrice: number;
}

interface Combo {
  id: number;
  code: string;
  name: string;
  description?: string | null;
  fixedPrice?: number | null;
  active: boolean;
  items: ComboItemForm[];
  createdAt: string;
}

type FormState = {
  code: string;
  name: string;
  description: string;
  fixedPrice: string;
  active: boolean;
  items: ComboItemForm[];
};

const defaultForm = (): FormState => ({
  code: "",
  name: "",
  description: "",
  fixedPrice: "",
  active: true,
  items: [],
});

// ─── Component ───────────────────────────────────────────────

export default function Combos() {
  const { toast } = useToast();

  const [combos, setCombos] = useState<Combo[]>([]);
  const [loading, setLoading] = useState(true);
  const [products, setProducts] = useState<ProductOption[]>([]);

  const [view, setView] = useState<"list" | "form">("list");
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState<FormState>(defaultForm());
  const [submitting, setSubmitting] = useState(false);

  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteId, setDeleteId] = useState<number | null>(null);

  // Product search per item row
  const [itemSearch, setItemSearch] = useState<Record<number, string>>({});
  const [itemDropOpen, setItemDropOpen] = useState<Record<number, boolean>>({});

  // ── Load data ────────────────────────────────────────────

  const loadCombos = async () => {
    try {
      setLoading(true);
      const data = await apiFetch("/combos");
      setCombos(Array.isArray(data) ? data : []);
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadCombos(); }, []);

  useEffect(() => {
    async function loadProducts() {
      try {
        const [perf, sub] = await Promise.all([
          apiFetch("/perfumery"),
          apiFetch("/sublimation"),
        ]);
        const perfOpts: ProductOption[] = (Array.isArray(perf) ? perf : []).map((p: any) => ({
          id: p.id,
          label: `${p.brand} ${p.name} ${p.ml}ml`,
          price: Number(p.salePrice ?? 0),
          type: "perfumeria" as const,
          code: p.code ?? null,
        }));
        const subOpts: ProductOption[] = (Array.isArray(sub) ? sub : []).map((s: any) => ({
          id: s.id,
          label: s.name,
          price: Number(s.salePrice ?? 0),
          type: "sublimacion" as const,
          code: s.code ?? null,
        }));
        setProducts([...perfOpts, ...subOpts]);
      } catch { /* ignore */ }
    }
    loadProducts();
  }, []);

  // ── Form actions ─────────────────────────────────────────

  const openCreate = () => {
    setForm(defaultForm());
    setEditingId(null);
    setItemSearch({});
    setItemDropOpen({});
    setView("form");
  };

  const openEdit = (combo: Combo) => {
    setForm({
      code: combo.code,
      name: combo.name,
      description: combo.description ?? "",
      fixedPrice: combo.fixedPrice != null ? String(combo.fixedPrice) : "",
      active: combo.active,
      items: combo.items.map(i => ({ ...i })),
    });
    setEditingId(combo.id);
    setItemSearch({});
    setItemDropOpen({});
    setView("form");
  };

  const addItem = () =>
    setForm(f => ({
      ...f,
      items: [...f.items, { productId: 0, productType: "sublimacion", productName: "", quantity: 1, unitPrice: 0 }],
    }));

  const removeItem = (i: number) =>
    setForm(f => ({ ...f, items: f.items.filter((_, idx) => idx !== i) }));

  const updateItem = (i: number, patch: Partial<ComboItemForm>) =>
    setForm(f => {
      const items = [...f.items];
      items[i] = { ...items[i], ...patch };
      return { ...f, items };
    });

  const selectProduct = (i: number, p: ProductOption) => {
    updateItem(i, {
      productId:   p.id,
      productType: p.type,
      productName: p.label,
      unitPrice:   p.price,
    });
    setItemSearch(s => { const n = { ...s }; delete n[i]; return n; });
    setItemDropOpen(s => ({ ...s, [i]: false }));
  };

  const handleSubmit = async () => {
    if (!form.code.trim()) {
      toast({ title: "Error", description: "El código es requerido", variant: "destructive" }); return;
    }
    if (!form.name.trim()) {
      toast({ title: "Error", description: "El nombre es requerido", variant: "destructive" }); return;
    }
    if (form.items.length === 0) {
      toast({ title: "Error", description: "Agrega al menos un producto al combo", variant: "destructive" }); return;
    }
    if (form.items.some(it => !it.productId || it.quantity < 1)) {
      toast({ title: "Error", description: "Selecciona un producto válido en cada fila", variant: "destructive" }); return;
    }

    setSubmitting(true);
    try {
      const body = {
        code:        form.code.trim().toUpperCase(),
        name:        form.name.trim(),
        description: form.description.trim() || undefined,
        fixedPrice:  form.fixedPrice ? Number(form.fixedPrice) : (editingId ? null : undefined),
        active:      form.active,
        items:       form.items,
      };

      if (editingId) {
        await apiFetch(`/combos/${editingId}`, { method: "PUT", body: JSON.stringify(body) });
        toast({ title: "Combo actualizado" });
      } else {
        await apiFetch("/combos", { method: "POST", body: JSON.stringify(body) });
        toast({ title: "Combo creado" });
      }
      setView("list");
      loadCombos();
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteId) return;
    try {
      await apiFetch(`/combos/${deleteId}`, { method: "DELETE" });
      toast({ title: "Combo eliminado" });
      setDeleteOpen(false);
      setDeleteId(null);
      loadCombos();
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    }
  };

  const toggleActive = async (combo: Combo) => {
    try {
      await apiFetch(`/combos/${combo.id}`, {
        method: "PUT",
        body: JSON.stringify({ active: !combo.active }),
      });
      loadCombos();
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    }
  };

  // ── Computed ─────────────────────────────────────────────

  const autoTotal = form.items.reduce((s, it) => s + it.quantity * it.unitPrice, 0);
  const fixedPriceNum = form.fixedPrice ? Number(form.fixedPrice) : null;

  // ── LIST VIEW ────────────────────────────────────────────

  if (view === "list") {
    return (
      <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight flex items-center gap-3">
              <Package className="h-8 w-8 text-primary" /> Combos
            </h1>
            <p className="text-muted-foreground mt-1">Paquetes de productos con código rápido</p>
          </div>
          <Button onClick={openCreate} className="gap-2">
            <Plus className="h-4 w-4" /> Nuevo Combo
          </Button>
        </div>

        {loading ? (
          <div className="space-y-3">{[1,2,3].map(i => <Skeleton key={i} className="h-24 w-full" />)}</div>
        ) : combos.length === 0 ? (
          <div className="bg-card rounded-xl border py-20 text-center">
            <Package className="h-10 w-10 text-muted-foreground mx-auto mb-3" />
            <p className="font-medium text-foreground">No hay combos creados</p>
            <p className="text-muted-foreground text-sm mt-1">Crea tu primer combo para agilizar la facturación</p>
          </div>
        ) : (
          <div className="space-y-3">
            {combos.map(combo => (
              <Card key={combo.id} className={`transition-shadow hover:shadow-md ${!combo.active ? "opacity-60" : ""}`}>
                <CardContent className="p-4">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap mb-1">
                        <span className="font-mono font-bold text-primary text-sm bg-primary/10 px-2 py-0.5 rounded">
                          {combo.code}
                        </span>
                        <span className="font-semibold text-foreground">{combo.name}</span>
                        {!combo.active && (
                          <span className="text-xs bg-muted text-muted-foreground px-2 py-0.5 rounded-full">Inactivo</span>
                        )}
                      </div>
                      {combo.description && (
                        <p className="text-sm text-muted-foreground mb-2">{combo.description}</p>
                      )}
                      <div className="flex flex-wrap gap-2 mt-2">
                        {(combo.items ?? []).map((item, i) => (
                          <span key={i} className="text-xs bg-muted rounded-full px-2.5 py-1 text-muted-foreground">
                            {item.quantity}× {item.productName}
                          </span>
                        ))}
                      </div>
                    </div>
                    <div className="flex flex-col items-end gap-2 flex-shrink-0">
                      {combo.fixedPrice != null ? (
                        <div className="text-right">
                          <div className="text-xs text-muted-foreground">Precio fijo</div>
                          <div className="font-bold text-foreground">{formatCurrency(combo.fixedPrice)}</div>
                        </div>
                      ) : (
                        <div className="text-right">
                          <div className="text-xs text-muted-foreground">Precio por ítems</div>
                          <div className="font-bold text-foreground">
                            {formatCurrency((combo.items ?? []).reduce((s, it) => s + it.quantity * it.unitPrice, 0))}
                          </div>
                        </div>
                      )}
                      <div className="flex items-center gap-1">
                        <button
                          title={combo.active ? "Desactivar" : "Activar"}
                          onClick={() => toggleActive(combo)}
                          className="p-1.5 rounded-lg text-muted-foreground hover:text-primary hover:bg-primary/10 transition-colors"
                        >
                          {combo.active
                            ? <ToggleRight className="h-4 w-4 text-green-500" />
                            : <ToggleLeft className="h-4 w-4" />}
                        </button>
                        <button
                          title="Editar"
                          onClick={() => openEdit(combo)}
                          className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                        >
                          <Pencil className="h-4 w-4" />
                        </button>
                        <button
                          title="Eliminar"
                          onClick={() => { setDeleteId(combo.id); setDeleteOpen(true); }}
                          className="p-1.5 rounded-lg text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}

        <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>¿Eliminar este combo?</AlertDialogTitle>
              <AlertDialogDescription>Esta acción no se puede deshacer.</AlertDialogDescription>
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

  // ── FORM VIEW ────────────────────────────────────────────

  return (
    <div className="space-y-6 animate-in fade-in duration-200 pb-16 max-w-2xl mx-auto">
      <div className="flex items-center justify-between">
        <div>
          <button
            onClick={() => setView("list")}
            className="text-sm text-muted-foreground hover:text-foreground flex items-center gap-1 mb-1"
          >
            ← Combos
          </button>
          <h2 className="text-xl font-bold text-foreground">
            {editingId ? "Editar Combo" : "Nuevo Combo"}
          </h2>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => setView("list")}>Cancelar</Button>
          <Button onClick={handleSubmit} disabled={submitting}>
            {submitting ? "Guardando..." : "Guardar Combo"}
          </Button>
        </div>
      </div>

      {/* Datos del combo */}
      <Card>
        <CardContent className="p-5 space-y-4">
          <h3 className="font-semibold text-sm text-muted-foreground uppercase tracking-wide">Información del combo</h3>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1">
              <Label>Código *</Label>
              <Input
                placeholder="Ej: PACK-INICIO"
                value={form.code}
                onChange={e => setForm(f => ({ ...f, code: e.target.value.toUpperCase() }))}
                className="font-mono bg-background"
              />
              <p className="text-xs text-muted-foreground">Se usa para expandir el combo al buscarlo en facturas</p>
            </div>
            <div className="space-y-1">
              <Label>Precio fijo (opcional)</Label>
              <Input
                type="number"
                min={0}
                step="0.01"
                placeholder={autoTotal > 0 ? `Auto: ${formatCurrency(autoTotal)}` : "0.00"}
                value={form.fixedPrice}
                onChange={e => setForm(f => ({ ...f, fixedPrice: e.target.value }))}
                className="bg-background"
              />
              <p className="text-xs text-muted-foreground">Deja vacío para usar la suma de los ítems</p>
            </div>
          </div>

          <div className="space-y-1">
            <Label>Nombre *</Label>
            <Input
              placeholder="Ej: Pack Inicio Sublimación"
              value={form.name}
              onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
              className="bg-background"
            />
          </div>

          <div className="space-y-1">
            <Label>Descripción (opcional)</Label>
            <Textarea
              placeholder="Descripción del combo o condiciones..."
              value={form.description}
              onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
              rows={2}
              className="resize-none bg-background"
            />
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setForm(f => ({ ...f, active: !f.active }))}
              className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
            >
              {form.active
                ? <ToggleRight className="h-5 w-5 text-green-500" />
                : <ToggleLeft className="h-5 w-5" />}
              {form.active ? "Activo" : "Inactivo"}
            </button>
          </div>
        </CardContent>
      </Card>

      {/* Productos del combo */}
      <Card>
        <CardContent className="p-5 space-y-4">
          <h3 className="font-semibold text-sm text-muted-foreground uppercase tracking-wide">Productos del combo</h3>

          {form.items.length === 0 && (
            <p className="text-sm text-muted-foreground text-center py-4">
              Aún no hay productos. Agrega al menos uno.
            </p>
          )}

          {form.items.map((item, i) => {
            const filtered = products.filter(p =>
              !itemSearch[i] ||
              p.label.toLowerCase().includes(itemSearch[i].toLowerCase()) ||
              (p.code ?? "").toLowerCase().includes(itemSearch[i].toLowerCase())
            ).slice(0, 8);

            return (
              <div key={i} className="border border-border rounded-lg p-4 space-y-3 bg-background relative">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-muted-foreground uppercase">Producto {i + 1}</span>
                  <button type="button" onClick={() => removeItem(i)} className="text-destructive hover:text-destructive/70">
                    <X className="h-4 w-4" />
                  </button>
                </div>

                {/* Buscador de producto */}
                <div className="relative">
                  <Label className="text-xs text-muted-foreground">Producto *</Label>
                  <div className="relative mt-1">
                    <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                    <Input
                      className="pl-9 bg-card"
                      placeholder="Buscar por nombre o código..."
                      value={itemSearch[i] !== undefined ? itemSearch[i] : item.productName}
                      onChange={e => {
                        setItemSearch(s => ({ ...s, [i]: e.target.value }));
                        setItemDropOpen(s => ({ ...s, [i]: true }));
                      }}
                      onFocus={() => setItemDropOpen(s => ({ ...s, [i]: true }))}
                      onBlur={() => setTimeout(() => setItemDropOpen(s => ({ ...s, [i]: false })), 150)}
                    />
                  </div>
                  {itemDropOpen[i] && filtered.length > 0 && (
                    <div className="absolute z-50 w-full mt-1 bg-card border border-border rounded-xl shadow-lg max-h-48 overflow-y-auto">
                      {filtered.map(p => (
                        <button
                          key={`${p.type}-${p.id}`}
                          type="button"
                          className="w-full text-left px-4 py-2.5 text-sm hover:bg-muted transition-colors first:rounded-t-xl last:rounded-b-xl"
                          onMouseDown={() => selectProduct(i, p)}
                        >
                          <span className="font-medium text-foreground">{p.label}</span>
                          {p.code && <span className="font-mono text-xs text-muted-foreground ml-2">[{p.code}]</span>}
                          <span className="text-muted-foreground text-xs ml-2">{formatCurrency(p.price)}</span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                <div className="grid grid-cols-3 gap-3">
                  <div>
                    <Label className="text-xs text-muted-foreground">Cantidad *</Label>
                    <Input
                      type="number"
                      min={1}
                      className="mt-1 bg-card"
                      value={item.quantity}
                      onChange={e => updateItem(i, { quantity: Number(e.target.value) })}
                    />
                  </div>
                  <div>
                    <Label className="text-xs text-muted-foreground">Precio unitario</Label>
                    <Input
                      type="number"
                      min={0}
                      step="0.01"
                      className="mt-1 bg-card"
                      value={item.unitPrice || ""}
                      onChange={e => updateItem(i, { unitPrice: Number(e.target.value) })}
                    />
                  </div>
                  <div>
                    <Label className="text-xs text-muted-foreground">Subtotal</Label>
                    <div className="mt-1 px-3 py-2 bg-muted rounded-md text-sm font-semibold text-foreground">
                      {formatCurrency(item.quantity * item.unitPrice)}
                    </div>
                  </div>
                </div>
              </div>
            );
          })}

          <Button type="button" variant="outline" onClick={addItem} className="w-full gap-2 border-dashed">
            <Plus className="h-4 w-4" /> Agregar Producto
          </Button>

          {form.items.length > 0 && (
            <div className="flex justify-end pt-2 border-t border-border">
              <div className="text-sm text-muted-foreground">
                Total por ítems:{" "}
                <span className="font-bold text-foreground">{formatCurrency(autoTotal)}</span>
                {fixedPriceNum != null && fixedPriceNum !== autoTotal && (
                  <span className="ml-2 text-primary font-semibold">
                    → Precio fijo: {formatCurrency(fixedPriceNum)}
                  </span>
                )}
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
