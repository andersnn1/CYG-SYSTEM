import { useState, useEffect } from "react";
import { useGetDashboardSummary, useGetSalesChart, useGetTopProducts } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { formatCurrency } from "@/lib/format";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { Package, AlertTriangle, DollarSign, TrendingDown, Target, Download, Pencil, FileText, ExternalLink, X, ShoppingCart } from "lucide-react";
import { startOfDay, isSameDay, parseISO } from "date-fns";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";
import { DatePickerCalendar } from "@/components/date-picker-calendar";
import { useLocation } from "wouter";

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
  return res.json();
}

const STATUS_LABEL: Record<string, { label: string; classes: string }> = {
  borrador:   { label: "Borrador",   classes: "bg-gray-100 text-gray-600 border-gray-200" },
  enviada:    { label: "Enviada",    classes: "bg-blue-50 text-blue-700 border-blue-200" },
  aceptada:   { label: "Aceptada",   classes: "bg-emerald-50 text-emerald-700 border-emerald-200" },
  rechazada:  { label: "Rechazada",  classes: "bg-red-50 text-red-700 border-red-200" },
  convertida: { label: "Convertida", classes: "bg-purple-50 text-purple-700 border-purple-200" },
  pendiente:  { label: "Pendiente",  classes: "bg-amber-50 text-amber-700 border-amber-200" },
};

interface RecentQuote {
  id: number;
  quoteNumber: string;
  status: string;
  total: string | number;
  clientName?: string;
  createdAt: string;
}

interface ScheduledQuote {
  id: number;
  quoteNumber: string;
  clientName: string;
  total: number;
  status: string;
  scheduledPurchaseDate: string;
}

const SCHEDULED_DAY_CLASS = "ring-2 ring-inset ring-yellow-400 bg-yellow-50 rounded-xl font-bold text-yellow-800";

