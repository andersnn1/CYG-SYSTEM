import { useState, useMemo, useEffect, useCallback, Fragment } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { useToast } from "@/hooks/use-toast";
import { useIsMobile } from "@/hooks/use-mobile";
import { useKeyboardHeight } from "@/hooks/use-keyboard-height";
import { formatCurrency } from "@/lib/format";
import { 
  Calculator, 
  Plus, 
  Trash2, 
  FileText, 
  Check, 
  Settings, 
  Lock, 
  Unlock, 
  RefreshCw, 
  ArrowRight, 
  Calendar,
  Building,
  TrendingUp,
  Scale,
  ChevronDown,
  ChevronUp,
  Printer,
  ChevronsUpDown
} from "lucide-react";

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

interface Account {
  id: string;
  code: string;
  name: string;
  type: "Asset" | "Liability" | "Equity" | "Revenue" | "Expense";
  subType: string | null;
  isSystemAccount: boolean;
  parentId?: string | null;
  isGroup?: boolean;
  createdAt: string;
}

interface JournalLine {
  id: string;
  debit: string;
  credit: string;
  accountCode: string;
  accountName: string;
}

interface JournalEntry {
  id: string;
  date: string;
  referenceSource: string | null;
  narration: string | null;
  total: number;
  lines: JournalLine[];
  createdAt: string;
}

interface Mapping {
  id: number;
  event: string;
  accountCode: string;
  direction: "DEBIT" | "CREDIT";
  valueType: "percentage" | "variable";
  valueExpression: string;
}

interface Period {
  id: number;
  year: number;
  month: number;
  isClosed: boolean;
  closedAt: string | null;
  closedBy: string | null;
}

// ── AccountCombobox ─────────────────────────────────────────
// Selector interactivo con búsqueda en tiempo real para cuentas contables
interface AccountComboboxProps {
  accounts: Account[];
  value: string;
  onChange: (value: string) => void;
}

