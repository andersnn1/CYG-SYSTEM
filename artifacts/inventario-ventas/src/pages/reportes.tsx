import { useState } from "react";
import { useGetMonthlyReport, getGetMonthlyReportQueryKey } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { formatCurrency } from "@/lib/format";
import { FileText, Printer, TrendingUp, DollarSign, Package, Users } from "lucide-react";

const MONTHS = ["Enero","Febrero","Marzo","Abril","Mayo","Junio","Julio","Agosto","Septiembre","Octubre","Noviembre","Diciembre"];

export default function Reportes() {
  const now = new Date();
  const [month, setMonth] = useState<number>(now.getMonth() + 1);
  const [year, setYear] = useState<number>(now.getFullYear());

  const { data: report, isLoading } = useGetMonthlyReport(
    { month, year },
    { query: { queryKey: getGetMonthlyReportQueryKey({ month, year }) } }
  );

  const years = Array.from({ length: 5 }, (_, i) => now.getFullYear() - i);

  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="flex items-center justify-between print-hide">
        <div>
          <h1 className="text-3xl font-bold tracking-tight flex items-center gap-3">
            <FileText className="h-8 w-8 text-primary" />
            Reportes Mensuales
          </h1>
          <p className="text-muted-foreground mt-1">Resumen financiero y estado de cuenta</p>
        </div>
        <Button onClick={handlePrint} variant="outline" className="gap-2">
          <Printer className="h-4 w-4" /> Exportar PDF
        </Button>
      </div>

      <div className="flex gap-4 items-end print-hide">
        <div className="space-y-1">
          <Label className="text-xs text-muted-foreground">Mes</Label>
          <Select value={String(month)} onValueChange={(v) => setMonth(Number(v))}>
            <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
            <SelectContent>
              {MONTHS.map((m, i) => <SelectItem key={i} value={String(i + 1)}>{m}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <Label className="text-xs text-muted-foreground">Ano</Label>
          <Select value={String(year)} onValueChange={(v) => setYear(Number(v))}>
            <SelectTrigger className="w-28"><SelectValue /></SelectTrigger>
            <SelectContent>
              {years.map(y => <SelectItem key={y} value={String(y)}>{y}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Print Header - only visible when printing */}
      <div className="hidden print:block text-center mb-6 border-b pb-4">
        <h1 className="text-2xl font-bold">InventoSys - Reporte Mensual</h1>
        <p className="text-lg">{MONTHS[month - 1]} {year}</p>
        <p className="text-sm text-gray-500">Generado el {new Date().toLocaleDateString("es-HN")}</p>
      </div>

      {isLoading ? (
        <div className="space-y-4">
          <Skeleton className="h-32 w-full" />
          <Skeleton className="h-48 w-full" />
        </div>
      ) : report ? (
        <div className="space-y-6 print-content">
          {/* Summary Cards */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <Card className="bg-primary text-primary-foreground border-none">
              <CardContent className="p-4">
                <div className="flex items-center gap-2 mb-2">
                  <DollarSign className="h-4 w-4 opacity-80" />
                  <span className="text-sm font-medium opacity-90">Total de Ventas</span>
                </div>
                <div className="text-2xl font-bold">{formatCurrency(report.totalIncome)}</div>
                <p className="text-xs mt-1 opacity-75">Ingresos brutos del mes</p>
              </CardContent>
            </Card>
            <Card className="border-green-500/40 bg-green-500/10">
              <CardContent className="p-4">
                <div className="flex items-center gap-2 mb-2 text-green-700 dark:text-green-400">
                  <TrendingUp className="h-4 w-4" />
                  <span className="text-sm font-medium">Ganancia Distribuible</span>
                </div>
                <div className="text-2xl font-bold text-green-700 dark:text-green-400">{formatCurrency(report.netProfit)}</div>
                <p className="text-xs mt-1 text-muted-foreground">Despues de costos y envios</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <div className="flex items-center gap-2 mb-2 text-muted-foreground">
                  <Package className="h-4 w-4" />
                  <span className="text-sm font-medium">Nro. de Ventas</span>
                </div>
                <div className="text-2xl font-bold">{report.totalSales}</div>
                <p className="text-xs mt-1 text-muted-foreground">Transacciones registradas</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <div className="flex items-center gap-2 mb-2 text-muted-foreground">
                  <DollarSign className="h-4 w-4" />
                  <span className="text-sm font-medium">Costo + Envios</span>
                </div>
                <div className="text-2xl font-bold text-muted-foreground">{formatCurrency(report.totalCost)}</div>
                <p className="text-xs mt-1 text-muted-foreground">Para reposicion de inventario</p>
              </CardContent>
            </Card>
          </div>

          {/* Profit First */}
          <Card>
            <CardHeader>
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <CardTitle>Distribucion Profit First</CardTitle>
                <p className="text-sm text-muted-foreground">
                  Base distribuible: <span className="font-semibold text-green-600 dark:text-green-400">{formatCurrency(report.netProfit)}</span>
                </p>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
                {[
                  { label: "Gastos Operativos", pct: 50, amount: report.profitFirst.operacion, color: "bg-blue-500", textColor: "text-blue-600 dark:text-blue-400", desc: "Para gastos del negocio" },
                  { label: "Dueno / Tu Pago", pct: 40, amount: report.profitFirst.dueno, color: "bg-purple-500", textColor: "text-purple-600 dark:text-purple-400", desc: "Tu remuneracion personal" },
                  { label: "Ganancia / Reserva", pct: 10, amount: report.profitFirst.ganancia, color: "bg-green-500", textColor: "text-green-600 dark:text-green-400", desc: "Fondo de reserva" },
                ].map(item => (
                  <div key={item.label} className="space-y-2">
                    <div className="flex justify-between text-sm">
                      <span className="font-medium">{item.label} ({item.pct}%)</span>
                    </div>
                    <div className="h-3 w-full bg-secondary rounded-full overflow-hidden">
                      <div className={`h-full ${item.color} rounded-full`} style={{ width: `${item.pct}%` }}></div>
                    </div>
                    <p className={`text-xl font-bold ${item.textColor}`}>{formatCurrency(item.amount)}</p>
                    <p className="text-xs text-muted-foreground">{item.desc}</p>
                  </div>
                ))}
              </div>
              <div className="pt-3 border-t grid grid-cols-3 gap-4 text-xs text-muted-foreground">
                <div>
                  <span className="block">Total ventas brutas</span>
                  <span className="font-semibold text-foreground">{formatCurrency(report.totalIncome)}</span>
                </div>
                <div>
                  <span className="block">Costo productos + envios</span>
                  <span className="font-semibold text-foreground">{formatCurrency(report.totalCost)}</span>
                </div>
                <div>
                  <span className="block">Ganancia bruta (base)</span>
                  <span className="font-semibold text-green-600 dark:text-green-400">{formatCurrency(report.netProfit)}</span>
                </div>
              </div>
            </CardContent>
          </Card>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Top Clients */}
            {report.topClients.length > 0 && (
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Users className="h-4 w-4" /> Mejores Clientes
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    {report.topClients.map((client, i) => (
                      <div key={i} className="flex justify-between items-center p-3 rounded-lg bg-muted/50">
                        <div>
                          <p className="font-medium text-sm">{client.clientName}</p>
                          <p className="text-xs text-muted-foreground">{client.salesCount} compras</p>
                        </div>
                        <span className="font-bold text-sm">{formatCurrency(client.totalPurchases)}</span>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Category Breakdown */}
            {report.categoryBreakdown.length > 0 && (
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Package className="h-4 w-4" /> Por Categoria
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    {report.categoryBreakdown.map((cat, i) => (
                      <div key={i} className="flex justify-between items-center p-3 rounded-lg bg-muted/50">
                        <div>
                          <p className="font-medium text-sm">{cat.category}</p>
                          <p className="text-xs text-muted-foreground">{cat.totalSales} unidades</p>
                        </div>
                        <span className="font-bold text-sm">{formatCurrency(cat.totalRevenue)}</span>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}
          </div>

          {/* Sales Table */}
          {report.sales.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>Detalle de Ventas</CardTitle>
              </CardHeader>
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
                        <th className="text-right font-medium px-4 py-3">Total</th>
                        <th className="text-right font-medium px-4 py-3">Ganancia</th>
                      </tr>
                    </thead>
                    <tbody>
                      {report.sales.map(sale => (
                        <tr key={sale.id} className="border-b hover:bg-muted/30 transition-colors">
                          <td className="px-4 py-2 text-muted-foreground whitespace-nowrap">
                            {new Date(sale.saleDate + "T12:00:00").toLocaleDateString("es-HN")}
                          </td>
                          <td className="px-4 py-2 max-w-[180px] truncate">{sale.productName}</td>
                          <td className="px-4 py-2 text-muted-foreground">{sale.clientName ?? "General"}</td>
                          <td className="px-4 py-2 text-center">
                            <Badge variant={sale.productType === "perfumeria" ? "default" : "secondary"} className="text-xs">
                              {sale.productType === "perfumeria" ? "Perf." : "Subli."}
                            </Badge>
                          </td>
                          <td className="px-4 py-2 text-center">{sale.quantity}</td>
                          <td className="px-4 py-2 text-right font-medium">{formatCurrency(sale.totalAmount)}</td>
                          <td className="px-4 py-2 text-right text-green-600 font-medium">{formatCurrency(sale.netProfit)}</td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr className="border-t font-semibold bg-muted/30">
                        <td colSpan={5} className="px-4 py-3 text-right">Totales:</td>
                        <td className="px-4 py-3 text-right">{formatCurrency(report.totalIncome)}</td>
                        <td className="px-4 py-3 text-right text-green-600">{formatCurrency(report.netProfit)}</td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      ) : (
        <div className="text-center py-16 text-muted-foreground">
          <FileText className="h-12 w-12 mx-auto mb-4 opacity-30" />
          <p>No hay datos para {MONTHS[month - 1]} {year}</p>
        </div>
      )}
    </div>
  );
}