export default function Dashboard() {
  const { toast } = useToast();
  const [, navigate] = useLocation();
  const queryClient = useQueryClient();
  const { data: summary, isLoading: isLoadingSummary } = useGetDashboardSummary();
  const { data: chartData, isLoading: isLoadingChart } = useGetSalesChart();
  const { data: topProductsData, isLoading: isLoadingProducts } = useGetTopProducts();
  const topProducts = Array.isArray(topProductsData) ? topProductsData : [];

  const [goalDialogOpen, setGoalDialogOpen] = useState(false);
  const [goalInput, setGoalInput] = useState("");
  const [savingGoal, setSavingGoal] = useState(false);
  const [recentQuotes, setRecentQuotes] = useState<RecentQuote[]>([]);
  const [loadingQuotes, setLoadingQuotes] = useState(true);
  const [scheduledQuotes, setScheduledQuotes] = useState<ScheduledQuote[]>([]);
  const [popupDay, setPopupDay] = useState<Date | null>(null);

  const popupQuotes = popupDay
    ? scheduledQuotes.filter(q =>
        q.scheduledPurchaseDate &&
        isSameDay(parseISO(q.scheduledPurchaseDate), popupDay)
      )
    : [];

  const scheduledDates = scheduledQuotes
    .filter(q => q.scheduledPurchaseDate)
    .map(q => startOfDay(parseISO(q.scheduledPurchaseDate)));

  const handleDayClick = (day: Date, mods: Record<string, boolean>) => {
    if (mods.scheduled) setPopupDay(day);
  };

  useEffect(() => {
    apiFetch("/quotes")
      .then((data: any[]) => {
        const sorted = [...data].sort(
          (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
        );
        setRecentQuotes(sorted.slice(0, 5));
      })
      .catch(() => {})
      .finally(() => setLoadingQuotes(false));

    apiFetch("/dashboard/scheduled-quotes")
      .then((data: ScheduledQuote[]) => setScheduledQuotes(data))
      .catch(() => {});
  }, []);

  const now = new Date();
  const currentMonth = now.getMonth() + 1;
  const currentYear = now.getFullYear();

  const handleSaveGoal = async () => {
    const amount = Number(goalInput);
    if (isNaN(amount) || amount <= 0) {
      toast({ title: "Error", description: "Ingrese un monto válido", variant: "destructive" });
      return;
    }
    setSavingGoal(true);
    try {
      await apiFetch("/dashboard/monthly-goal", {
        method: "POST",
        body: JSON.stringify({ month: currentMonth, year: currentYear, targetAmount: amount }),
      });
      toast({ title: "Meta de ventas actualizada" });
      setGoalDialogOpen(false);
      queryClient.invalidateQueries({ queryKey: ["GetDashboardSummary"] });
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    } finally {
      setSavingGoal(false);
    }
  };

  const handleExportBackup = async () => {
    try {
      const data = await apiFetch("/backup");
      const dateStr = new Date().toISOString().split("T")[0];
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `respaldo-candg-${dateStr}.json`;
      a.click();
      URL.revokeObjectURL(url);
      toast({ title: "Respaldo exportado correctamente" });
    } catch (e: any) {
      toast({ title: "Error al exportar", description: e.message, variant: "destructive" });
    }
  };

  if (isLoadingSummary) {
    return <div className="space-y-6"><Skeleton className="h-[200px] w-full" /><Skeleton className="h-[400px] w-full" /></div>;
  }

  if (!summary) return null;

  const distributable = summary.distributableProfit ?? summary.netProfit;
  const fondoReposicion = summary.fondoReposicion ?? summary.totalCost;
  const monthlyExpenses: number = (summary as any).monthlyExpenses ?? 0;
  const monthlySales: number = (summary as any).monthlySales ?? 0;
  const monthlyGoal: number | null = (summary as any).monthlyGoal ?? null;

  const goalPercent = monthlyGoal && monthlyGoal > 0
    ? Math.min(100, Math.round((monthlySales / monthlyGoal) * 100))
    : null;

  const goalBarColor =
    goalPercent === null ? "bg-gray-400"
    : goalPercent >= 80 ? "bg-green-500"
    : goalPercent >= 50 ? "bg-amber-500"
    : "bg-red-500";

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">Dashboard</h1>
          <p className="text-muted-foreground text-sm sm:text-base">Resumen general de tu negocio</p>
        </div>
        <Button
          variant="outline"
          className="gap-2 flex-shrink-0 h-11"
          onClick={handleExportBackup}
        >
          <Download className="h-4 w-4" />
          <span className="hidden sm:inline">Exportar Respaldo</span>
        </Button>
      </div>

      {/* Top Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {/* Ganancia Distribuible */}
        <Card className="sm:col-span-1 bg-primary text-primary-foreground border-none">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <DollarSign className="h-4 w-4" /> Ganancia Distribuible
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{formatCurrency(distributable)}</div>
            <p className="text-xs mt-1 opacity-75">Utilidad real después de costos y envíos</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2 text-muted-foreground">
              <Package className="h-4 w-4" /> Nro. de Ventas
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{summary.totalSales}</div>
            <div className="text-xs text-muted-foreground mt-1">{summary.totalClients} clientes registrados</div>
          </CardContent>
        </Card>

        <Card className={summary.lowStockCount > 0 ? "border-destructive/50 bg-destructive/10" : ""}>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2 text-muted-foreground">
              <AlertTriangle className={summary.lowStockCount > 0 ? "h-4 w-4 text-destructive" : "h-4 w-4"} /> Alertas Stock
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className={`text-2xl font-bold ${summary.lowStockCount > 0 ? "text-destructive" : ""}`}>{summary.lowStockCount}</div>
            <p className="text-xs mt-1 text-muted-foreground">Productos con stock bajo</p>
          </CardContent>
        </Card>
      </div>

      {/* Monthly Stats Row */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {/* Gastos del Mes */}
        <Card className="border-orange-300/50 bg-orange-50/50 dark:bg-orange-950/20 dark:border-orange-800/50">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2 text-orange-700 dark:text-orange-400">
              <TrendingDown className="h-4 w-4" /> Gastos del Mes
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-orange-700 dark:text-orange-400">
              {formatCurrency(monthlyExpenses)}
            </div>
            <p className="text-xs mt-1 text-muted-foreground">
              vs ventas del mes: {formatCurrency(monthlySales)}
            </p>
          </CardContent>
        </Card>

        {/* Meta de Ventas */}
        <Card>
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-medium flex items-center gap-2 text-muted-foreground">
                <Target className="h-4 w-4" /> Meta de Ventas del Mes
              </CardTitle>
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7 text-muted-foreground hover:text-foreground"
                onClick={() => {
                  setGoalInput(monthlyGoal ? String(monthlyGoal) : "");
                  setGoalDialogOpen(true);
                }}
              >
                <Pencil className="h-3.5 w-3.5" />
              </Button>
            </div>
          </CardHeader>
          <CardContent className="space-y-2">
            {monthlyGoal === null ? (
              <div className="text-sm text-muted-foreground">
                Sin meta definida
                <Button
                  variant="link"
                  className="px-1 h-auto text-sm text-primary"
                  onClick={() => { setGoalInput(""); setGoalDialogOpen(true); }}
                >
                  Establecer meta
                </Button>
              </div>
            ) : (
              <>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Vendido: <span className="font-semibold text-foreground">{formatCurrency(monthlySales)}</span></span>
                  <span className="text-muted-foreground">Meta: <span className="font-semibold text-foreground">{formatCurrency(monthlyGoal)}</span></span>
                </div>
                <div className="h-3 w-full bg-muted rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all ${goalBarColor}`}
                    style={{ width: `${goalPercent ?? 0}%` }}
                  />
                </div>
                <div className={`text-lg font-bold ${
                  goalPercent !== null && goalPercent >= 80 ? "text-green-600 dark:text-green-400"
                  : goalPercent !== null && goalPercent >= 50 ? "text-amber-600 dark:text-amber-400"
                  : "text-red-600 dark:text-red-400"
                }`}>
                  {goalPercent ?? 0}% alcanzado
                </div>
              </>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Distribución de Fondos */}
      <Card>
        <CardHeader>
          <div>
            <CardTitle>Distribución de Fondos</CardTitle>
            <p className="text-sm text-muted-foreground mt-0.5">Cómo se divide tu ganancia distribuible de <span className="font-semibold text-foreground">{formatCurrency(distributable)}</span></p>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {/* Operación */}
            <div className="rounded-xl border-2 border-blue-500/30 bg-blue-500/10 p-4 space-y-1">
              <div className="flex items-center gap-2 mb-2">
                <span className="inline-block w-3 h-3 rounded-full bg-blue-500"></span>
                <span className="text-xs font-semibold text-blue-700 dark:text-blue-400 uppercase tracking-wide">Operación 50%</span>
              </div>
              <div className="text-xl font-bold text-blue-700 dark:text-blue-400">{formatCurrency(summary.profitFirst?.operacion ?? 0)}</div>
              <p className="text-xs text-muted-foreground">Gastos del negocio</p>
              <div className="h-1.5 w-full bg-blue-200 dark:bg-blue-900/30 rounded-full mt-2">
                <div className="h-full bg-blue-500 rounded-full w-1/2" />
              </div>
            </div>

            {/* Dueño */}
            <div className="rounded-xl border-2 border-purple-500/30 bg-purple-500/10 p-4 space-y-1">
              <div className="flex items-center gap-2 mb-2">
                <span className="inline-block w-3 h-3 rounded-full bg-purple-500"></span>
                <span className="text-xs font-semibold text-purple-700 dark:text-purple-400 uppercase tracking-wide">Dueño 40%</span>
              </div>
              <div className="text-xl font-bold text-purple-700 dark:text-purple-400">{formatCurrency(summary.profitFirst?.dueno ?? 0)}</div>
              <p className="text-xs text-muted-foreground">Tu pago personal</p>
              <div className="h-1.5 w-full bg-purple-200 dark:bg-purple-900/30 rounded-full mt-2">
                <div className="h-full bg-purple-500 rounded-full w-[40%]" />
              </div>
            </div>

            {/* Ganancia */}
            <div className="rounded-xl border-2 border-green-500/30 bg-green-500/10 p-4 space-y-1">
              <div className="flex items-center gap-2 mb-2">
                <span className="inline-block w-3 h-3 rounded-full bg-green-500"></span>
                <span className="text-xs font-semibold text-green-700 dark:text-green-400 uppercase tracking-wide">Reserva 10%</span>
              </div>
              <div className="text-xl font-bold text-green-700 dark:text-green-400">{formatCurrency(summary.profitFirst?.ganancia ?? 0)}</div>
              <p className="text-xs text-muted-foreground">Fondo de reserva</p>
              <div className="h-1.5 w-full bg-green-200 dark:bg-green-900/30 rounded-full mt-2">
                <div className="h-full bg-green-500 rounded-full w-[10%]" />
              </div>
            </div>
          </div>

          {distributable > 0 && (
            <div className="pt-2 border-t">
              <p className="text-xs text-muted-foreground mb-2">Distribución de la ganancia:</p>
              <div className="flex h-3 rounded-full overflow-hidden">
                <div className="bg-blue-500 w-1/2" title="Operación 50%" />
                <div className="bg-purple-500 w-[40%]" title="Dueño 40%" />
                <div className="bg-green-500 w-[10%]" title="Reserva 10%" />
              </div>
              <div className="flex gap-4 mt-2 text-xs text-muted-foreground flex-wrap">
                <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-blue-500 inline-block"></span> Gastos operativos (50%)</span>
                <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-purple-500 inline-block"></span> Dueño (40%)</span>
                <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-green-500 inline-block"></span> Reserva (10%)</span>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Card className="col-span-1 lg:col-span-2">
          <CardHeader>
            <CardTitle>Ventas Mensuales</CardTitle>
          </CardHeader>
          <CardContent className="h-[300px]">
            {isLoadingChart ? (
              <Skeleton className="h-full w-full" />
            ) : chartData && chartData.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" />
                  <XAxis dataKey="month" stroke="hsl(var(--muted-foreground))" fontSize={12} tickLine={false} axisLine={false} />
                  <YAxis stroke="hsl(var(--muted-foreground))" fontSize={12} tickLine={false} axisLine={false} tickFormatter={(value) => `L.${value}`} />
                  <Tooltip
                    formatter={(value: number, name: string) => [formatCurrency(value), name === "income" ? "Total Ventas" : "Ganancia Distribuible"]}
                    contentStyle={{ backgroundColor: 'hsl(var(--card))', borderColor: 'hsl(var(--border))', borderRadius: '8px' }}
                  />
                  <Bar dataKey="income" name="income" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="profit" name="profit" fill="hsl(var(--chart-2))" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-full flex items-center justify-center text-muted-foreground">No hay datos suficientes</div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Top Productos</CardTitle>
          </CardHeader>
          <CardContent>
            {isLoadingProducts ? (
              <div className="space-y-4">
                <Skeleton className="h-12 w-full" />
                <Skeleton className="h-12 w-full" />
                <Skeleton className="h-12 w-full" />
              </div>
            ) : topProducts && topProducts.length > 0 ? (
              <div className="space-y-4">
                {topProducts.map((product, i) => (
                  <div key={i} className="flex justify-between items-center p-3 rounded-lg bg-secondary/50 border border-secondary">
                    <div className="space-y-1">
                      <p className="font-medium text-sm leading-none">{product.name}</p>
                      <p className="text-xs text-muted-foreground">{product.category}</p>
                    </div>
                    <div className="text-right">
                      <p className="font-bold text-sm">{formatCurrency(product.revenue)}</p>
                      <p className="text-xs text-muted-foreground">{product.unitsSold} uds</p>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-8 text-muted-foreground">No hay ventas registradas</div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Calendar + Recent Cotizaciones — equal-height side by side */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-stretch">

        {/* Calendar */}
        <div className="flex flex-col">
          <DatePickerCalendar
            title={scheduledDates.length > 0 ? `Calendario · ${scheduledDates.length} cita${scheduledDates.length > 1 ? "s" : ""} programada${scheduledDates.length > 1 ? "s" : ""}` : "Calendario"}
            placeholder="Hoy"
            disablePast={false}
            defaultToToday
            modifiers={{ scheduled: scheduledDates }}
            modifierClassNames={{ scheduled: SCHEDULED_DAY_CLASS }}
            modifiersStyles={{
              scheduled: {
                boxShadow: "inset 0 0 0 2.5px #facc15",
                backgroundColor: "#fef9c3",
                borderRadius: "0.75rem",
                fontWeight: "700",
                color: "#92400e",
                cursor: "pointer",
              },
            }}
            onDayClick={handleDayClick}
          />
          {scheduledDates.length > 0 && (
            <p className="text-xs text-muted-foreground mt-2 text-center">
              💛 Los días con borde amarillo tienen cotizaciones programadas — haz clic para verlas
            </p>
          )}
        </div>

        {/* Recent Cotizaciones */}
        <Card className="flex flex-col">
          <CardHeader className="flex-shrink-0">
            <div className="flex items-center justify-between">
              <CardTitle className="flex items-center gap-2">
                <FileText className="h-4 w-4 text-blue-500" /> Cotizaciones Recientes
              </CardTitle>
              <Button
                variant="ghost"
                size="sm"
                className="text-xs text-muted-foreground gap-1"
                onClick={() => navigate("/cotizaciones")}
              >
                Ver todas <ExternalLink className="h-3 w-3" />
              </Button>
            </div>
          </CardHeader>
          <CardContent className="flex-1 overflow-y-auto">
            {loadingQuotes ? (
              <div className="space-y-3">
                {[...Array(5)].map((_, i) => <Skeleton key={i} className="h-14 w-full" />)}
              </div>
            ) : recentQuotes.length === 0 ? (
              <div className="text-center py-10 text-muted-foreground text-sm">
                No hay cotizaciones registradas
              </div>
            ) : (
              <div className="divide-y divide-border">
                {recentQuotes.map((q) => {
                  const cfg = STATUS_LABEL[q.status] ?? { label: q.status, classes: "bg-gray-100 text-gray-600 border-gray-200" };
                  const date = new Date(q.createdAt).toLocaleDateString("es-HN", { day: "2-digit", month: "short", year: "numeric" });
                  return (
                    <div key={q.id} className="flex items-center justify-between py-3 gap-3">
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="flex-shrink-0 w-9 h-9 rounded-lg bg-blue-50 dark:bg-blue-900/20 flex items-center justify-center">
                          <FileText className="h-4 w-4 text-blue-500" />
                        </div>
                        <div className="min-w-0">
                          <p className="font-semibold text-sm">{q.quoteNumber}</p>
                          <p className="text-xs text-muted-foreground truncate">{q.clientName ?? "—"} · {date}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-3 flex-shrink-0">
                        <span className={`hidden sm:inline-flex text-xs font-medium px-2 py-0.5 rounded-full border ${cfg.classes}`}>
                          {cfg.label}
                        </span>
                        <p className="font-bold text-sm">{formatCurrency(Number(q.total))}</p>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Scheduled-day popup */}
      {popupDay && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={() => setPopupDay(null)}>
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" />
          <div
            className="relative bg-white dark:bg-slate-800 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-700 w-full max-w-md"
            onClick={e => e.stopPropagation()}
          >
            {/* Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b dark:border-slate-700 bg-yellow-50 dark:bg-yellow-900/20 rounded-t-2xl">
              <div className="flex items-center gap-2">
                <ShoppingCart className="h-5 w-5 text-yellow-600" />
                <div>
                  <p className="font-bold text-sm text-yellow-900 dark:text-yellow-200">Compras programadas</p>
                  <p className="text-xs text-yellow-700 dark:text-yellow-400">
                    {popupDay.toLocaleDateString("es-HN", { weekday: "long", day: "numeric", month: "long", year: "numeric" })}
                  </p>
                </div>
              </div>
              <button
                onClick={() => setPopupDay(null)}
                className="rounded-full p-1 hover:bg-yellow-100 dark:hover:bg-yellow-800 transition-colors"
              >
                <X className="h-4 w-4 text-yellow-700 dark:text-yellow-300" />
              </button>
            </div>

            {/* Quote list */}
            <div className="p-4 space-y-3 max-h-80 overflow-y-auto">
              {popupQuotes.map(q => {
                const cfg = STATUS_LABEL[q.status] ?? { label: q.status, classes: "bg-gray-100 text-gray-600 border-gray-200" };
                return (
                  <div key={q.id} className="flex items-center justify-between gap-3 p-3 rounded-xl bg-slate-50 dark:bg-slate-700/50 border border-slate-100 dark:border-slate-700">
                    <div className="min-w-0">
                      <p className="font-semibold text-sm">{q.quoteNumber}</p>
                      <p className="text-xs text-muted-foreground truncate">{q.clientName}</p>
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      <span className={`text-xs font-medium px-2 py-0.5 rounded-full border ${cfg.classes}`}>{cfg.label}</span>
                      <p className="font-bold text-sm">{formatCurrency(q.total)}</p>
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-7 text-xs px-2"
                        onClick={() => { setPopupDay(null); navigate("/cotizaciones"); }}
                      >
                        Ver
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* Goal Dialog */}
      <Dialog open={goalDialogOpen} onOpenChange={setGoalDialogOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Meta de Ventas del Mes</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <Label>Monto objetivo (L)</Label>
            <Input
              type="number"
              min={0}
              step="0.01"
              placeholder="Ej: 50000"
              value={goalInput}
              onChange={e => setGoalInput(e.target.value)}
              autoFocus
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setGoalDialogOpen(false)}>Cancelar</Button>
            <Button onClick={handleSaveGoal} disabled={savingGoal}>
              {savingGoal ? "Guardando..." : "Guardar Meta"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