function AccountCombobox({ accounts, value, onChange }: AccountComboboxProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");

  const selectedAccount = accounts.find(a => a.id === value);

  const filtered = useMemo(() => {
    if (!query.trim()) return accounts;
    const q = query.toLowerCase();
    return accounts.filter(
      a =>
        a.code.toLowerCase().includes(q) ||
        a.name.toLowerCase().includes(q) ||
        (a.subType && a.subType.toLowerCase().includes(q))
    );
  }, [accounts, query]);

  // Group by type for better navigation
  const grouped: Record<string, Account[]> = {};
  for (const acc of filtered) {
    if (!grouped[acc.type]) grouped[acc.type] = [];
    grouped[acc.type].push(acc);
  }

  const typeLabels: Record<string, string> = {
    Asset: "Activos",
    Liability: "Pasivos",
    Equity: "Patrimonio",
    Revenue: "Ingresos",
    Expense: "Gastos",
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className="w-full justify-between h-9 text-xs font-normal bg-background px-3"
        >
          {selectedAccount ? (
            <span className="flex items-center gap-1.5 truncate">
              <span className="font-mono font-semibold text-primary shrink-0">{selectedAccount.code}</span>
              <span className="text-muted-foreground truncate">— {selectedAccount.name}</span>
            </span>
          ) : (
            <span className="text-muted-foreground">Buscar cuenta contable...</span>
          )}
          <ChevronsUpDown className="ml-1 h-3.5 w-3.5 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        className="w-[90vw] sm:w-[380px] p-0"
        align="start"
        side="bottom"
        onWheelCapture={e => e.stopPropagation()}
        onTouchMoveCapture={e => e.stopPropagation()}
      >
        <Command shouldFilter={false}>
          <CommandInput
            placeholder="Buscar por código o nombre..."
            value={query}
            onValueChange={setQuery}
            className="h-9 text-sm"
          />
          <CommandList className="max-h-[260px] overflow-y-scroll">
            <CommandEmpty>
              <div className="py-4 text-center text-sm text-muted-foreground">
                No se encontraron cuentas con "{query}"
              </div>
            </CommandEmpty>
            {Object.entries(grouped).map(([type, accs]) => (
              <CommandGroup key={type} heading={typeLabels[type] || type}>
                {accs.map(acc => (
                  <CommandItem
                    key={acc.id}
                    value={acc.id}
                    onSelect={() => {
                      onChange(acc.id);
                      setOpen(false);
                      setQuery("");
                    }}
                    className="flex items-center gap-2 cursor-pointer"
                  >
                    <Check
                      className={`h-3.5 w-3.5 shrink-0 ${value === acc.id ? "opacity-100 text-primary" : "opacity-0"}`}
                    />
                    <span className="font-mono text-[11px] font-bold text-primary shrink-0 w-16">{acc.code}</span>
                    <span className="text-sm truncate flex-1">{acc.name}</span>
                    {acc.subType && (
                      <span className="text-[10px] text-muted-foreground shrink-0 hidden sm:inline">{acc.subType}</span>
                    )}
                  </CommandItem>
                ))}
              </CommandGroup>
            ))}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

export default function Contabilidad() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const isMobile = useIsMobile();
  const keyboardHeight = useKeyboardHeight();
  const [activeTab, setActiveTab] = useState("entries");
  const [expandedEntries, setExpandedEntries] = useState<Record<string, boolean>>({});
  const [entryFilter, setEntryFilter] = useState<"all" | "manual" | "invoice" | "expense">("all");
  const [selectedAccountForDrawer, setSelectedAccountForDrawer] = useState<Account | null>(null);
  const [isAccountDrawerOpen, setIsAccountDrawerOpen] = useState(false);

  // Queries
  const { data: accounts = [], isLoading: isLoadingAccounts } = useQuery<Account[]>({
    queryKey: ["accounts"],
    queryFn: () => apiFetch("/accounting/accounts"),
  });

  const { data: entries = [], isLoading: isLoadingEntries } = useQuery<JournalEntry[]>({
    queryKey: ["journal-entries"],
    queryFn: () => apiFetch("/accounting/journal-entries"),
  });

  const { data: mappings = [], isLoading: isLoadingMappings } = useQuery<Mapping[]>({
    queryKey: ["mappings"],
    queryFn: () => apiFetch("/accounting/mappings"),
  });

  const { data: periods = [], isLoading: isLoadingPeriods } = useQuery<Period[]>({
    queryKey: ["periods"],
    queryFn: () => apiFetch("/accounting/periods"),
  });

  const [kpiPeriod, setKpiPeriod] = useState<string>(() => {
    const now = new Date();
    const mm = String(now.getMonth() + 1).padStart(2, "0");
    return `${now.getFullYear()}-${mm}`;
  });

  const periodOptions = useMemo(() => {
    const list: { value: string; label: string }[] = [{ value: "all", label: "Histórico Completo" }];
    const now = new Date();
    for (let i = 0; i < 12; i++) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const value = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      const label = d.toLocaleString("es-ES", { month: "long", year: "numeric" });
      list.push({ value, label: label.charAt(0).toUpperCase() + label.slice(1) });
    }
    return list;
  }, []);

  // State for forms
  const [accountDialogOpen, setAccountDialogOpen] = useState(false);
  const [entryDialogOpen, setEntryDialogOpen] = useState(false);

  useEffect(() => {
    (window as any).__openNewEntry = () => {
      setEntryDialogOpen(true);
    };
    return () => {
      delete (window as any).__openNewEntry;
    };
  }, []);
  const [newAccount, setNewAccount] = useState({
    code: "",
    name: "",
    type: "Asset" as Account["type"],
    subType: "",
  });

  const [newEntry, setNewEntry] = useState({
    date: new Date().toISOString().split("T")[0],
    narration: "",
    referenceSource: "Manual",
    lines: [
      { accountId: "", debit: 0, credit: 0 },
      { accountId: "", debit: 0, credit: 0 },
    ],
  });

  // Reports filters
  const [balanceDate, setBalanceDate] = useState(new Date().toISOString().split("T")[0]);
  const [reportRange, setReportRange] = useState({
    startDate: `${new Date().getFullYear()}-01-01`,
    endDate: new Date().toISOString().split("T")[0],
  });
  const [selectedLedgerAccount, setSelectedLedgerAccount] = useState("");

  // Report Queries
  const { data: balanceSheet, refetch: refetchBalanceSheet, isFetching: isFetchingBalance } = useQuery({
    queryKey: ["balance-sheet", balanceDate],
    queryFn: () => apiFetch(`/accounting/reports/balance-sheet?date=${balanceDate}`),
    enabled: activeTab === "reports",
  });

  const { data: incomeStatement, refetch: refetchIncome, isFetching: isFetchingIncome } = useQuery({
    queryKey: ["income-statement", reportRange.startDate, reportRange.endDate],
    queryFn: () => apiFetch(`/accounting/reports/income-statement?startDate=${reportRange.startDate}&endDate=${reportRange.endDate}`),
    enabled: activeTab === "reports",
  });

  const { data: ledgerReport, refetch: refetchLedger, isFetching: isFetchingLedger } = useQuery({
    queryKey: ["ledger", selectedLedgerAccount, reportRange.startDate, reportRange.endDate],
    queryFn: () => apiFetch(`/accounting/reports/general-ledger?accountId=${selectedLedgerAccount}&startDate=${reportRange.startDate}&endDate=${reportRange.endDate}`),
    enabled: activeTab === "reports" && !!selectedLedgerAccount,
  });

  // Actions
  const handleCreateAccount = async () => {
    if (!newAccount.code || !newAccount.name || !newAccount.type) {
      toast({ title: "Error", description: "Todos los campos son obligatorios", variant: "destructive" });
      return;
    }
    try {
      await apiFetch("/accounting/accounts", {
        method: "POST",
        body: JSON.stringify(newAccount),
      });
      toast({ title: "Cuenta registrada", description: "La cuenta se ha guardado en el catálogo contable." });
      setAccountDialogOpen(false);
      setNewAccount({ code: "", name: "", type: "Asset", subType: "" });
      queryClient.invalidateQueries({ queryKey: ["accounts"] });
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    }
  };

  const handleAddEntryLine = () => {
    setNewEntry({
      ...newEntry,
      lines: [...newEntry.lines, { accountId: "", debit: 0, credit: 0 }],
    });
  };

  const handleRemoveEntryLine = (index: number) => {
    if (newEntry.lines.length <= 2) return;
    const nextLines = [...newEntry.lines];
    nextLines.splice(index, 1);
    setNewEntry({ ...newEntry, lines: nextLines });
  };

  const handleAutoBalance = () => {
    const totalDebit = newEntry.lines.reduce((sum, l) => sum + l.debit, 0);
    const totalCredit = newEntry.lines.reduce((sum, l) => sum + l.credit, 0);
    const difference = Math.abs(totalDebit - totalCredit);
    if (difference <= 0.01) {
      toast({ title: "Asiento Cuadrado", description: "El asiento ya está cuadrado." });
      return;
    }

    if (totalDebit > totalCredit) {
      setNewEntry({
        ...newEntry,
        lines: [...newEntry.lines, { accountId: "", debit: 0, credit: Number(difference.toFixed(2)) }],
      });
    } else {
      setNewEntry({
        ...newEntry,
        lines: [...newEntry.lines, { accountId: "", debit: Number(difference.toFixed(2)), credit: 0 }],
      });
    }
  };

  const handleLineChange = (index: number, field: "accountId" | "debit" | "credit", value: any) => {
    const nextLines = [...newEntry.lines];
    nextLines[index] = {
      ...nextLines[index],
      [field]: field === "accountId" ? value : parseFloat(value) || 0,
    };
    setNewEntry({ ...newEntry, lines: nextLines });
  };

  const handleCreateEntry = async () => {
    const totalDebit = newEntry.lines.reduce((sum, l) => sum + l.debit, 0);
    const totalCredit = newEntry.lines.reduce((sum, l) => sum + l.credit, 0);

    if (Math.abs(totalDebit - totalCredit) > 0.01) {
      toast({ title: "Error de Balance", description: `El asiento no está cuadrado. Debe: ${formatCurrency(totalDebit)} | Haber: ${formatCurrency(totalCredit)}`, variant: "destructive" });
      return;
    }

    if (totalDebit <= 0) {
      toast({ title: "Error", description: "El monto del asiento debe ser mayor que cero.", variant: "destructive" });
      return;
    }

    if (newEntry.lines.some(l => !l.accountId)) {
      toast({ title: "Error", description: "Debe seleccionar una cuenta para todas las líneas.", variant: "destructive" });
      return;
    }

    try {
      await apiFetch("/accounting/journal-entries", {
        method: "POST",
        body: JSON.stringify(newEntry),
      });
      toast({ title: "Asiento registrado", description: "El asiento diario se ha ingresado con éxito." });
      setEntryDialogOpen(false);
      setNewEntry({
        date: new Date().toISOString().split("T")[0],
        narration: "",
        referenceSource: "Manual",
        lines: [
          { accountId: "", debit: 0, credit: 0 },
          { accountId: "", debit: 0, credit: 0 },
        ],
      });
      queryClient.invalidateQueries({ queryKey: ["journal-entries"] });
      queryClient.invalidateQueries({ queryKey: ["balance-sheet"] });
      queryClient.invalidateQueries({ queryKey: ["income-statement"] });
      queryClient.invalidateQueries({ queryKey: ["ledger"] });
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    }
  };

  const handleTogglePeriod = async (year: number, month: number, currentStatus: boolean) => {
    try {
      await apiFetch("/accounting/periods/toggle", {
        method: "POST",
        body: JSON.stringify({
          year,
          month,
          isClosed: !currentStatus,
          closedBy: "Admin",
        }),
      });
      toast({ title: `Período ${!currentStatus ? "Cerrado" : "Abierto"}`, description: `El mes ${month}/${year} ha sido actualizado.` });
      queryClient.invalidateQueries({ queryKey: ["periods"] });
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    }
  };

  const handleDeleteEntry = async (id: string) => {
    if (window.confirm("¿Está seguro de que desea eliminar este asiento contable? Esta acción no se puede deshacer.")) {
      try {
        await apiFetch(`/accounting/journal-entries/${id}`, {
          method: "DELETE",
        });
        toast({ title: "Asiento eliminado", description: "El asiento diario se ha eliminado con éxito." });
        queryClient.invalidateQueries({ queryKey: ["journal-entries"] });
        queryClient.invalidateQueries({ queryKey: ["balance-sheet"] });
        queryClient.invalidateQueries({ queryKey: ["income-statement"] });
        queryClient.invalidateQueries({ queryKey: ["ledger"] });
      } catch (err: any) {
        toast({ title: "Error al eliminar", description: err.message, variant: "destructive" });
      }
    }
  };

  const handlePrintVoucher = (entry: JournalEntry) => {
    const printWindow = window.open("", "_blank");
    if (!printWindow) return;

    const linesHtml = entry.lines.map(line => `
      <tr>
        <td style="padding: 10px; border: 1px solid #ddd; font-family: monospace; font-size: 13px;">${line.accountCode}</td>
        <td style="padding: 10px; border: 1px solid #ddd; font-size: 13px;">${line.accountName}</td>
        <td style="padding: 10px; border: 1px solid #ddd; text-align: right; font-family: monospace; font-size: 13px;">${parseFloat(line.debit) > 0 ? 'L. ' + parseFloat(line.debit).toLocaleString('es-HN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '-'}</td>
        <td style="padding: 10px; border: 1px solid #ddd; text-align: right; font-family: monospace; font-size: 13px;">${parseFloat(line.credit) > 0 ? 'L. ' + parseFloat(line.credit).toLocaleString('es-HN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '-'}</td>
      </tr>
    `).join('');

    const totalDebit = entry.lines.reduce((s, l) => s + parseFloat(l.debit), 0).toLocaleString('es-HN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    const totalCredit = entry.lines.reduce((s, l) => s + parseFloat(l.credit), 0).toLocaleString('es-HN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

    const ref = entry.referenceSource || 'Manual';
    let voucherType = "PÓLIZA DE DIARIO";
    if (ref.startsWith("InvoicePayment_")) voucherType = "PÓLIZA DE INGRESO (COBRO)";
    else if (ref.startsWith("Expense_")) voucherType = "PÓLIZA DE EGRESO (GASTO)";

    printWindow.document.write(`
      <html>
        <head>
          <title>Comprobante Contable - ${ref}</title>
          <style>
            body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; margin: 40px; color: #333; line-height: 1.5; }
            .header-container { display: flex; justify-content: space-between; align-items: center; border-bottom: 3px double #333; padding-bottom: 15px; margin-bottom: 20px; }
            .company-info h1 { margin: 0; font-size: 24px; font-weight: 800; text-transform: uppercase; letter-spacing: 1px; color: #1e3a8a; }
            .company-info p { margin: 2px 0 0 0; font-size: 11px; color: #666; font-weight: bold; text-transform: uppercase; }
            .voucher-title { text-align: right; }
            .voucher-title h2 { margin: 0; font-size: 16px; color: #1e3a8a; font-weight: 800; letter-spacing: 0.5px; }
            .voucher-title p { margin: 4px 0 0 0; font-family: monospace; font-size: 14px; font-weight: bold; color: #ef4444; }
            
            .meta-table { width: 100%; border-collapse: collapse; margin-bottom: 25px; background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; }
            .meta-table td { padding: 12px; font-size: 13px; vertical-align: top; border-bottom: 1px solid #e2e8f0; }
            
            .lines-table { width: 100%; border-collapse: collapse; margin-bottom: 40px; box-shadow: 0 1px 3px rgba(0,0,0,0.05); }
            .lines-table th { background-color: #1e3a8a; color: white; padding: 12px 10px; font-size: 12px; text-transform: uppercase; font-weight: bold; border: 1px solid #1e3a8a; }
            .lines-table td { border: 1px solid #e2e8f0; }
            .totals-row { font-weight: 800; background-color: #f1f5f9; }
            .totals-row td { border-top: 2px solid #1e3a8a; border-bottom: 2px solid #1e3a8a; padding: 12px 10px; }
            
            .signatures-container { display: flex; justify-content: space-between; margin-top: 80px; gap: 40px; }
            .signature-box { border-top: 1.5px solid #475569; flex: 1; text-align: center; padding-top: 10px; font-size: 11px; font-weight: bold; text-transform: uppercase; color: #475569; }
            
            @media print {
              body { margin: 20px; }
              .meta-table { background-color: transparent !important; }
              .totals-row { background-color: #f1f5f9 !important; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
            }
          </style>
        </head>
        <body>
          <div class="header-container">
            <div class="company-info">
              <h1>C&G Electronics</h1>
              <p>Sistema Integrado de Control y Facturación</p>
            </div>
            <div class="voucher-title">
              <h2>${voucherType}</h2>
              <p>REF: ${ref}</p>
            </div>
          </div>
          
          <table class="meta-table">
            <tr>
              <td style="width: 50%;"><strong>Fecha Contable:</strong> ${entry.date}</td>
              <td style="width: 50%;"><strong>Fecha de Registro:</strong> ${new Date(entry.createdAt).toLocaleString('es-HN')}</td>
            </tr>
            <tr>
              <td colspan="2"><strong>Concepto / Glosa:</strong> ${entry.narration || 'Sin descripción'}</td>
            </tr>
          </table>
          
          <table class="lines-table">
            <thead>
              <tr>
                <th style="width: 15%; text-align: left;">Código</th>
                <th style="text-align: left;">Cuenta Contable</th>
                <th style="text-align: right; width: 25%;">Debe</th>
                <th style="text-align: right; width: 25%;">Haber</th>
              </tr>
            </thead>
            <tbody>
              ${linesHtml}
              <tr class="totals-row">
                <td colspan="2" style="text-align: right;">TOTALES</td>
                <td style="text-align: right; font-family: monospace;">L. ${totalDebit}</td>
                <td style="text-align: right; font-family: monospace;">L. ${totalCredit}</td>
              </tr>
            </tbody>
          </table>

          <div class="signatures-container">
            <div class="signature-box">Hecho Por</div>
            <div class="signature-box">Revisado Por</div>
            <div class="signature-box">Aprobado Por</div>
          </div>

          <script>
            window.onload = function() {
              window.print();
              setTimeout(() => { window.close(); }, 500);
            }
          </script>
        </body>
      </html>
    `);
    printWindow.document.close();
  };

  const toggleExpandEntry = (id: string) => {
    setExpandedEntries(prev => ({
      ...prev,
      [id]: !prev[id],
    }));
  };

  const filteredEntries = useMemo(() => {
    if (entryFilter === "all") return entries;
    return entries.filter(entry => {
      const ref = entry.referenceSource || "";
      if (entryFilter === "manual") {
        return !ref || ref === "Manual" || ref.startsWith("Manual");
      }
      if (entryFilter === "invoice") {
        return ref.startsWith("Invoice_") || ref.startsWith("InvoicePayment_");
      }
      if (entryFilter === "expense") {
        return ref.startsWith("Expense_");
      }
      return true;
    });
  }, [entries, entryFilter]);

  const handleGoToLedger = (accountId: string) => {
    setSelectedLedgerAccount(accountId);
    setActiveTab("reports");
    setTimeout(() => {
      queryClient.invalidateQueries({ queryKey: ["ledger", accountId] });
    }, 100);
  };

  const handleOpenAccountDrawer = (accountCode: string) => {
    const acc = accounts.find(a => a.code === accountCode);
    if (acc) {
      setSelectedAccountForDrawer(acc);
      setIsAccountDrawerOpen(true);
    }
  };

  const accountTransactions = useMemo(() => {
    if (!selectedAccountForDrawer) return [];
    const code = selectedAccountForDrawer.code;
    const list: any[] = [];
    const sortedEntries = [...entries].sort((a, b) => {
      const dateCompare = b.date.localeCompare(a.date);
      if (dateCompare !== 0) return dateCompare;
      return b.createdAt.localeCompare(a.createdAt);
    });
    for (const entry of sortedEntries) {
      const line = entry.lines.find(l => l.accountCode === code);
      if (line) {
        list.push({
          id: entry.id,
          date: entry.date,
          referenceSource: entry.referenceSource,
          narration: entry.narration,
          debit: parseFloat(line.debit),
          credit: parseFloat(line.credit),
        });
      }
    }
    return list;
  }, [entries, selectedAccountForDrawer]);

  const currentAccountBalance = useMemo(() => {
    if (!selectedAccountForDrawer) return 0;
    const type = selectedAccountForDrawer.type;
    let totalDebit = 0;
    let totalCredit = 0;
    for (const entry of entries) {
      for (const line of entry.lines) {
        if (line.accountCode === selectedAccountForDrawer.code) {
          totalDebit += parseFloat(line.debit);
          totalCredit += parseFloat(line.credit);
        }
      }
    }
    if (type === "Asset" || type === "Expense") {
      return totalDebit - totalCredit;
    } else {
      return totalCredit - totalDebit;
    }
  }, [entries, selectedAccountForDrawer]);

  const accountBalancesMap = useMemo(() => {
    const balances: Record<string, number> = {};
    for (const acc of accounts) {
      balances[acc.code] = 0;
    }
    const debits: Record<string, number> = {};
    const credits: Record<string, number> = {};
    for (const entry of entries) {
      if (kpiPeriod !== "all") {
        if (!entry.date.startsWith(kpiPeriod)) {
          continue;
        }
      }
      for (const line of entry.lines) {
        debits[line.accountCode] = (debits[line.accountCode] || 0) + parseFloat(line.debit || "0");
        credits[line.accountCode] = (credits[line.accountCode] || 0) + parseFloat(line.credit || "0");
      }
    }
    for (const acc of accounts) {
      const d = debits[acc.code] || 0;
      const c = credits[acc.code] || 0;
      if (acc.type === "Asset" || acc.type === "Expense") {
        balances[acc.code] = d - c;
      } else {
        balances[acc.code] = c - d;
      }
    }
    return balances;
  }, [accounts, entries, kpiPeriod]);

  const financialKPIs = useMemo(() => {
    let totalAssets = 0;
    let totalLiabilities = 0;
    let totalEquity = 0;
    let totalRevenues = 0;
    let totalExpenses = 0;
    for (const acc of accounts) {
      if (acc.isGroup) continue;
      const bal = accountBalancesMap[acc.code] || 0;
      if (acc.type === "Asset") totalAssets += bal;
      else if (acc.type === "Liability") totalLiabilities += bal;
      else if (acc.type === "Equity") totalEquity += bal;
      else if (acc.type === "Revenue") totalRevenues += bal;
      else if (acc.type === "Expense") totalExpenses += bal;
    }
    const netProfit = totalRevenues - totalExpenses;
    const liquidityRatio = totalLiabilities > 0 ? totalAssets / totalLiabilities : totalAssets > 0 ? 99.9 : 0;
    const debtRatio = totalAssets > 0 ? (totalLiabilities / totalAssets) * 100 : 0;
    return {
      totalAssets,
      totalLiabilities,
      totalEquity,
      totalRevenues,
      totalExpenses,
      netProfit,
      liquidityRatio,
      debtRatio,
    };
  }, [accounts, accountBalancesMap]);

  // Classify accounts for tree view
  const categorizedAccounts = {
    Asset: accounts.filter(a => a.type === "Asset"),
    Liability: accounts.filter(a => a.type === "Liability"),
    Equity: accounts.filter(a => a.type === "Equity"),
    Revenue: accounts.filter(a => a.type === "Revenue"),
    Expense: accounts.filter(a => a.type === "Expense"),
  };

  const accountTypeLabels = {
    Asset: "Activos",
    Liability: "Pasivos",
    Equity: "Patrimonio",
    Revenue: "Ingresos",
    Expense: "Gastos",
  };

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
      
      {/* Header */}
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight flex items-center gap-2">
            <Calculator className="h-6 w-6 sm:h-8 sm:w-8 text-primary flex-shrink-0" />
            Contabilidad
          </h1>
          <p className="text-muted-foreground mt-1 text-sm sm:text-base">Catálogo contable, libro diario, bloqueo de periodos e informes financieros</p>
        </div>
      </div>

      <Tabs value={activeTab} className="space-y-6" onValueChange={setActiveTab}>
        <div className="border-b">
          <TabsList className="bg-transparent border-0 h-11 p-0 gap-6 w-full justify-start overflow-x-auto flex-nowrap [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]">
            <TabsTrigger value="entries" className="border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent rounded-none px-1 pb-2 h-11 font-semibold text-muted-foreground data-[state=active]:text-foreground whitespace-nowrap shrink-0">
              Libro Diario
            </TabsTrigger>
            <TabsTrigger value="catalog" className="border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent rounded-none px-1 pb-2 h-11 font-semibold text-muted-foreground data-[state=active]:text-foreground whitespace-nowrap shrink-0">
              Catálogo de Cuentas
            </TabsTrigger>
            <TabsTrigger value="reports" className="border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent rounded-none px-1 pb-2 h-11 font-semibold text-muted-foreground data-[state=active]:text-foreground whitespace-nowrap shrink-0">
              Estados Financieros
            </TabsTrigger>
            <TabsTrigger value="config" className="border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent rounded-none px-1 pb-2 h-11 font-semibold text-muted-foreground data-[state=active]:text-foreground whitespace-nowrap shrink-0">
              Reglas y Períodos
            </TabsTrigger>
          </TabsList>
        </div>

        {/* ── 1. Libro Diario ────────────────────────────────────── */}
        <TabsContent value="entries" className="space-y-6 outline-none">
          <div className="flex justify-between items-center flex-wrap gap-3">
            <h2 className="text-lg font-bold">Asientos Registrados</h2>
            <Button onClick={() => setEntryDialogOpen(true)} className="gap-2 h-10">
              <Plus className="h-4 w-4" />
              Nuevo Asiento Manual
            </Button>
          </div>

          {/* Filtros Rápidos */}
          <div className="flex gap-1.5 flex-wrap bg-muted/30 p-1.5 rounded-xl border">
            <Button
              variant={entryFilter === "all" ? "default" : "ghost"}
              size="sm"
              onClick={() => setEntryFilter("all")}
              className="text-xs h-8 px-3 rounded-lg"
            >
              Todos
            </Button>
            <Button
              variant={entryFilter === "manual" ? "default" : "ghost"}
              size="sm"
              onClick={() => setEntryFilter("manual")}
              className="text-xs h-8 px-3 rounded-lg"
            >
              Manuales
            </Button>
            <Button
              variant={entryFilter === "invoice" ? "default" : "ghost"}
              size="sm"
              onClick={() => setEntryFilter("invoice")}
              className="text-xs h-8 px-3 rounded-lg"
            >
              Facturación y Cobros
            </Button>
            <Button
              variant={entryFilter === "expense" ? "default" : "ghost"}
              size="sm"
              onClick={() => setEntryFilter("expense")}
              className="text-xs h-8 px-3 rounded-lg"
            >
              Gastos
            </Button>
          </div>

          <Card>
            <CardContent className="p-0">
              {isLoadingEntries ? (
                <div className="p-8 text-center text-muted-foreground">Cargando libro diario...</div>
              ) : filteredEntries.length === 0 ? (
                <div className="p-12 text-center text-muted-foreground">No hay asientos contables registrados para este filtro.</div>
              ) : isMobile ? (
                <div className="space-y-4 p-2 sm:p-4">
                  {filteredEntries.map(entry => {
                    const isExpanded = !!expandedEntries[entry.id];
                    const totalDebit = entry.lines.reduce((s, l) => s + parseFloat(l.debit), 0);
                    const totalCredit = entry.lines.reduce((s, l) => s + parseFloat(l.credit), 0);
                    const accountsCount = entry.lines.length;

                    return (
                      <div key={entry.id} className="bg-card border rounded-xl overflow-hidden shadow-sm transition-all duration-200">
                        {/* Summary Header */}
                        <div 
                          onClick={() => toggleExpandEntry(entry.id)}
                          className="p-4 space-y-3 cursor-pointer hover:bg-muted/10 transition-colors"
                        >
                          <div className="flex items-center justify-between gap-2">
                            <span className="text-xs font-mono font-bold text-muted-foreground">{entry.date}</span>
                            <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[9px] font-black border uppercase tracking-wider ${
                              entry.referenceSource?.startsWith("InvoicePayment_")
                                ? "bg-green-100 text-green-700 border-green-200 dark:bg-green-950 dark:text-green-300 dark:border-green-800"
                                : entry.referenceSource?.startsWith("Invoice_")
                                ? "bg-blue-100 text-blue-700 border-blue-200 dark:bg-blue-950 dark:text-blue-300 dark:border-blue-800"
                                : entry.referenceSource?.startsWith("Expense_")
                                ? "bg-amber-100 text-amber-700 border-amber-200 dark:bg-amber-950 dark:text-amber-300 dark:border-amber-800"
                                : "bg-primary/10 text-primary border-primary/20"
                            }`}>
                              {entry.referenceSource?.startsWith("InvoicePayment_")
                                ? "Cobro Factura"
                                : entry.referenceSource?.startsWith("Invoice_")
                                ? "Emisión Factura"
                                : entry.referenceSource?.startsWith("Expense_")
                                ? "Gasto"
                                : entry.referenceSource || "Manual"}
                            </span>
                          </div>

                          <div className="space-y-1">
                            <p className="font-bold text-sm text-foreground leading-snug break-words">
                              {entry.narration || "Sin descripción"}
                            </p>
                            <div className="flex items-center justify-between pt-1">
                              <span className="text-[10px] text-muted-foreground font-medium bg-muted px-2 py-0.5 rounded-md border">
                                {accountsCount} {accountsCount === 1 ? "cuenta" : "cuentas"}
                              </span>
                              <span className="text-sm font-black text-foreground">{formatCurrency(entry.total)}</span>
                            </div>
                          </div>
                        </div>

                        {/* Expandable double-entry visual feed */}
                        {isExpanded && (
                          <div className="border-t bg-muted/5 p-4 space-y-4 animate-in fade-in slide-in-from-top-2 duration-200">
                            <div className="flex justify-between items-center border-b pb-2">
                              <span className="text-[10px] font-black text-muted-foreground uppercase tracking-wider">Detalle de Asiento</span>
                              <button
                                onClick={() => handlePrintVoucher(entry)}
                                className="inline-flex items-center gap-1 text-[10px] font-bold text-blue-600 hover:text-blue-800 dark:text-blue-400 border-none bg-transparent cursor-pointer"
                              >
                                <Printer className="h-3 w-3" /> Comprobante
                              </button>
                            </div>

                            {/* Feed vertical */}
                            <div className="space-y-2.5">
                              {entry.lines.map(line => {
                                const isDebit = parseFloat(line.debit) > 0;
                                return (
                                  <div 
                                    key={line.id} 
                                    className={`flex flex-col p-2.5 rounded-lg border ${
                                      isDebit 
                                        ? "bg-green-50/40 border-green-100 dark:bg-green-950/10 dark:border-green-900/30" 
                                        : "bg-blue-50/40 border-blue-100 dark:bg-blue-950/10 dark:border-blue-900/30 ml-4"
                                    }`}
                                  >
                                    <div className="flex items-start justify-between gap-2">
                                      <div className="min-w-0">
                                        <span className="text-[10px] font-mono font-bold text-muted-foreground block mb-0.5">{line.accountCode}</span>
                                        <button 
                                          onClick={() => handleOpenAccountDrawer(line.accountCode)}
                                          className="text-xs font-semibold text-left text-foreground hover:text-primary hover:underline truncate max-w-full block bg-transparent border-none p-0 cursor-pointer"
                                        >
                                          {line.accountName}
                                        </button>
                                      </div>
                                      <span className={`text-xs font-black shrink-0 ${isDebit ? "text-green-600 dark:text-green-400" : "text-blue-600 dark:text-blue-400"}`}>
                                        {isDebit ? `Debe: ${formatCurrency(parseFloat(line.debit))}` : `Haber: ${formatCurrency(parseFloat(line.credit))}`}
                                      </span>
                                    </div>
                                  </div>
                                );
                              })}
                            </div>

                            {/* Totales Card */}
                            <div className="bg-background rounded-lg border p-3 flex justify-between items-center text-xs font-bold shadow-sm">
                              <span className="uppercase text-[10px] text-muted-foreground tracking-wider">Balance</span>
                              <div className="flex gap-4">
                                <span className="text-green-600 dark:text-green-400 font-mono">D: {formatCurrency(totalDebit)}</span>
                                <span className="text-blue-600 dark:text-blue-400 font-mono">H: {formatCurrency(totalCredit)}</span>
                              </div>
                            </div>

                            {/* Actions Footer */}
                            {!(entry.referenceSource?.startsWith("Invoice_") || entry.referenceSource?.startsWith("InvoicePayment_") || entry.referenceSource?.startsWith("Expense_")) && (
                              <div className="flex justify-end pt-2 border-t mt-1">
                                <Button
                                  variant="destructive"
                                  size="sm"
                                  onClick={() => handleDeleteEntry(entry.id)}
                                  className="h-8 text-xs font-bold uppercase tracking-wider w-full gap-1.5"
                                >
                                  <Trash2 className="h-3.5 w-3.5" /> Eliminar Asiento
                                </Button>
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="overflow-x-auto w-full">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Fecha</TableHead>
                        <TableHead>Referencia</TableHead>
                        <TableHead>Descripción / Narración</TableHead>
                        <TableHead className="text-right">Monto total</TableHead>
                        <TableHead className="w-24"></TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredEntries.map(entry => {
                        const isExpanded = !!expandedEntries[entry.id];
                        const totalDebit = entry.lines.reduce((s, l) => s + parseFloat(l.debit), 0);
                        const totalCredit = entry.lines.reduce((s, l) => s + parseFloat(l.credit), 0);
                        const accountsCount = entry.lines.length;

                        return (
                          <Fragment key={entry.id}>
                            <TableRow className="hover:bg-muted/30 cursor-pointer" onClick={() => toggleExpandEntry(entry.id)}>
                              <TableCell className="font-medium align-middle">{entry.date}</TableCell>
                              <TableCell className="align-middle">
                                <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold border uppercase tracking-wider ${
                                  entry.referenceSource?.startsWith("InvoicePayment_")
                                    ? "bg-green-100 text-green-700 border-green-200 dark:bg-green-950 dark:text-green-300 dark:border-green-800"
                                    : entry.referenceSource?.startsWith("Invoice_")
                                    ? "bg-blue-100 text-blue-700 border-blue-200 dark:bg-blue-950 dark:text-blue-300 dark:border-blue-800"
                                    : entry.referenceSource?.startsWith("Expense_")
                                    ? "bg-amber-100 text-amber-700 border-amber-200 dark:bg-amber-950 dark:text-amber-300 dark:border-amber-800"
                                    : "bg-primary/10 text-primary border-primary/20"
                                }`}>
                                  {entry.referenceSource?.startsWith("InvoicePayment_")
                                    ? "Cobro Factura"
                                    : entry.referenceSource?.startsWith("Invoice_")
                                    ? "Emisión Factura"
                                    : entry.referenceSource?.startsWith("Expense_")
                                    ? "Gasto"
                                    : entry.referenceSource || "Manual"}
                                </span>
                              </TableCell>
                              <TableCell className="align-middle min-w-0">
                                <div className="flex items-center gap-2 min-w-0">
                                  <p className="font-semibold text-foreground truncate max-w-[120px] sm:max-w-none" title={entry.narration || "Sin descripción"}>
                                    {entry.narration || "Sin descripción"}
                                  </p>
                                  <span className="text-[9px] text-muted-foreground bg-muted px-1.5 py-0.5 rounded border leading-none shrink-0">
                                    {accountsCount} {isMobile ? "ctas" : "cuentas"}
                                  </span>
                                </div>
                              </TableCell>
                              <TableCell className="text-right font-bold align-middle">{formatCurrency(entry.total)}</TableCell>
                              <TableCell className="align-middle text-right" onClick={e => e.stopPropagation()}>
                                <div className="flex items-center justify-end gap-1">
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    onClick={() => handlePrintVoucher(entry)}
                                    className="h-8 w-8 text-muted-foreground hover:text-foreground"
                                    title="Imprimir Comprobante Contable"
                                  >
                                    <Printer className="h-4 w-4" />
                                  </Button>
                                  {!(entry.referenceSource?.startsWith("Invoice_") || entry.referenceSource?.startsWith("InvoicePayment_") || entry.referenceSource?.startsWith("Expense_")) && (
                                    <Button
                                      variant="ghost"
                                      size="icon"
                                      onClick={() => handleDeleteEntry(entry.id)}
                                      className="h-8 w-8 text-destructive hover:bg-destructive/10"
                                      title="Eliminar asiento"
                                    >
                                      <Trash2 className="h-4 w-4" />
                                    </Button>
                                  )}
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    onClick={() => toggleExpandEntry(entry.id)}
                                    className="h-8 w-8"
                                  >
                                    {isExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                                  </Button>
                                </div>
                              </TableCell>
                            </TableRow>
                            
                            {/* Fila de detalle expandida */}
                            {isExpanded && (
                              <TableRow className="bg-muted/10 hover:bg-muted/10">
                                <TableCell colSpan={5} className="p-4 border-t-0">
                                  <div className="space-y-3 animate-in fade-in slide-in-from-top-2 duration-200">
                                    <div className="flex justify-between items-center border-b pb-2">
                                      <span className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Desglose de Partida Doble</span>
                                      <span className="text-xs text-muted-foreground">ID Asiento: <span className="font-mono text-[10px] bg-muted px-1.5 py-0.5 rounded border">{entry.id}</span></span>
                                    </div>
                                    
                                    <div className="border rounded-xl overflow-hidden bg-background shadow-sm">
                                      <Table>
                                        <TableHeader className="bg-muted/40">
                                          <TableRow>
                                            <TableHead className="text-xs h-9 py-0">Código</TableHead>
                                            <TableHead className="text-xs h-9 py-0">Cuenta Contable</TableHead>
                                            <TableHead className="text-right text-xs h-9 py-0">Debe (L.)</TableHead>
                                            <TableHead className="text-right text-xs h-9 py-0">Haber (L.)</TableHead>
                                          </TableRow>
                                        </TableHeader>
                                        <TableBody>
                                          {entry.lines.map(line => {
                                            const isDebit = parseFloat(line.debit) > 0;
                                            return (
                                              <TableRow key={line.id} className="hover:bg-transparent">
                                                <TableCell className="font-mono text-xs font-semibold py-2">{line.accountCode}</TableCell>
                                                <TableCell className={`py-2 ${!isDebit ? "pl-8 text-muted-foreground" : "font-semibold"}`}>
                                                  <div className="flex items-center gap-1">
                                                    {!isDebit && <span className="inline-block mr-1 opacity-50">└─</span>}
                                                    <button 
                                                      onClick={() => handleOpenAccountDrawer(line.accountCode)}
                                                      className={`text-sm font-medium text-left hover:underline bg-transparent border-none p-0 cursor-pointer ${
                                                        !isDebit 
                                                          ? "text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-300" 
                                                          : "text-blue-600 hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-300"
                                                      }`}
                                                      title="Ver detalle de esta cuenta"
                                                    >
                                                      {line.accountName}
                                                    </button>
                                                  </div>
                                                </TableCell>
                                                <TableCell className="text-right font-mono text-xs text-green-600 dark:text-green-400 py-2">
                                                  {parseFloat(line.debit) > 0 ? formatCurrency(parseFloat(line.debit)) : "—"}
                                                </TableCell>
                                                <TableCell className="text-right font-mono text-xs text-blue-600 dark:text-blue-400 py-2">
                                                  {parseFloat(line.credit) > 0 ? formatCurrency(parseFloat(line.credit)) : "—"}
                                                </TableCell>
                                              </TableRow>
                                            );
                                          })}
                                          <TableRow className="bg-muted/20 font-bold border-t-2">
                                            <TableCell colSpan={2} className="text-right text-xs uppercase py-2">TOTALES</TableCell>
                                            <TableCell className="text-right font-mono text-xs text-green-600 dark:text-green-400 py-2">{formatCurrency(totalDebit)}</TableCell>
                                            <TableCell className="text-right font-mono text-xs text-blue-600 dark:text-blue-400 py-2">{formatCurrency(totalCredit)}</TableCell>
                                          </TableRow>
                                        </TableBody>
                                      </Table>
                                    </div>
                                  </div>
                                </TableCell>
                              </TableRow>
                            )}
                          </Fragment>
                        );
                      })}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── 2. Catálogo de Cuentas ────────────────────────────── */}
        <TabsContent value="catalog" className="space-y-6 outline-none">
          <div className="flex justify-between items-center flex-wrap gap-3">
            <h2 className="text-lg font-bold">Catálogo Centralizado de Clasificación Financiera</h2>
            <Button onClick={() => setAccountDialogOpen(true)} variant="outline" className="gap-2 h-10">
              <Plus className="h-4 w-4" />
              Nueva Cuenta
            </Button>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {Object.entries(categorizedAccounts).map(([type, list]) => (
              <Card key={type}>
                <CardHeader className="pb-3">
                  <CardTitle className="text-base font-bold text-primary flex items-center justify-between">
                    <span>{accountTypeLabels[type as keyof typeof accountTypeLabels]}</span>
                    <span className="text-xs bg-muted text-muted-foreground px-2 py-0.5 rounded-full font-normal">
                      {list.length} {list.length === 1 ? 'cuenta' : 'cuentas'}
                    </span>
                  </CardTitle>
                </CardHeader>
                <CardContent className="p-0">
                  <ScrollArea className="h-72">
                    <Table>
                      <TableHeader className="bg-muted/40">
                        <TableRow>
                          <TableHead className="w-24">Código</TableHead>
                          <TableHead>Nombre</TableHead>
                          <TableHead>Sub-Tipo</TableHead>
                          <TableHead className="w-16"></TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {list.length === 0 ? (
                          <TableRow>
                            <TableCell colSpan={4} className="text-center text-muted-foreground text-xs py-4">No hay cuentas</TableCell>
                          </TableRow>
                        ) : (
                          list.map(acc => (
                            <TableRow 
                              key={acc.id} 
                              className="hover:bg-muted/30 cursor-pointer transition-colors"
                              onClick={() => handleOpenAccountDrawer(acc.code)}
                              title="Ver detalle de esta cuenta"
                            >
                              <TableCell className="font-mono text-xs font-semibold">{acc.code}</TableCell>
                              <TableCell className="text-sm font-medium text-blue-600 hover:text-blue-800 hover:underline dark:text-blue-400 dark:hover:text-blue-300">
                                <span style={{ paddingLeft: `${(acc.code.length === 1 ? 0 : acc.code.length === 2 ? 1 : 2) * 12}px` }} className="inline-flex items-center gap-1.5">
                                  {acc.isGroup && <span className="inline-block text-[9px] bg-slate-200 dark:bg-slate-800 px-1 py-0.5 rounded text-slate-500 font-bold uppercase mr-1">Grupo</span>}
                                  {acc.name}
                                </span>
                              </TableCell>
                              <TableCell className="text-xs text-muted-foreground">{acc.subType || "-"}</TableCell>
                              <TableCell className="text-right">
                                {acc.isSystemAccount && (
                                  <span className="text-[10px] bg-red-100 dark:bg-red-950 text-red-700 dark:text-red-300 px-1.5 py-0.5 rounded uppercase font-bold">
                                    SISTEMA
                                  </span>
                                )}
                              </TableCell>
                            </TableRow>
                          ))
                        )}
                      </TableBody>
                    </Table>
                  </ScrollArea>
                </CardContent>
              </Card>
            ))}
          </div>
        </TabsContent>

        {/* ── 3. Estados Financieros ────────────────────────────── */}
        <TabsContent value="reports" className="space-y-6 outline-none">

          {/* Barra de Filtro del Dashboard */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-muted/20 p-4 rounded-xl border">
            <div>
              <h3 className="text-sm font-bold text-foreground">Resumen de Rendimiento Contable</h3>
              <p className="text-[11px] text-muted-foreground font-medium">Métricas de balance y resultados filtrados por el período seleccionado</p>
            </div>
            <div className="flex items-center gap-2 self-start sm:self-center">
              <span className="text-xs text-muted-foreground font-semibold whitespace-nowrap">Ver período:</span>
              <Select value={kpiPeriod} onValueChange={setKpiPeriod}>
                <SelectTrigger className="w-[180px] bg-background h-9 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {periodOptions.map(opt => (
                    <SelectItem key={opt.value} value={opt.value} className="text-xs">
                      {opt.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Dashboard de KPIs Financieros */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 animate-in fade-in duration-300">
            {/* Activos Totales Card */}
            <Card className="bg-gradient-to-br from-background to-muted/40 border border-muted-foreground/10 overflow-hidden relative group">
              <CardContent className="p-5 flex flex-col justify-between h-full">
                <div className="flex items-center justify-between text-muted-foreground">
                  <span className="text-[10px] font-black uppercase tracking-widest">Activos Totales</span>
                  <div className="p-1.5 rounded-lg bg-green-500/10 text-green-600 dark:text-green-400">
                    <TrendingUp className="h-4 w-4" />
                  </div>
                </div>
                <div className="mt-3">
                  <h3 className="text-2xl font-black font-mono tracking-tight text-foreground">
                    {formatCurrency(financialKPIs.totalAssets)}
                  </h3>
                  <p className="text-[10px] text-muted-foreground mt-1">Suma de cuentas de activos</p>
                </div>
              </CardContent>
            </Card>

            {/* Pasivos Totales Card */}
            <Card className="bg-gradient-to-br from-background to-muted/40 border border-muted-foreground/10 overflow-hidden relative group">
              <CardContent className="p-5 flex flex-col justify-between h-full">
                <div className="flex items-center justify-between text-muted-foreground">
                  <span className="text-[10px] font-black uppercase tracking-widest">Pasivos Totales</span>
                  <div className="p-1.5 rounded-lg bg-blue-500/10 text-blue-600 dark:text-blue-400">
                    <Scale className="h-4 w-4" />
                  </div>
                </div>
                <div className="mt-3">
                  <h3 className="text-2xl font-black font-mono tracking-tight text-foreground">
                    {formatCurrency(financialKPIs.totalLiabilities)}
                  </h3>
                  <p className="text-[10px] text-muted-foreground mt-1">Obligaciones y deudas vigentes</p>
                </div>
              </CardContent>
            </Card>

            {/* Utilidad Neta Ejercicio Card */}
            <Card className={`bg-gradient-to-br border overflow-hidden relative group ${
              financialKPIs.netProfit >= 0 
                ? 'from-green-500/5 to-transparent border-green-500/15' 
                : 'from-red-500/5 to-transparent border-red-500/15'
            }`}>
              <CardContent className="p-5 flex flex-col justify-between h-full">
                <div className="flex items-center justify-between text-muted-foreground">
                  <span className="text-[10px] font-black uppercase tracking-widest">Utilidad Neta (Acum.)</span>
                  <div className={`p-1.5 rounded-lg ${
                    financialKPIs.netProfit >= 0 
                      ? 'bg-green-500/10 text-green-600 dark:text-green-400' 
                      : 'bg-red-500/10 text-red-600 dark:text-red-400'
                  }`}>
                    <Calculator className="h-4 w-4" />
                  </div>
                </div>
                <div className="mt-3">
                  <h3 className={`text-2xl font-black font-mono tracking-tight ${
                    financialKPIs.netProfit >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-500'
                  }`}>
                    {formatCurrency(financialKPIs.netProfit)}
                  </h3>
                  <p className="text-[10px] text-muted-foreground mt-1">Ingresos totales menos gastos</p>
                </div>
              </CardContent>
            </Card>

            {/* Ratios Financieros Card */}
            <Card className="bg-gradient-to-br from-background to-muted/40 border border-muted-foreground/10 overflow-hidden relative group">
              <CardContent className="p-5 flex flex-col justify-between h-full">
                <div className="flex items-center justify-between text-muted-foreground">
                  <span className="text-[10px] font-black uppercase tracking-widest">Ratios e Indicadores</span>
                  <div className="p-1.5 rounded-lg bg-amber-500/10 text-amber-600 dark:text-amber-400">
                    <Settings className="h-4 w-4" />
                  </div>
                </div>
                <div className="mt-2.5 space-y-2">
                  <div className="flex justify-between items-center text-xs">
                    <span className="text-muted-foreground">Liquidez:</span>
                    <span className={`font-mono font-bold ${
                      financialKPIs.liquidityRatio >= 1.5 
                        ? 'text-green-600 dark:text-green-400' 
                        : financialKPIs.liquidityRatio >= 1.0 
                        ? 'text-amber-500' 
                        : 'text-red-500'
                    }`}>
                      {financialKPIs.liquidityRatio.toFixed(2)}x
                    </span>
                  </div>
                  <div className="flex justify-between items-center text-xs">
                    <span className="text-muted-foreground">Endeudamiento:</span>
                    <span className="font-mono font-bold text-foreground">
                      {financialKPIs.debtRatio.toFixed(1)}%
                    </span>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            
            {/* Balance General Card */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Scale className="h-5 w-5 text-primary" />
                  Balance General
                </CardTitle>
                <CardDescription>Activos vs. Pasivos y Patrimonio</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-1">
                  <Label>Fecha de Corte:</Label>
                  <Input 
                    type="date" 
                    value={balanceDate} 
                    onChange={e => setBalanceDate(e.target.value)} 
                  />
                </div>
                <Button 
                  onClick={() => refetchBalanceSheet()} 
                  className="w-full gap-2"
                  disabled={isFetchingBalance}
                >
                  <RefreshCw className={`h-4 w-4 ${isFetchingBalance ? "animate-spin" : ""}`} />
                  Generar Balance
                </Button>
              </CardContent>
            </Card>

            {/* Estado de Resultados Card */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <TrendingUp className="h-5 w-5 text-primary" />
                  Estado de Resultados
                </CardTitle>
                <CardDescription>Pérdidas y Ganancias del período</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-2 gap-2">
                  <div className="space-y-1">
                    <Label>Desde:</Label>
                    <Input 
                      type="date" 
                      value={reportRange.startDate} 
                      onChange={e => setReportRange({ ...reportRange, startDate: e.target.value })} 
                    />
                  </div>
                  <div className="space-y-1">
                    <Label>Hasta:</Label>
                    <Input 
                      type="date" 
                      value={reportRange.endDate} 
                      onChange={e => setReportRange({ ...reportRange, endDate: e.target.value })} 
                    />
                  </div>
                </div>
                <Button 
                  onClick={() => refetchIncome()} 
                  className="w-full gap-2"
                  disabled={isFetchingIncome}
                >
                  <RefreshCw className={`h-4 w-4 ${isFetchingIncome ? "animate-spin" : ""}`} />
                  Generar Estado de Resultados
                </Button>
              </CardContent>
            </Card>

            {/* Libro Mayor Card */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Building className="h-5 w-5 text-primary" />
                  Libro Mayor
                </CardTitle>
                <CardDescription>Movimientos históricos de una cuenta</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-1">
                  <Label>Seleccionar Cuenta:</Label>
                  <Select value={selectedLedgerAccount} onValueChange={setSelectedLedgerAccount}>
                    <SelectTrigger className="bg-background">
                      <SelectValue placeholder="Seleccione una cuenta..." />
                    </SelectTrigger>
                    <SelectContent>
                      {accounts.map(acc => (
                        <SelectItem key={acc.id} value={acc.id}>{acc.code} - {acc.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div className="space-y-1">
                    <Label>Desde:</Label>
                    <Input 
                      type="date" 
                      value={reportRange.startDate} 
                      onChange={e => setReportRange({ ...reportRange, startDate: e.target.value })} 
                    />
                  </div>
                  <div className="space-y-1">
                    <Label>Hasta:</Label>
                    <Input 
                      type="date" 
                      value={reportRange.endDate} 
                      onChange={e => setReportRange({ ...reportRange, endDate: e.target.value })} 
                    />
                  </div>
                </div>
                <Button 
                  onClick={() => refetchLedger()} 
                  className="w-full gap-2"
                  disabled={isFetchingLedger || !selectedLedgerAccount}
                >
                  <RefreshCw className={`h-4 w-4 ${isFetchingLedger ? "animate-spin" : ""}`} />
                  Consultar Mayor
                </Button>
              </CardContent>
            </Card>

          </div>

          {/* ── Report Output Section ── */}
          
          {/* Balance Sheet Display */}
          {balanceSheet && (
            <Card className="border-t-4 border-t-primary animate-in fade-in slide-in-from-top-4 duration-300">
              <CardHeader className="flex flex-row items-center justify-between border-b pb-4">
                <div>
                  <CardTitle className="text-xl">Balance General</CardTitle>
                  <CardDescription>Fecha de corte al: {balanceSheet.date}</CardDescription>
                </div>
                <div className={`text-xs px-2 py-1 rounded font-bold uppercase ${balanceSheet.isBalanced ? "bg-green-100 text-green-700 dark:bg-green-950 dark:text-green-300" : "bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300"}`}>
                  {balanceSheet.isBalanced ? "Cuadrado (Debits = Credits)" : "Descuadrado"}
                </div>
              </CardHeader>
              <CardContent className="p-6 grid grid-cols-1 md:grid-cols-2 gap-6">
                
                {/* ACTIVO */}
                <div className="space-y-4">
                  <h3 className="text-base font-bold border-b pb-2 text-primary">ACTIVOS (Debe)</h3>
                  <div className="space-y-2">
                    {balanceSheet.assets.map((asset: any) => (
                      <div key={asset.id} className="flex justify-between items-center gap-2 text-sm py-1 border-b border-muted/30 min-w-0">
                        <span className="font-medium font-mono text-xs truncate" title={`${asset.code} - ${asset.name}`}>
                          {asset.code} - {asset.name}
                        </span>
                        <span className="font-bold text-foreground shrink-0">{formatCurrency(asset.balance)}</span>
                      </div>
                    ))}
                  </div>
                  <div className="flex justify-between items-center bg-muted/30 p-3 rounded-lg border mt-4">
                    <span className="font-bold text-sm">TOTAL ACTIVOS</span>
                    <span className="font-extrabold text-base text-primary">{formatCurrency(balanceSheet.totalAssets)}</span>
                  </div>
                </div>

                {/* PASIVO Y PATRIMONIO */}
                <div className="space-y-4">
                  <h3 className="text-base font-bold border-b pb-2 text-primary">PASIVO Y PATRIMONIO (Haber)</h3>
                  <div className="space-y-4">
                    
                    {/* Pasivo */}
                    <div className="space-y-2">
                      <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Pasivos</h4>
                      {balanceSheet.liabilities.map((liab: any) => (
                        <div key={liab.id} className="flex justify-between items-center gap-2 text-sm py-1 border-b border-muted/30 min-w-0">
                          <span className="font-medium font-mono text-xs truncate" title={`${liab.code} - ${liab.name}`}>
                            {liab.code} - {liab.name}
                          </span>
                          <span className="font-bold text-foreground shrink-0">{formatCurrency(liab.balance)}</span>
                        </div>
                      ))}
                      <div className="flex justify-between text-xs font-bold pt-1">
                        <span>Total Pasivos</span>
                        <span>{formatCurrency(balanceSheet.totalLiabilities)}</span>
                      </div>
                    </div>

                    {/* Patrimonio */}
                    <div className="space-y-2 pt-2 border-t border-muted/50">
                      <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Patrimonio</h4>
                      {balanceSheet.equity.map((eqt: any) => (
                        <div key={eqt.id} className="flex justify-between items-center gap-2 text-sm py-1 border-b border-muted/30 min-w-0">
                          <span className="font-medium font-mono text-xs truncate" title={`${eqt.code} - ${eqt.name}`}>
                            {eqt.code} - {eqt.name}
                          </span>
                          <span className="font-bold text-foreground shrink-0">{formatCurrency(eqt.balance)}</span>
                        </div>
                      ))}
                      <div className="flex justify-between text-xs font-bold pt-1">
                        <span>Total Patrimonio</span>
                        <span>{formatCurrency(balanceSheet.totalEquity)}</span>
                      </div>
                    </div>

                  </div>
                  <div className="flex justify-between items-center bg-muted/30 p-3 rounded-lg border mt-4">
                    <span className="font-bold text-sm">TOTAL PASIVO + PATRIMONIO</span>
                    <span className="font-extrabold text-base text-primary">{formatCurrency(balanceSheet.totalLiabilitiesAndEquity)}</span>
                  </div>
                </div>

              </CardContent>
            </Card>
          )}

          {/* Income Statement Display */}
          {incomeStatement && (
            <Card className="border-t-4 border-t-primary animate-in fade-in slide-in-from-top-4 duration-300">
              <CardHeader className="border-b pb-4">
                <CardTitle className="text-xl">Estado de Resultados</CardTitle>
                <CardDescription>Desde {incomeStatement.startDate} hasta {incomeStatement.endDate}</CardDescription>
              </CardHeader>
              <CardContent className="p-6 space-y-6">
                
                {/* Ingresos */}
                <div className="space-y-3">
                  <h3 className="text-base font-bold border-b pb-2 text-primary">INGRESOS</h3>
                  <div className="space-y-2">
                    {incomeStatement.revenues.map((rev: any) => (
                      <div key={rev.id} className="flex justify-between items-center gap-2 text-sm py-1 border-b border-muted/30 min-w-0">
                        <span className="font-medium font-mono text-xs truncate" title={`${rev.code} - ${rev.name}`}>
                          {rev.code} - {rev.name}
                        </span>
                        <span className="font-bold text-green-600 dark:text-green-400 shrink-0">{formatCurrency(rev.balance)}</span>
                      </div>
                    ))}
                    {incomeStatement.revenues.length === 0 && (
                      <div className="text-center text-xs text-muted-foreground py-2">No se registraron ingresos en este período.</div>
                    )}
                  </div>
                  <div className="flex justify-between font-bold text-sm bg-green-500/10 text-green-700 dark:text-green-300 p-2.5 rounded border border-green-500/20">
                    <span>TOTAL INGRESOS</span>
                    <span>{formatCurrency(incomeStatement.totalRevenues)}</span>
                  </div>
                </div>

                {/* Gastos */}
                <div className="space-y-3">
                  <h3 className="text-base font-bold border-b pb-2 text-primary">GASTOS</h3>
                  <div className="space-y-2">
                    {incomeStatement.expenses.map((exp: any) => (
                      <div key={exp.id} className="flex justify-between items-center gap-2 text-sm py-1 border-b border-muted/30 min-w-0">
                        <span className="font-medium font-mono text-xs truncate" title={`${exp.code} - ${exp.name}`}>
                          {exp.code} - {exp.name}
                        </span>
                        <span className="font-bold text-red-600 dark:text-red-400 shrink-0">{formatCurrency(exp.balance)}</span>
                      </div>
                    ))}
                    {incomeStatement.expenses.length === 0 && (
                      <div className="text-center text-xs text-muted-foreground py-2">No se registraron gastos en este período.</div>
                    )}
                  </div>
                  <div className="flex justify-between font-bold text-sm bg-red-500/10 text-red-700 dark:text-red-300 p-2.5 rounded border border-red-500/20">
                    <span>TOTAL GASTOS</span>
                    <span>{formatCurrency(incomeStatement.totalExpenses)}</span>
                  </div>
                </div>

                {/* Resultado Neto */}
                <div className={`flex justify-between items-center p-4 rounded-xl border-2 ${incomeStatement.netIncome >= 0 ? "bg-green-50 border-green-200 text-green-700 dark:bg-green-950/20 dark:border-green-800" : "bg-red-50 border-red-200 text-red-700 dark:bg-red-950/20 dark:border-red-800"}`}>
                  <span className="font-bold text-base">UTILIDAD NETA DEL EJERCICIO</span>
                  <span className="font-extrabold text-2xl font-mono">{formatCurrency(incomeStatement.netIncome)}</span>
                </div>

              </CardContent>
            </Card>
          )}

          {/* Ledger Report Display */}
          {ledgerReport && (
            <Card className="border-t-4 border-t-primary animate-in fade-in slide-in-from-top-4 duration-300">
              <CardHeader className="border-b pb-4">
                <CardTitle className="text-xl">Libro Mayor - Cuenta: {ledgerReport.account.code} - {ledgerReport.account.name}</CardTitle>
                <CardDescription>Desde {ledgerReport.startDate} hasta {ledgerReport.endDate}</CardDescription>
              </CardHeader>
              <CardContent className="p-6 space-y-4">
                <div className="flex justify-between items-center bg-muted/40 p-3 rounded-lg border text-sm font-semibold">
                  <span>Saldo Inicial (Apertura)</span>
                  <span>{formatCurrency(ledgerReport.openingBalance)}</span>
                </div>

                <div className="overflow-x-auto w-full">
                  <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Fecha</TableHead>
                      <TableHead>Referencia</TableHead>
                      <TableHead>Descripción / Glosa</TableHead>
                      <TableHead className="text-right">Debe</TableHead>
                      <TableHead className="text-right">Haber</TableHead>
                      <TableHead className="text-right">Saldo Acumulado</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {ledgerReport.movements.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={6} className="text-center text-muted-foreground text-sm py-6">No hay movimientos en este período.</TableCell>
                      </TableRow>
                    ) : (
                      ledgerReport.movements.map((move: any) => (
                        <TableRow key={move.lineId} className="hover:bg-muted/30">
                          <TableCell className="font-mono text-xs">{move.date}</TableCell>
                          <TableCell className="text-xs">{move.referenceSource || "-"}</TableCell>
                          <TableCell className="font-medium max-w-[150px] sm:max-w-[250px] truncate" title={move.narration || ""}>
                            {move.narration || "-"}
                          </TableCell>
                          <TableCell className="text-right font-mono text-xs text-green-600 dark:text-green-400">
                            {move.debit > 0 ? formatCurrency(move.debit) : "-"}
                          </TableCell>
                          <TableCell className="text-right font-mono text-xs text-red-600 dark:text-red-400">
                            {move.credit > 0 ? formatCurrency(move.credit) : "-"}
                          </TableCell>
                          <TableCell className="text-right font-bold font-mono text-sm">
                            {formatCurrency(move.balance)}
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
                </div>

                <div className="flex justify-between items-center bg-primary/10 p-3 rounded-lg border border-primary/20 text-sm font-bold mt-4">
                  <span>Saldo de Cierre</span>
                  <span>{formatCurrency(ledgerReport.closingBalance)}</span>
                </div>
              </CardContent>
            </Card>
          )}

        </TabsContent>

        {/* ── 4. Configuración y Cierres ──────────────────────────── */}
        <TabsContent value="config" className="space-y-6 outline-none">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            
            {/* Period Locking Card */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Lock className="h-5 w-5 text-primary" />
                  Cierre de Períodos Contables
                </CardTitle>
                <CardDescription>Bloquea meses auditados para evitar alteraciones</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="text-xs bg-yellow-100 dark:bg-yellow-950 text-yellow-800 dark:text-yellow-300 p-3 rounded-lg border border-yellow-300 mb-2">
                  <strong>IMPORTANTE:</strong> Al cerrar un período, la API no permitirá crear, editar o eliminar facturas, gastos o asientos manuales con fechas en ese mes.
                </div>
                
                {isLoadingPeriods ? (
                  <div className="text-center text-sm py-4">Cargando períodos...</div>
                ) : (
                  <div className="space-y-3">
                    {/* Generar los meses del año actual */}
                    {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map(month => {
                      const year = new Date().getFullYear();
                      const matchingPeriod = periods.find(p => p.year === year && p.month === month);
                      const isClosed = matchingPeriod?.isClosed || false;

                      return (
                        <div key={month} className="flex justify-between items-center p-2.5 bg-muted/30 rounded-lg border">
                          <div>
                            <span className="font-semibold text-sm">
                              {new Date(2020, month - 1, 1).toLocaleString('es-ES', { month: 'long' }).toUpperCase()} {year}
                            </span>
                            {isClosed && (
                              <p className="text-[10px] text-muted-foreground mt-0.5">
                                Cerrado en: {matchingPeriod?.closedAt ? new Date(matchingPeriod.closedAt).toLocaleDateString() : ""}
                              </p>
                            )}
                          </div>
                          <Button 
                            variant={isClosed ? "destructive" : "outline"} 
                            size="sm"
                            className="gap-1.5"
                            onClick={() => handleTogglePeriod(year, month, isClosed)}
                          >
                            {isClosed ? (
                              <>
                                <Lock className="h-3.5 w-3.5" />
                                Cerrado
                              </>
                            ) : (
                              <>
                                <Unlock className="h-3.5 w-3.5" />
                                Abierto
                              </>
                            )}
                          </Button>
                        </div>
                      );
                    })}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Mappings / Automatizaciones Card */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Settings className="h-5 w-5 text-primary" />
                  Mapeos Contables de Inyección en Cascada
                </CardTitle>
                <CardDescription>Reglas automáticas al facturar o registrar gastos</CardDescription>
              </CardHeader>
              <CardContent className="p-0">
                {isLoadingMappings ? (
                  <div className="text-center text-sm py-4">Cargando reglas contables...</div>
                ) : (
                  <div className="overflow-x-auto w-full">
                    <Table>
                    <TableHeader className="bg-muted/40">
                      <TableRow>
                        <TableHead>Evento</TableHead>
                        <TableHead>Cuenta</TableHead>
                        <TableHead>Dirección</TableHead>
                        <TableHead>Fórmula / Valor</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {mappings.map(map => (
                        <TableRow key={map.id}>
                          <TableCell className="font-semibold text-xs font-mono">{map.event}</TableCell>
                          <TableCell className="font-mono text-xs">{map.accountCode}</TableCell>
                          <TableCell>
                            <span className={`text-[10px] font-bold px-2 py-0.5 rounded ${map.direction === "DEBIT" ? "bg-green-100 text-green-700 dark:bg-green-950 dark:text-green-300" : "bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300"}`}>
                              {map.direction === "DEBIT" ? "DEBE" : "HABER"}
                            </span>
                          </TableCell>
                          <TableCell className="text-xs text-muted-foreground">
                            {map.valueType === "percentage" ? `${map.valueExpression}% de total` : `${map.valueExpression}`}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                  </div>
                )}
              </CardContent>
            </Card>

          </div>
        </TabsContent>

      </Tabs>

      {/* ── DIALOGS / MODALS ── */}

      {/* 1. Account Creation Dialog */}
      <Dialog open={accountDialogOpen} onOpenChange={setAccountDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Nueva Cuenta Contable</DialogTitle>
            <DialogDescription>Añade una cuenta contable al catálogo general.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>Código Único *</Label>
                <Input 
                  value={newAccount.code} 
                  onChange={e => setNewAccount({ ...newAccount, code: e.target.value })} 
                  placeholder="Ej: 1020.04, 5010" 
                  className="font-mono"
                />
              </div>
              <div className="space-y-1">
                <Label>Tipo de Cuenta *</Label>
                <Select value={newAccount.type} onValueChange={v => setNewAccount({ ...newAccount, type: v as Account["type"] })}>
                  <SelectTrigger className="bg-background">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Asset">Activos</SelectItem>
                    <SelectItem value="Liability">Pasivos</SelectItem>
                    <SelectItem value="Equity">Patrimonio</SelectItem>
                    <SelectItem value="Revenue">Ingresos</SelectItem>
                    <SelectItem value="Expense">Gastos</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-1">
              <Label>Nombre Descriptivo *</Label>
              <Input 
                value={newAccount.name} 
                onChange={e => setNewAccount({ ...newAccount, name: e.target.value })} 
                placeholder="Ej: Banco Agrícola de Honduras" 
              />
            </div>
            <div className="space-y-1">
              <Label>Subclasificación Financiera (opcional)</Label>
              <Input 
                value={newAccount.subType} 
                onChange={e => setNewAccount({ ...newAccount, subType: e.target.value })} 
                placeholder="Ej: Current Asset, Fixed Asset, Cost of Goods Sold" 
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAccountDialogOpen(false)}>Cancelar</Button>
            <Button onClick={handleCreateAccount}>Registrar Cuenta</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 2. Journal Entry Creation Dialog */}
      {isMobile ? (
        <Sheet open={entryDialogOpen} onOpenChange={setEntryDialogOpen}>
          <SheetContent 
            side="bottom" 
            style={{ paddingBottom: keyboardHeight > 0 ? `${keyboardHeight}px` : undefined }}
            className="h-[92dvh] sm:max-w-none flex flex-col rounded-t-2xl p-0 overflow-hidden transition-all duration-200"
          >
            <SheetHeader className="text-left border-b p-5 pb-3">
              <div className="w-12 h-1 bg-muted rounded-full mx-auto mb-2" />
              <SheetTitle>Asiento Diario Manual</SheetTitle>
              <SheetDescription>Registra un movimiento contable cumpliendo con la ley de partida doble.</SheetDescription>
            </SheetHeader>
            <div className="flex-1 overflow-y-auto p-5 space-y-4 pb-24">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label>Fecha del Asiento *</Label>
                  <Input 
                    type="date" 
                    value={newEntry.date} 
                    onChange={e => setNewEntry({ ...newEntry, date: e.target.value })} 
                  />
                </div>
                <div className="space-y-1">
                  <Label>Referencia / Origen</Label>
                  <Input 
                    value={newEntry.referenceSource} 
                    onChange={e => setNewEntry({ ...newEntry, referenceSource: e.target.value })} 
                    placeholder="Ej: Depósito bancario" 
                  />
                </div>
              </div>
              <div className="space-y-1">
                <Label>Narración / Glosa *</Label>
                <Input 
                  value={newEntry.narration} 
                  onChange={e => setNewEntry({ ...newEntry, narration: e.target.value })} 
                  placeholder="Ej: Ajuste de saldos..." 
                />
              </div>

              <div className="space-y-2">
                <Label className="text-xs font-bold text-muted-foreground uppercase">Líneas del Asiento</Label>
                <div className="space-y-3 border p-3 rounded-lg bg-muted/10">
                  {newEntry.lines.map((line, idx) => (
                    <div key={idx} className="space-y-2 border-b pb-3 last:border-b-0 last:pb-0">
                      <div className="flex justify-between items-center">
                        <span className="text-[10px] font-bold text-muted-foreground">Línea #{idx + 1}</span>
                        <Button 
                          variant="ghost" 
                          size="icon" 
                          onClick={() => handleRemoveEntryLine(idx)}
                          disabled={newEntry.lines.length <= 2}
                          className="h-7 w-7 text-destructive"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                      <AccountCombobox
                        accounts={accounts}
                        value={line.accountId}
                        onChange={v => handleLineChange(idx, "accountId", v)}
                      />
                      <div className="grid grid-cols-2 gap-2">
                        <Input 
                          type="number" 
                          inputMode="decimal"
                          min={0}
                          step="0.01" 
                          value={line.debit === 0 ? "" : line.debit} 
                          onChange={e => handleLineChange(idx, "debit", e.target.value)} 
                          placeholder="Debe" 
                          className="h-9.5 text-xs text-right font-mono"
                          disabled={line.credit > 0}
                        />
                        <Input 
                          type="number" 
                          inputMode="decimal"
                          min={0}
                          step="0.01" 
                          value={line.credit === 0 ? "" : line.credit} 
                          onChange={e => handleLineChange(idx, "credit", e.target.value)} 
                          placeholder="Haber" 
                          className="h-9.5 text-xs text-right font-mono"
                          disabled={line.debit > 0}
                        />
                      </div>
                    </div>
                  ))}
                  
                  <div className="flex gap-2 mt-2">
                    <Button variant="outline" size="sm" onClick={handleAddEntryLine} className="flex-1 text-xs border-dashed h-9.5 gap-1 cursor-pointer">
                      <Plus className="h-3.5 w-3.5" />
                      Agregar Línea
                    </Button>
                    <Button variant="outline" size="sm" onClick={handleAutoBalance} className="text-xs h-9.5 gap-1 cursor-pointer text-primary hover:bg-primary/5">
                      <Scale className="h-3.5 w-3.5" />
                      Auto-cuadrar
                    </Button>
                  </div>
                </div>
              </div>

              {(() => {
                const totalDebit = newEntry.lines.reduce((sum, l) => sum + l.debit, 0);
                const totalCredit = newEntry.lines.reduce((sum, l) => sum + l.credit, 0);
                const difference = Math.abs(totalDebit - totalCredit);
                const isBalanced = difference <= 0.01 && totalDebit > 0;
                
                return (
                  <div className="space-y-2 border-t pt-3 mt-2">
                    <div className="flex justify-between items-center text-xs">
                      <div className="flex items-center gap-1 font-bold">
                        <Scale className={`h-3.5 w-3.5 ${isBalanced ? 'text-green-600 dark:text-green-400 animate-bounce' : 'text-amber-500'}`} />
                        <span>Estado:</span>
                        {totalDebit === 0 && totalCredit === 0 ? (
                          <span className="text-muted-foreground">Vacío</span>
                        ) : isBalanced ? (
                          <span className="text-green-600 dark:text-green-400 uppercase font-black">Cuadrado</span>
                        ) : (
                          <span className="text-amber-500 uppercase font-black">Falta: {formatCurrency(difference)}</span>
                        )}
                      </div>
                      <div className="flex gap-2 font-mono font-bold text-[10px]">
                        <span className="text-green-600 dark:text-green-400">D: {formatCurrency(totalDebit)}</span>
                        <span className="text-blue-600 dark:text-blue-400">H: {formatCurrency(totalCredit)}</span>
                      </div>
                    </div>
                    
                    {(totalDebit > 0 || totalCredit > 0) && (
                      <div className="h-1.5 w-full bg-muted rounded-full overflow-hidden flex">
                        <div 
                          className="bg-green-500 transition-all duration-300"
                          style={{ width: `${(totalDebit / (totalDebit + totalCredit || 1)) * 100}%` }}
                        />
                        <div 
                          className="bg-blue-500 transition-all duration-300"
                          style={{ width: `${(totalCredit / (totalDebit + totalCredit || 1)) * 100}%` }}
                        />
                      </div>
                    )}
                  </div>
                );
              })()}
            </div>
            <div className="absolute bottom-0 left-0 right-0 bg-background border-t p-4 grid grid-cols-2 gap-2 safe-area-bottom z-30">
              <Button variant="outline" className="h-11 cursor-pointer" onClick={() => setEntryDialogOpen(false)}>Cancelar</Button>
              <Button className="h-11 bg-primary text-primary-foreground cursor-pointer" onClick={handleCreateEntry}>Registrar Asiento</Button>
            </div>
          </SheetContent>
        </Sheet>
      ) : (
        <Dialog open={entryDialogOpen} onOpenChange={setEntryDialogOpen}>
          <DialogContent className="max-w-2xl max-h-[85vh] flex flex-col">
            <DialogHeader>
              <DialogTitle>Asiento Diario Manual</DialogTitle>
              <DialogDescription>Registra un movimiento contable cumpliendo con la ley de partida doble.</DialogDescription>
            </DialogHeader>
            
            <div className="space-y-4 my-2 overflow-y-auto pr-1 flex-1">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label>Fecha del Asiento *</Label>
                  <Input 
                    type="date" 
                    value={newEntry.date} 
                    onChange={e => setNewEntry({ ...newEntry, date: e.target.value })} 
                  />
                </div>
                <div className="space-y-1">
                  <Label>Referencia / Origen</Label>
                  <Input 
                    value={newEntry.referenceSource} 
                    onChange={e => setNewEntry({ ...newEntry, referenceSource: e.target.value })} 
                    placeholder="Ej: Depósito bancario, Pago manual" 
                  />
                </div>
              </div>
              <div className="space-y-1">
                <Label>Narración / Glosa *</Label>
                <Input 
                  value={newEntry.narration} 
                  onChange={e => setNewEntry({ ...newEntry, narration: e.target.value })} 
                  placeholder="Ej: Ajuste de saldos por cobros recibidos..." 
                />
              </div>

              <div className="space-y-2">
                <Label className="text-xs font-bold text-muted-foreground uppercase">Líneas del Asiento</Label>
                <div className="space-y-2 border p-3 rounded-lg bg-muted/10">
                  <div className="hidden sm:flex gap-2 text-[10px] font-black text-muted-foreground/75 uppercase tracking-widest px-1 pb-1">
                    <div className="flex-1 min-w-[200px]">Cuenta Contable</div>
                    <div className="w-28 text-right pr-2">Debe (L.)</div>
                    <div className="w-28 text-right pr-2">Haber (L.)</div>
                    <div className="w-8"></div>
                  </div>
                  {newEntry.lines.map((line, idx) => {
                    const selectedAcc = accounts.find(a => a.id === line.accountId);
                    return (
                      <div key={idx} className="flex gap-2 items-start flex-wrap sm:flex-nowrap">
                        <div className="flex-1 min-w-[200px]">
                          <AccountCombobox
                            accounts={accounts}
                            value={line.accountId}
                            onChange={v => handleLineChange(idx, "accountId", v)}
                          />
                        </div>
                        <div className="w-28 flex-shrink-0">
                          <Input 
                            type="number" 
                            min={0}
                            step="0.01" 
                            value={line.debit === 0 ? "" : line.debit} 
                            onChange={e => handleLineChange(idx, "debit", e.target.value)} 
                            placeholder="Debe" 
                            className="text-xs text-right font-mono"
                            disabled={line.credit > 0}
                          />
                        </div>
                        <div className="w-28 flex-shrink-0">
                          <Input 
                            type="number" 
                            min={0}
                            step="0.01" 
                            value={line.credit === 0 ? "" : line.credit} 
                            onChange={e => handleLineChange(idx, "credit", e.target.value)} 
                            placeholder="Haber" 
                            className="text-xs text-right font-mono"
                            disabled={line.debit > 0}
                          />
                        </div>
                        <Button 
                          variant="ghost" 
                          size="icon" 
                          onClick={() => handleRemoveEntryLine(idx)}
                          disabled={newEntry.lines.length <= 2}
                          className="h-8 w-8 text-destructive flex-shrink-0 mt-0.5"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    );
                  })}
                  
                  <div className="flex gap-2 mt-2">
                    <Button variant="outline" size="sm" onClick={handleAddEntryLine} className="flex-1 text-xs border-dashed h-9 gap-1">
                      <Plus className="h-3 w-3" />
                      Agregar Línea
                    </Button>
                    <Button variant="outline" size="sm" onClick={handleAutoBalance} className="text-xs h-9 gap-1 text-primary hover:bg-primary/5">
                      <Scale className="h-3.5 w-3.5" />
                      Auto-cuadrar
                    </Button>
                  </div>
                </div>
              </div>

              {(() => {
                const totalDebit = newEntry.lines.reduce((sum, l) => sum + l.debit, 0);
                const totalCredit = newEntry.lines.reduce((sum, l) => sum + l.credit, 0);
                const difference = Math.abs(totalDebit - totalCredit);
                const isBalanced = difference <= 0.01 && totalDebit > 0;
                
                return (
                  <div className="space-y-2 border-t pt-3 mt-2">
                    <div className="flex justify-between items-center text-xs">
                      <div className="flex items-center gap-1.5 font-bold">
                        <Scale className={`h-4 w-4 ${isBalanced ? 'text-green-600 dark:text-green-400 animate-bounce' : 'text-amber-500'}`} />
                        <span>Estado de Balance:</span>
                        {totalDebit === 0 && totalCredit === 0 ? (
                          <span className="text-muted-foreground">Vacío</span>
                        ) : isBalanced ? (
                          <span className="text-green-600 dark:text-green-400 uppercase font-black tracking-wider">Asiento Cuadrado</span>
                        ) : (
                          <span className="text-amber-500 uppercase font-black tracking-wider">Descuadre: {formatCurrency(difference)}</span>
                        )}
                      </div>
                      <div className="flex gap-4 font-mono font-bold text-xs">
                        <span className="text-green-600 dark:text-green-400">Debe: {formatCurrency(totalDebit)}</span>
                        <span className="text-blue-600 dark:text-blue-400">Haber: {formatCurrency(totalCredit)}</span>
                      </div>
                    </div>
                    
                    {(totalDebit > 0 || totalCredit > 0) && (
                      <div className="h-2 w-full bg-muted rounded-full overflow-hidden flex">
                        <div 
                          className="bg-green-500 transition-all duration-300"
                          style={{ width: `${(totalDebit / (totalDebit + totalCredit || 1)) * 100}%` }}
                        />
                        <div 
                          className="bg-blue-500 transition-all duration-300"
                          style={{ width: `${(totalCredit / (totalDebit + totalCredit || 1)) * 100}%` }}
                        />
                      </div>
                    )}
                  </div>
                );
              })()}

            </div>

            <DialogFooter className="border-t pt-3">
              <Button variant="outline" onClick={() => setEntryDialogOpen(false)}>Cancelar</Button>
              <Button onClick={handleCreateEntry}>Registrar Asiento</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}

      {/* Account Details Drawer / Sheet */}
      <Sheet open={isAccountDrawerOpen} onOpenChange={setIsAccountDrawerOpen}>
        <SheetContent className="sm:max-w-md overflow-y-auto h-full flex flex-col justify-between">
          <div className="space-y-6">
            <SheetHeader className="text-left border-b pb-4">
              <div className="flex items-center gap-2 text-muted-foreground text-xs uppercase tracking-wider font-bold">
                <span>Cuenta Contable</span>
                <span className="w-1 h-1 rounded-full bg-muted-foreground opacity-50" />
                <span>{selectedAccountForDrawer ? accountTypeLabels[selectedAccountForDrawer.type] : ""}</span>
              </div>
              <SheetTitle className="text-2xl font-black tracking-tight mt-1 text-primary">
                {selectedAccountForDrawer?.code} - {selectedAccountForDrawer?.name}
              </SheetTitle>
              {selectedAccountForDrawer?.subType && (
                <SheetDescription className="text-xs font-semibold uppercase tracking-wider text-muted-foreground/80 mt-0.5">
                  Sub-Tipo: {selectedAccountForDrawer.subType}
                </SheetDescription>
              )}
            </SheetHeader>

            {/* Account Balance Card */}
            <Card className="bg-primary/5 border-primary/10 overflow-hidden shadow-sm">
              <CardContent className="p-4 flex items-center justify-between">
                <div>
                  <p className="text-[10px] font-black text-muted-foreground uppercase tracking-widest">Saldo Acumulado Actual</p>
                  <h3 className="text-2xl font-black text-foreground mt-1">
                    {formatCurrency(currentAccountBalance)}
                  </h3>
                </div>
                <div className={`p-2 rounded-xl text-primary-foreground ${
                  selectedAccountForDrawer && (selectedAccountForDrawer.type === "Asset" || selectedAccountForDrawer.type === "Expense")
                    ? "bg-green-600 dark:bg-green-700"
                    : "bg-blue-600 dark:bg-blue-700"
                }`}>
                  <Calculator className="h-6 w-6" />
                </div>
              </CardContent>
            </Card>

            {/* Recent transactions section */}
            <div className="space-y-3">
              <div className="flex justify-between items-center">
                <span className="text-[11px] font-black text-muted-foreground uppercase tracking-wider">Últimos Movimientos</span>
                <span className="text-xs text-muted-foreground bg-muted px-2 py-0.5 rounded border">
                  Total: {accountTransactions.length}
                </span>
              </div>

              {accountTransactions.length === 0 ? (
                <div className="text-center py-8 text-xs text-muted-foreground border border-dashed rounded-xl">
                  No hay movimientos registrados para esta cuenta.
                </div>
              ) : (
                <div className="space-y-2 max-h-[350px] overflow-y-auto pr-1">
                  {accountTransactions.slice(0, 5).map((tx, idx) => (
                    <div key={idx} className="p-3 border rounded-xl bg-background/50 hover:bg-muted/10 transition-colors space-y-2">
                      <div className="flex justify-between items-start">
                        <div className="flex flex-col">
                          <span className="text-[10px] font-semibold text-muted-foreground">{tx.date}</span>
                          <span className="text-xs font-bold text-foreground line-clamp-1">{tx.narration || "Sin descripción"}</span>
                        </div>
                        <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-bold border uppercase tracking-wider ${
                          tx.referenceSource?.startsWith("InvoicePayment_")
                            ? "bg-green-100 text-green-700 border-green-200 dark:bg-green-950 dark:text-green-300 dark:border-green-800"
                            : tx.referenceSource?.startsWith("Invoice_")
                            ? "bg-blue-100 text-blue-700 border-blue-200 dark:bg-blue-950 dark:text-blue-300 dark:border-blue-800"
                            : tx.referenceSource?.startsWith("Expense_")
                            ? "bg-amber-100 text-amber-700 border-amber-200 dark:bg-amber-950 dark:text-amber-300 dark:border-amber-800"
                            : "bg-primary/10 text-primary border-primary/20"
                        }`}>
                          {tx.referenceSource || "Manual"}
                        </span>
                      </div>
                      
                      <div className="flex justify-between items-center text-xs font-mono border-t pt-1.5">
                        <span className="text-[10px] text-muted-foreground">Debe: <span className="text-green-600 dark:text-green-400 font-bold">{tx.debit > 0 ? formatCurrency(tx.debit) : "—"}</span></span>
                        <span className="text-[10px] text-muted-foreground">Haber: <span className="text-blue-600 dark:text-blue-400 font-bold">{tx.credit > 0 ? formatCurrency(tx.credit) : "—"}</span></span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          <div className="pt-4 border-t mt-4 space-y-2 col-span-2">
            <Button
              className="w-full gap-2 h-11"
              onClick={() => {
                if (selectedAccountForDrawer) {
                  handleGoToLedger(selectedAccountForDrawer.id);
                  setIsAccountDrawerOpen(false);
                }
              }}
            >
              <FileText className="h-4 w-4" /> Ver Libro Mayor Completo
            </Button>
            <Button
              variant="outline"
              className="w-full h-11"
              onClick={() => setIsAccountDrawerOpen(false)}
            >
              Cerrar Vista Rápida
            </Button>
          </div>
        </SheetContent>
      </Sheet>

    </div>
  );
}
