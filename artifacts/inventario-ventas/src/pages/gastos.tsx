import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { Plus, Pencil, Trash2, Wallet, TrendingDown } from "lucide-react";
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

interface Expense {
  id: number;
  amount: number;
  category: string;
  description?: string | null;
  expenseDate: string;
  notes?: string | null;
  createdAt: string;
}

const CATEGORIES = ["Servicios", "Renta", "Transporte", "Suministros", "Marketing", "Otros"];

const MONTH_NAMES = [
  "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
  "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre",
];

type FormData = {
  description: string;
  amount: string;
  category: string;
  expenseDate: string;
  notes: string;
};

const defaultForm = (): FormData => ({
  description: "",
  amount: "",
  category: "",
  expenseDate: new Date().toISOString().split("T")[0],
  notes: "",
});

export default function Gastos() {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const now = new Date();
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [year, setYear] = useState(now.getFullYear());

  const [formOpen, setFormOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [editExpense, setEditExpense] = useState<Expense | null>(null);
  const [deleteId, setDeleteId] = useState<number | null>(null);
  const [form, setForm] = useState<FormData>(defaultForm());
  const [submitting, setSubmitting] = useState(false);

  const currentYear = now.getFullYear();
  const yearOptions = [currentYear - 2, currentYear - 1, currentYear, currentYear + 1, currentYear + 2];

  const { data: expenses, isLoading } = useQuery<Expense[]>({
    queryKey: ["expenses", month, year],
    queryFn: () => apiFetch(`/expenses?month=${month}&year=${year}`),
  });

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ["expenses"] });

  const totalDelMes = (expenses ?? []).reduce((sum, e) => sum + e.amount, 0);

  const openCreate = () => {
    setEditExpense(null);
    setForm(defaultForm());
    setFormOpen(true);
  };

  const openEdit = (expense: Expense) => {
    setEditExpense(expense);
    setForm({
      description: expense.description ?? "",
      amount: String(expense.amount),
      category: expense.category,
      expenseDate: expense.expenseDate,
      notes: expense.notes ?? "",
    });
    setFormOpen(true);
  };

  const openDelete = (id: number) => {
    setDeleteId(id);
    setDeleteOpen(true);
  };

  const handleSubmit = async () => {
    if (!form.amount || isNaN(Number(form.amount)) || Number(form.amount) <= 0) {
      toast({ title: "Error", description: "Ingrese un monto válido", variant: "destructive" });
      return;
    }
    if (!form.category) {
      toast({ title: "Error", description: "Seleccione una categoría", variant: "destructive" });
      return;
    }
    if (!form.expenseDate) {
      toast({ title: "Error", description: "Ingrese la fecha", variant: "destructive" });
      return;
    }

    setSubmitting(true);
    try {
      const body = {
        amount: Number(form.amount),
        category: form.category,
        description: form.description || undefined,
        expenseDate: form.expenseDate,
        notes: form.notes || undefined,
      };

      if (editExpense) {
        await apiFetch(`/expenses/${editExpense.id}`, { method: "PATCH", body: JSON.stringify(body) });
        toast({ title: "Gasto actualizado" });
      } else {
        await apiFetch("/expenses", { method: "POST", body: JSON.stringify(body) });
        toast({ title: "Gasto registrado" });
      }
      setFormOpen(false);
      invalidate();
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteId) return;
    try {
      await apiFetch(`/expenses/${deleteId}`, { method: "DELETE" });
      toast({ title: "Gasto eliminado" });
      setDeleteOpen(false);
      setDeleteId(null);
      invalidate();
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    }
  };

  const categoryColor: Record<string, string> = {
    Servicios: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300",
    Renta: "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300",
    Transporte: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300",
    Suministros: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300",
    Marketing: "bg-pink-100 text-pink-700 dark:bg-pink-900/30 dark:text-pink-300",
    Otros: "bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300",
  };

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight flex items-center gap-3">
            <Wallet className="h-8 w-8 text-primary" />
            Gastos
          </h1>
          <p className="text-muted-foreground mt-1">Control de gastos del negocio</p>
        </div>
        <Button onClick={openCreate} className="gap-2">
          <Plus className="h-4 w-4" /> Nuevo Gasto
        </Button>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-2">
          <Label className="text-sm font-medium">Mes:</Label>
          <Select value={String(month)} onValueChange={v => setMonth(Number(v))}>
            <SelectTrigger className="w-36 bg-background">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {MONTH_NAMES.map((name, i) => (
                <SelectItem key={i + 1} value={String(i + 1)}>{name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="flex items-center gap-2">
          <Label className="text-sm font-medium">Año:</Label>
          <Select value={String(year)} onValueChange={v => setYear(Number(v))}>
            <SelectTrigger className="w-24 bg-background">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {yearOptions.map(y => (
                <SelectItem key={y} value={String(y)}>{y}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Summary Card */}
      <Card className="border-destructive/30 bg-destructive/5 dark:bg-destructive/10">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium flex items-center gap-2 text-muted-foreground">
            <TrendingDown className="h-4 w-4 text-destructive" />
            Total del Mes — {MONTH_NAMES[month - 1]} {year}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-3xl font-bold text-destructive">{formatCurrency(totalDelMes)}</div>
          <p className="text-xs text-muted-foreground mt-1">
            {(expenses ?? []).length} {(expenses ?? []).length === 1 ? "gasto registrado" : "gastos registrados"}
          </p>
        </CardContent>
      </Card>

      {/* List */}
      {isLoading ? (
        <div className="space-y-3">
          {[1, 2, 3].map(i => <Skeleton key={i} className="h-20 w-full" />)}
        </div>
      ) : (expenses ?? []).length === 0 ? (
        <div className="bg-card rounded-xl border py-16 text-center">
          <Wallet className="h-10 w-10 text-muted-foreground mx-auto mb-3" />
          <p className="text-foreground font-medium">No hay gastos en {MONTH_NAMES[month - 1]} {year}</p>
          <p className="text-muted-foreground text-sm mt-1">Registra tu primer gasto del mes</p>
        </div>
      ) : (
        <div className="space-y-3">
          {(expenses ?? []).map(expense => (
            <Card key={expense.id} className="hover:shadow-md transition-shadow">
              <CardContent className="p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${categoryColor[expense.category] ?? categoryColor.Otros}`}>
                        {expense.category}
                      </span>
                      <span className="text-sm text-muted-foreground">{expense.expenseDate}</span>
                    </div>
                    {expense.description && (
                      <p className="font-medium text-foreground mt-1 truncate">{expense.description}</p>
                    )}
                    {expense.notes && (
                      <p className="text-xs text-muted-foreground mt-1 truncate">{expense.notes}</p>
                    )}
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <span className="text-lg font-bold text-destructive">{formatCurrency(expense.amount)}</span>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 text-muted-foreground hover:text-foreground"
                      onClick={() => openEdit(expense)}
                    >
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 text-destructive hover:text-destructive"
                      onClick={() => openDelete(expense.id)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Form Dialog */}
      <Dialog open={formOpen} onOpenChange={setFormOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{editExpense ? "Editar Gasto" : "Nuevo Gasto"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1">
              <Label>Descripción (opcional)</Label>
              <Input
                value={form.description}
                onChange={e => setForm({ ...form, description: e.target.value })}
                placeholder="Ej: Pago de luz, gasolina..."
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>Monto *</Label>
                <Input
                  type="number"
                  min={0}
                  step="0.01"
                  value={form.amount}
                  onChange={e => setForm({ ...form, amount: e.target.value })}
                  placeholder="0.00"
                />
              </div>
              <div className="space-y-1">
                <Label>Fecha *</Label>
                <Input
                  type="date"
                  value={form.expenseDate}
                  onChange={e => setForm({ ...form, expenseDate: e.target.value })}
                />
              </div>
            </div>
            <div className="space-y-1">
              <Label>Categoría *</Label>
              <Select value={form.category} onValueChange={v => setForm({ ...form, category: v })}>
                <SelectTrigger className="bg-background">
                  <SelectValue placeholder="Seleccionar categoría..." />
                </SelectTrigger>
                <SelectContent>
                  {CATEGORIES.map(cat => (
                    <SelectItem key={cat} value={cat}>{cat}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>Notas (opcional)</Label>
              <Textarea
                value={form.notes}
                onChange={e => setForm({ ...form, notes: e.target.value })}
                placeholder="Detalles adicionales..."
                rows={3}
                className="resize-none"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setFormOpen(false)}>Cancelar</Button>
            <Button onClick={handleSubmit} disabled={submitting}>
              {submitting ? "Guardando..." : editExpense ? "Guardar Cambios" : "Registrar Gasto"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete AlertDialog */}
      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Eliminar Gasto</AlertDialogTitle>
            <AlertDialogDescription>Esta acción no se puede deshacer.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Eliminar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
