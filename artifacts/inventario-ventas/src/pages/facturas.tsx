import React, { useState, useEffect, useRef } from "react";
import { useListClients } from "@workspace/api-client-react";
import type { Client } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { formatCurrency, departments } from "@/lib/format";
import {
  Plus, Trash2, FileText, CheckCircle, XCircle, Clock,
  Search, X, ChevronDown, ChevronUp, ArrowLeft, CreditCard, Printer, MessageCircle,
  Package, Copy, ExternalLink, Image as ImageIcon, Truck, Calculator, Coins, UserPlus, CreditCard as CardIcon
} from "lucide-react";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";

// ─── Types ────────────────────────────────────────────────────────────────────

interface InvoiceItem {
  id?: number;
  description: string;
  quantity: number;
  unitPrice: number;
  total: number;
}

interface Invoice {
  id: number;
  invoiceNumber: string;
  clientId?: number | null;
  clientName: string;
  clientPhone?: string | null;
  clientEmail?: string | null;
  clientAddress?: string | null;
  clientCity?: string | null;
  clientDepartment?: string | null;
  clientRtn?: string | null;
  paymentMethod?: string | null;
  transferReference?: string | null;
  status: "pendiente" | "pagada" | "cancelada";
  subtotal: number;
  discount: number;
  tax: number;
  total: number;
  notes?: string | null;
  issueDate: string;
  dueDate?: string | null;
  numeroGuia?: string | null;
  transportista?: string | null;
  fotoGuiaPath?: string | null;
  estadoEntrega?: string;
  // Profit fields
  baseCost?: number;
  internalExpenses?: number;
  internalExpensesNote?: string | null;
  taxes?: number;
  partnerPayout?: number;
  ownerPayout?: number;
  items?: InvoiceItem[];
  createdAt: string;
  updatedAt: string;
}

interface ProductOption {
  id: number;
  label: string;
  price: number;
  costPrice: number;
  type: "perfumeria" | "sublimacion" | "combo";
  code?: string | null;
  stock: number;
  comboItems?: any[];
  fixedPrice?: number | null;
  brand?: string;
  ml?: number;
  subType?: string;
}

// ─── API ──────────────────────────────────────────────────────────────────────

const API_BASE = "/api";
async function apiFetch(path: string, options?: RequestInit) {
  const res = await fetch(`${API_BASE}${path}`, {
    headers: { "Content-Type": "application/json" },
    ...options,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || `HTTP ${res.status}`);
  }
  if (res.status === 204) return null;
  return res.json();
}

// ─── Status helpers ────────────────────────────────────────────────────────────

const STATUS_CONFIG = {
  pendiente: { label: "Pendiente", icon: Clock, classes: "bg-amber-50 text-amber-700 border-amber-200", dot: "bg-amber-400" },
  pagada: { label: "Pagada", icon: CheckCircle, classes: "bg-emerald-50 text-emerald-700 border-emerald-200", dot: "bg-emerald-400" },
  cancelada: { label: "Cancelada", icon: XCircle, classes: "bg-red-50 text-red-700 border-red-200", dot: "bg-red-400" },
} as const;

function StatusBadge({ status }: { status: Invoice["status"] }) {
  const { label, classes, dot } = STATUS_CONFIG[status];
  return (
    <span className={`inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-full border ${classes}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${dot}`} />
      {label}
    </span>
  );
}

function GuideBadge({ status }: { status?: string }) {
  const pData = {
    "Pendiente": { label: "Pendiente", bg: "bg-red-50 text-red-700 border-red-200", dot: "bg-red-400", icon: Package },
    "En Tránsito": { label: "En Tránsito", bg: "bg-orange-50 text-orange-700 border-orange-200", dot: "bg-orange-400", icon: Truck },
    "Entregado": { label: "Entregado", bg: "bg-emerald-50 text-emerald-700 border-emerald-200", dot: "bg-emerald-400", icon: CheckCircle },
  };
  const config = pData[(status as keyof typeof pData)] || pData["Pendiente"];
  const Icon = config.icon;
  return (
    <span className={`inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-full border ${config.bg}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${config.dot}`} />
      <Icon className="w-3 h-3" />
      {config.label}
    </span>
  );
}

const PAYMENT_LABELS: Record<string, string> = {
  efectivo: "Efectivo",
  tarjeta: "Tarjeta",
  transferencia: "Transferencia",
  cheque: "Cheque",
};

// ─── WhatsApp helpers ─────────────────────────────────────────────────────────

function formatPhone(raw: string): string {
  const digits = raw.replace(/\D/g, "");
  if (digits.length === 8 && (digits[0] === "9" || digits[0] === "3")) {
    return `504${digits}`;
  }
  if (digits.length === 11 && digits.startsWith("504")) return digits;
  if (digits.length === 12 && digits.startsWith("504")) return digits;
  return digits;
}

function openWhatsApp(invoice: Invoice, phone: string) {
  const formatted = formatPhone(phone);
  const total = new Intl.NumberFormat("es-HN", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(invoice.total);
  const message = `Hola ${invoice.clientName}, le enviamos el resumen de su factura ${invoice.invoiceNumber} por un total de L ${total}. Gracias por su preferencia - C&G Electronics`;
  const url = `https://wa.me/${formatted}?text=${encodeURIComponent(message)}`;
  window.open(url, "_blank");
}

// ─── Print styles ─────────────────────────────────────────────────────────────

const CARTA_PRINT_STYLES = `
@media print {
  @page { size: letter portrait; margin: 0; }
  body * { visibility: hidden !important; }
  #print-target, #print-target * { visibility: visible !important; }
  #print-target {
    position: fixed !important;
    inset: 0 !important;
    z-index: 99999 !important;
    background: #fff !important;
    display: flex !important;
    justify-content: center !important;
    align-items: flex-start !important;
    overflow: hidden !important;
    -webkit-print-color-adjust: exact !important;
    print-color-adjust: exact !important;
  }
}
`;

function printThermal(invoice: Invoice) {
  const fmt = (n: number) =>
    new Intl.NumberFormat("es-HN", { style: "currency", currency: "HNL", minimumFractionDigits: 2 }).format(n);

  const subtotal = Number(invoice.subtotal);
  const discount = Number(invoice.discount);
  const tax = Number(invoice.tax);
  const total = Number(invoice.total);

  const payLabels: Record<string, string> = {
    efectivo: "Efectivo", tarjeta: "Tarjeta",
    transferencia: "Transferencia", cheque: "Cheque",
  };

  const sep = (dbl = false) =>
    `<div style="border-top:${dbl ? "2px solid #000" : "1px dashed #000"};margin:5px 0;"></div>`;

  const row = (left: string, right: string, bold = false) =>
    `<div style="display:flex;justify-content:space-between;${bold ? "font-weight:700;" : ""}">
       <span>${left}</span><span>${right}</span>
     </div>`;

  const itemsHtml = (invoice.items ?? []).map(item => `
    <div style="margin-bottom:6px;">
      <div style="color:#555;">Cant. ${item.quantity} x ${fmt(item.unitPrice)}</div>
      <div style="display:flex;justify-content:space-between;font-weight:700;">
        <span style="flex:1;padding-right:6px;word-break:break-word;">${item.description}</span>
        <span style="white-space:nowrap;">${fmt(item.total)}</span>
      </div>
    </div>`).join("");

  const html = `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <title>${invoice.invoiceNumber} - Térmica</title>
  <style>
    @page { size: 80mm auto; margin: 2mm; }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: 'Courier New', Courier, monospace;
      font-size: 9pt;
      color: #000;
      background: #fff;
      width: 80mm;
      padding: 4mm 3mm;
      line-height: 1.45;
    }
  </style>
</head>
<body>
  <div style="text-align:center;margin-bottom:6px;">
    <div style="font-weight:900;font-size:13pt;letter-spacing:0.5px;">C&amp;G Electronics</div>
    <div style="font-size:7.5pt;">San Pedro Sula, Cortés, Honduras</div>
    <div style="font-size:7pt;color:#444;">electrónica · perfumería · sublimación</div>
  </div>

  ${sep()}

  <div style="margin-bottom:4px;">
    ${row("FACTURA:", invoice.invoiceNumber, true)}
    ${row("Fecha:", invoice.issueDate)}
    ${invoice.dueDate ? row("Vence:", invoice.dueDate) : ""}
  </div>

  ${sep()}

  <div style="margin-bottom:4px;">
    <div style="font-weight:700;">${invoice.clientName.toUpperCase()}</div>
    ${invoice.clientPhone ? `<div>Tel: ${invoice.clientPhone}</div>` : ""}
    ${invoice.clientRtn ? `<div>RTN: ${invoice.clientRtn}</div>` : ""}
    ${invoice.clientEmail ? `<div style="font-size:8pt;">${invoice.clientEmail}</div>` : ""}
    ${(invoice.clientCity || invoice.clientDepartment)
      ? `<div style="font-size:8pt;">${[invoice.clientCity, invoice.clientDepartment].filter(Boolean).join(", ")}</div>`
      : ""}
  </div>

  ${sep()}

  <div style="margin-bottom:4px;">${itemsHtml}</div>

  ${sep()}

  <div style="margin-bottom:4px;">
    ${row("Subtotal:", fmt(subtotal))}
    ${discount > 0 ? row("Descuento:", `-${fmt(discount)}`) : ""}
    ${tax > 0 ? row("ISV (15%):", fmt(tax)) : ""}
  </div>

  <div style="border:2px solid #000;padding:4px 6px;margin:6px 0;">
    <div style="display:flex;justify-content:space-between;font-weight:900;font-size:12pt;">
      <span>TOTAL L</span><span>${fmt(total)}</span>
    </div>
  </div>

  ${invoice.paymentMethod ? `
    <div style="margin-bottom:4px;">
      ${row("Forma de pago:", payLabels[invoice.paymentMethod] ?? invoice.paymentMethod)}
      ${invoice.paymentMethod === "transferencia" && invoice.transferReference
        ? row("Referencia:", invoice.transferReference)
        : ""}
    </div>` : ""}

  ${invoice.notes ? `${sep()}<div style="font-size:8pt;color:#333;">${invoice.notes}</div>` : ""}

  ${sep()}

  <div style="text-align:center;margin-top:4px;">
    <div style="font-style:italic;font-size:8.5pt;">Gracias por su preferencia</div>
    <div style="font-weight:700;">C&amp;G Electronics</div>
  </div>
</body>
</html>`;

  const win = window.open("", "_blank", "width=400,height=600");
  if (!win) return;
  win.document.write(html);
  win.document.close();
  win.focus();
  win.print();
  win.addEventListener("afterprint", () => win.close());
}

function injectPrintStyle(css: string) {
  const el = document.createElement("style");
  el.id = "__dyn_print__";
  el.textContent = css;
  document.head.appendChild(el);
  const cleanup = () => {
    el.remove();
    window.removeEventListener("afterprint", cleanup);
  };
  window.addEventListener("afterprint", cleanup);
  window.print();
}

// ─── Print View ───────────────────────────────────────────────────────────────

function InvoicePrintView({ invoice }: { invoice: Invoice }) {
  const subtotal = Number(invoice.subtotal);
  const discount = Number(invoice.discount);
  const tax = Number(invoice.tax);
  const total = Number(invoice.total);
  const BLUE = "#4472C4";

  return (
    <div
      id="print-target"
      style={{
        background: "#fff",
        color: "#111",
        fontFamily: "Arial, 'Helvetica Neue', sans-serif",
        width: "216mm",
        minHeight: "279mm",
        margin: "0 auto",
        padding: "12mm 16mm 10mm 16mm",
        boxSizing: "border-box",
        fontSize: "10pt",
        display: "flex",
        flexDirection: "column",
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "6px" }}>
        <img
          src="/logo.png"
          alt="C&G Electronics"
          style={{ height: "80px", width: "auto", objectFit: "contain", display: "block" }}
        />
        <div style={{ textAlign: "right", fontSize: "8.5pt", color: "#555", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.5px" }}>
          SAN PEDRO SULA, HONDURAS
        </div>
      </div>

      <div style={{ borderTop: "1.5px solid #e5e7eb", marginBottom: "14px" }} />

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "16px" }}>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: "20pt", fontWeight: 900, color: BLUE, marginBottom: "10px" }}>
            Factura {invoice.invoiceNumber}
          </div>
          <div style={{ display: "flex", gap: "32px" }}>
            <div>
              <div style={{ fontSize: "7.5pt", color: "#888", textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: "2px", fontWeight: 700 }}>Fecha de factura</div>
              <div style={{ fontSize: "10pt", fontWeight: 700, color: "#111" }}>{invoice.issueDate}</div>
            </div>
            {invoice.dueDate && (
              <div>
                <div style={{ fontSize: "7.5pt", color: "#888", textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: "2px", fontWeight: 700 }}>Fecha límite</div>
                <div style={{ fontSize: "10pt", fontWeight: 700, color: "#111" }}>{invoice.dueDate}</div>
              </div>
            )}
          </div>
        </div>
        <div style={{ textAlign: "right", minWidth: "200px" }}>
          <div style={{ fontSize: "12pt", fontWeight: 700, color: "#111" }}>{invoice.clientName}</div>
          {invoice.clientRtn && <div style={{ fontSize: "8.5pt", color: "#555", marginTop: "3px" }}>RTN: {invoice.clientRtn}</div>}
          {invoice.clientPhone && <div style={{ fontSize: "8.5pt", color: "#555" }}>Tel: {invoice.clientPhone}</div>}
          {invoice.clientEmail && <div style={{ fontSize: "8.5pt", color: "#555" }}>{invoice.clientEmail}</div>}
          {(invoice.clientAddress || invoice.clientCity || invoice.clientDepartment) && (
            <div style={{ fontSize: "8.5pt", color: "#555" }}>
              {[invoice.clientAddress, invoice.clientCity, invoice.clientDepartment].filter(Boolean).join(", ")}
            </div>
          )}
          <div style={{
            marginTop: "6px", fontSize: "8pt", fontWeight: 700,
            color: invoice.status === "pagada" ? "#15803d" : invoice.status === "cancelada" ? "#b91c1c" : "#92400e",
          }}>
            {invoice.status === "pagada" ? "✓ PAGADA" : invoice.status === "cancelada" ? "✕ CANCELADA" : "⏳ PENDIENTE"}
          </div>
        </div>
      </div>

      <table style={{ width: "100%", borderCollapse: "collapse", marginBottom: "0" }}>
        <thead>
          <tr style={{ borderBottom: `2px solid ${BLUE}` }}>
            <th style={{ padding: "6px 8px", fontSize: "8pt", fontWeight: 700, color: BLUE, textTransform: "uppercase", letterSpacing: "0.4px", textAlign: "left", width: "44%" }}>DESCRIPCIÓN</th>
            <th style={{ padding: "6px 8px", fontSize: "8pt", fontWeight: 700, color: BLUE, textTransform: "uppercase", letterSpacing: "0.4px", textAlign: "center", width: "10%" }}>CANTIDAD</th>
            <th style={{ padding: "6px 8px", fontSize: "8pt", fontWeight: 700, color: BLUE, textTransform: "uppercase", letterSpacing: "0.4px", textAlign: "right", width: "18%" }}>PRECIO UNITARIO</th>
            <th style={{ padding: "6px 8px", fontSize: "8pt", fontWeight: 700, color: BLUE, textTransform: "uppercase", letterSpacing: "0.4px", textAlign: "right", width: "10%" }}>DESC.%</th>
            <th style={{ padding: "6px 8px", fontSize: "8pt", fontWeight: 700, color: BLUE, textTransform: "uppercase", letterSpacing: "0.4px", textAlign: "right", width: "18%" }}>IMPORTE</th>
          </tr>
        </thead>
        <tbody>
          {invoice.items?.map((item, idx) => {
            const rowDiscount = subtotal > 0 ? ((discount / subtotal) * 100) : 0;
            return (
              <tr key={idx} style={{ borderBottom: "0.5px solid #e5e7eb" }}>
                <td style={{ padding: "7px 8px", fontSize: "9pt", color: "#111" }}>{item.description}</td>
                <td style={{ padding: "7px 8px", fontSize: "9pt", color: "#374151", textAlign: "center" }}>
                  {item.quantity.toFixed(2)}
                </td>
                <td style={{ padding: "7px 8px", fontSize: "9pt", color: "#374151", textAlign: "right" }}>
                  {item.unitPrice.toLocaleString("es-HN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </td>
                <td style={{ padding: "7px 8px", fontSize: "9pt", color: "#374151", textAlign: "right" }}>
                  {rowDiscount > 0 ? rowDiscount.toFixed(2) : "0,00"}
                </td>
                <td style={{ padding: "7px 8px", fontSize: "9pt", color: BLUE, fontWeight: 700, textAlign: "right" }}>
                  L {item.total.toLocaleString("es-HN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", marginTop: "10px", marginBottom: "14px" }}>
        <div style={{ fontSize: "8.5pt", color: "#555", flex: 1 }}>
          {invoice.notes && <div style={{ marginBottom: "4px" }}>{invoice.notes}</div>}
          {invoice.paymentMethod === "transferencia" && invoice.transferReference && (
            <div><span style={{ fontWeight: 700 }}>Comunicación del pago: </span>{invoice.transferReference}</div>
          )}
        </div>
        <div style={{ minWidth: "260px" }}>
          {(discount > 0 || tax > 0) && (
            <div style={{ display: "flex", justifyContent: "space-between", padding: "4px 10px", fontSize: "9pt" }}>
              <span style={{ color: "#555" }}>Subtotal</span>
              <span style={{ fontWeight: 600 }}>{formatCurrency(subtotal)}</span>
            </div>
          )}
          {discount > 0 && (
            <div style={{ display: "flex", justifyContent: "space-between", padding: "4px 10px", fontSize: "9pt" }}>
              <span style={{ color: "#555" }}>Descuento</span>
              <span style={{ fontWeight: 600, color: "#b91c1c" }}>-{formatCurrency(discount)}</span>
            </div>
          )}
          {tax > 0 && (
            <div style={{ display: "flex", justifyContent: "space-between", padding: "4px 10px", fontSize: "9pt" }}>
              <span style={{ color: "#555" }}>ISV (15%)</span>
              <span style={{ fontWeight: 600 }}>{formatCurrency(tax)}</span>
            </div>
          )}
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", background: BLUE, color: "#fff", padding: "8px 12px", borderRadius: "2px" }}>
            <span style={{ fontWeight: 700, fontSize: "10pt" }}>Total</span>
            <span style={{ fontWeight: 900, fontSize: "12pt", letterSpacing: "-0.5px" }}>
              L {total.toLocaleString("es-HN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </span>
          </div>
        </div>
      </div>

      <div style={{ flex: 1 }} />

      <div style={{ borderTop: "1.5px solid #d1d5db", paddingTop: "10px", marginTop: "8px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end" }}>
          <div style={{ fontSize: "8pt", color: "#555", lineHeight: 1.7 }}>
            <div style={{ fontWeight: 700, color: "#111", marginBottom: "2px", fontSize: "8.5pt" }}>Contacto</div>
            <div>electronicscheapandgood@gmail.com</div>
            <div>+504 9479-9621</div>
          </div>
          <div style={{ textAlign: "right" }}>
            <div style={{ fontSize: "10pt", fontWeight: 900, color: "#1a56db", letterSpacing: "0.5px" }}>
              GOOD PRICE, GOOD EXPERIENCE
            </div>
            <div style={{ fontSize: "7.5pt", color: "#aaa", marginTop: "4px" }}>Página 1 de 1</div>
          </div>
        </div>
      </div>
    </div>
  );
}

function ThermalPrintView({ invoice }: { invoice: Invoice }) {
  const subtotal = Number(invoice.subtotal);
  const discount = Number(invoice.discount);
  const tax = Number(invoice.tax);
  const total = Number(invoice.total);

  const base: React.CSSProperties = {
    fontFamily: "'Courier New', Courier, monospace",
    fontSize: "9pt",
    color: "#000",
    lineHeight: 1.45,
  };
  const sep = (char = "-") => (
    <div style={{ ...base, borderBottom: `1px ${char === "=" ? "solid" : "dashed"} #000`, margin: "5px 0" }} />
  );
  const row = (left: string, right: string, bold = false) => (
    <div style={{ ...base, display: "flex", justifyContent: "space-between", fontWeight: bold ? 700 : 400 }}>
      <span>{left}</span><span>{right}</span>
    </div>
  );

  return (
    <div
      id="print-target"
      style={{
        width: "80mm",
        background: "#fff",
        color: "#000",
        padding: "4mm 3mm",
        boxSizing: "border-box",
        fontFamily: "'Courier New', Courier, monospace",
      }}
    >
      <div style={{ textAlign: "center", marginBottom: "6px" }}>
        <div style={{ ...base, fontWeight: 900, fontSize: "13pt", letterSpacing: "0.5px" }}>C&amp;G Electronics</div>
        <div style={{ ...base, fontSize: "7.5pt" }}>San Pedro Sula, Cortés, Honduras</div>
        <div style={{ ...base, fontSize: "7pt", color: "#444" }}>electrónica · perfumería · sublimación</div>
      </div>

      {sep()}

      <div style={{ marginBottom: "4px" }}>
        {row("FACTURA:", invoice.invoiceNumber, true)}
        {row("Fecha:", invoice.issueDate)}
        {invoice.dueDate && row("Vence:", invoice.dueDate)}
      </div>

      {sep()}

      <div style={{ marginBottom: "4px" }}>
        <div style={{ ...base, fontWeight: 700 }}>{invoice.clientName.toUpperCase()}</div>
        {invoice.clientPhone && <div style={base}>Tel: {invoice.clientPhone}</div>}
        {invoice.clientRtn && <div style={base}>RTN: {invoice.clientRtn}</div>}
        {invoice.clientEmail && <div style={{ ...base, fontSize: "8pt" }}>{invoice.clientEmail}</div>}
        {(invoice.clientCity || invoice.clientDepartment) && (
          <div style={{ ...base, fontSize: "8pt" }}>
            {[invoice.clientCity, invoice.clientDepartment].filter(Boolean).join(", ")}
          </div>
        )}
      </div>

      {sep()}

      <div style={{ marginBottom: "4px" }}>
        {invoice.items?.map((item, idx) => (
          <div key={idx} style={{ marginBottom: "6px" }}>
            <div style={{ ...base, display: "flex", justifyContent: "space-between" }}>
              <span style={{ color: "#555" }}>
                Cant. {item.quantity} x {formatCurrency(item.unitPrice)}
              </span>
            </div>
            <div style={{ ...base, display: "flex", justifyContent: "space-between", fontWeight: 700 }}>
              <span style={{ flex: 1, paddingRight: "6px", wordBreak: "break-word" }}>{item.description}</span>
              <span style={{ whiteSpace: "nowrap" }}>{formatCurrency(item.total)}</span>
            </div>
          </div>
        ))}
      </div>

      {sep()}

      <div style={{ marginBottom: "4px" }}>
        {row("Subtotal:", formatCurrency(subtotal))}
        {discount > 0 && row("Descuento:", `-${formatCurrency(discount)}`)}
        {tax > 0 && row("ISV (15%):", formatCurrency(tax))}
      </div>

      <div style={{ border: "2px solid #000", padding: "4px 6px", margin: "6px 0" }}>
        <div style={{ ...base, display: "flex", justifyContent: "space-between", fontWeight: 900, fontSize: "12pt" }}>
          <span>TOTAL L</span>
          <span>{formatCurrency(total)}</span>
        </div>
      </div>

      {invoice.paymentMethod && (
        <div style={{ marginBottom: "4px" }}>
          {row("Forma de pago:", PAYMENT_LABELS[invoice.paymentMethod] ?? invoice.paymentMethod)}
          {invoice.paymentMethod === "transferencia" && invoice.transferReference &&
            row("Referencia:", invoice.transferReference)}
        </div>
      )}

      {invoice.notes && (
        <>
          {sep()}
          <div style={{ ...base, fontSize: "8pt", color: "#333" }}>{invoice.notes}</div>
        </>
      )}

      {sep()}

      <div style={{ textAlign: "center", marginTop: "4px" }}>
        <div style={{ ...base, fontSize: "8.5pt", fontStyle: "italic" }}>Gracias por su preferencia</div>
        <div style={{ ...base, fontWeight: 700 }}>C&amp;G Electronics</div>
      </div>
    </div>
  );
}

function PrintModal({ invoice, onClose }: { invoice: Invoice; onClose: () => void }) {
  const [preview, setPreview] = useState<"carta" | "termica">("carta");

  const btnBase: React.CSSProperties = {
    border: "none", borderRadius: "8px", padding: "8px 16px",
    fontWeight: 700, fontSize: "13px", cursor: "pointer",
    display: "flex", alignItems: "center", gap: "6px",
  };
  const tabBase: React.CSSProperties = {
    border: "1px solid #334155", borderRadius: "6px",
    padding: "6px 14px", fontSize: "12px", cursor: "pointer", fontWeight: 600,
  };

  return (
    <div style={{
      position: "fixed", inset: 0, zIndex: 1000,
      background: "rgba(0,0,0,0.6)", display: "flex", flexDirection: "column",
    }}>
      <div style={{
        background: "#1e293b", color: "#fff",
        display: "flex", alignItems: "center", justifyContent: "space-between",
        padding: "10px 20px", gap: "12px", flexShrink: 0, flexWrap: "wrap",
      }}>
        <div style={{ display: "flex", gap: "6px", alignItems: "center" }}>
          <span style={{ fontSize: "13px", fontWeight: 600, marginRight: "6px" }}>
            {invoice.invoiceNumber}
          </span>
          <button
            onClick={() => setPreview("carta")}
            style={{
              ...tabBase,
              background: preview === "carta" ? "#2563eb" : "transparent",
              color: preview === "carta" ? "#fff" : "#94a3b8",
              borderColor: preview === "carta" ? "#2563eb" : "#334155",
            }}
          >
            Vista Carta
          </button>
          <button
            onClick={() => setPreview("termica")}
            style={{
              ...tabBase,
              background: preview === "termica" ? "#374151" : "transparent",
              color: preview === "termica" ? "#fff" : "#94a3b8",
              borderColor: preview === "termica" ? "#6b7280" : "#334155",
            }}
          >
            Vista Térmica
          </button>
        </div>

        <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
          <button
            onClick={() => injectPrintStyle(CARTA_PRINT_STYLES)}
            style={{ ...btnBase, background: "#2563eb", color: "#fff" }}
          >
            <Printer size={14} /> Imprimir Carta
          </button>
          <button
            onClick={() => printThermal(invoice)}
            style={{ ...btnBase, background: "#374151", color: "#fff" }}
          >
            <Printer size={14} /> Imprimir Térmica 80mm
          </button>
          <button
            onClick={onClose}
            style={{ ...btnBase, background: "transparent", color: "#94a3b8", border: "1px solid #334155", fontWeight: 600 }}
          >
            Cerrar
          </button>
        </div>
      </div>

      <div style={{ flex: 1, overflowY: "auto", display: "flex", justifyContent: "center", alignItems: "flex-start", padding: "28px 16px" }}>
        <div style={{ boxShadow: "0 8px 40px rgba(0,0,0,0.45)", borderRadius: "4px", overflow: "hidden" }}>
          {preview === "carta"
            ? <InvoicePrintView invoice={invoice} />
            : <ThermalPrintView invoice={invoice} />
          }
        </div>
      </div>
    </div>
  );
}

// ─── Form types ───────────────────────────────────────────────────────────────

type ItemForm = {
  description: string;
  quantity: number;
  unitPrice: number;
  productId?: number;
  productType?: "perfumeria" | "sublimacion" | "combo";
  costPrice?: number;
  code?: string;
};

type InvoiceForm = {
  clientId: string;
  clientName: string;
  clientPhone: string;
  clientEmail: string;
  clientAddress: string;
  clientCity: string;
  clientDepartment: string;
  clientRtn: string;
  discount: number;
  tax: number;
  notes: string;
  issueDate: string;
  dueDate: string;
  paymentMethod: "efectivo" | "tarjeta" | "transferencia" | "cheque";
  transferReference: string;
  numeroGuia: string;
  transportista: string;
  estadoEntrega: string;
  items: ItemForm[];
};

const today = new Date().toISOString().split("T")[0];
const defaultForm = (): InvoiceForm => ({
  clientId: "", clientName: "", clientPhone: "", clientEmail: "",
  clientAddress: "", clientCity: "", clientDepartment: "", clientRtn: "",
  discount: 0, tax: 0,
  notes: "60 DIAS DE GARANTIA POR DEFECTOS DE FABRICA DESDE LA FECHA DE EMISION DE LA FACTURA.",
  issueDate: today, dueDate: "",
  paymentMethod: "efectivo", transferReference: "", numeroGuia: "", transportista: "", estadoEntrega: "Pendiente",
  items: [{ description: "", quantity: 1, unitPrice: 0, code: "" }],
});

// ─── Main Component ───────────────────────────────────────────────────────────

export default function Facturas() {
  const { toast } = useToast();
  const { data: clients } = useListClients();

  const [view, setView] = useState<"list" | "form">("list");
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState("all");
  const [searchQuery, setSearchQuery] = useState("");

  const [submitting, setSubmitting] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState<InvoiceForm>(defaultForm());

  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteId, setDeleteId] = useState<number | null>(null);
  const [printInvoice, setPrintInvoice] = useState<Invoice | null>(null);

  const [internalExpenses, setInternalExpenses] = useState(0);
  const [internalExpensesNote, setInternalExpensesNote] = useState("");
  const [profitTaxes, setProfitTaxes] = useState(0);
  const [taxMode, setTaxMode] = useState<"manual" | "percent">("manual");
  const [taxPercent, setTaxPercent] = useState(0);

  const [waInvoice, setWaInvoice] = useState<Invoice | null>(null);
  const [waPhoneInput, setWaPhoneInput] = useState("");
  const [waDialogOpen, setWaDialogOpen] = useState(false);

  const [guideModalOpen, setGuideModalOpen] = useState(false);
  const [guidePreviewUrl, setGuidePreviewUrl] = useState("");
  const [guideInvoice, setGuideInvoice] = useState<Invoice | null>(null);
  const [guideFile, setGuideFile] = useState<File | null>(null);
  const [guideNumber, setGuideNumber] = useState("");
  const [guideCourier, setGuideCourier] = useState("C807");
  const [guideUploading, setGuideUploading] = useState(false);

  const [checkoutOpen, setCheckoutOpen] = useState(false);
  const [receivedAmount, setReceivedAmount] = useState<string>("");
  const [clientModalOpen, setClientModalOpen] = useState(false);
  const [activeTab, setActiveTab] = useState("billing");

  const [products, setProducts] = useState<ProductOption[]>([]);
  const [itemSearch, setItemSearch] = useState<Record<number, string>>({});
  const [itemDropOpen, setItemDropOpen] = useState<Record<number, boolean>>({});
  const [codeError, setCodeError] = useState<Record<number, boolean>>({});
  const [productModalOpen, setProductModalOpen] = useState(false);
  const [itemSearchQuery, setItemSearchQuery] = useState("");

  const [quickClientModalOpen, setQuickClientModalOpen] = useState(false);
  const [quickClientName, setQuickClientName] = useState("");
  const [quickClientRtn, setQuickClientRtn] = useState("");
  const [quickClientSaving, setQuickClientSaving] = useState(false);

  const [notesModalOpen, setNotesModalOpen] = useState(false);
  const [catFilter, setCatFilter] = useState<string>("all");

  useEffect(() => {
    async function loadProducts() {
      try {
        const [perf, sub, combos] = await Promise.all([
          apiFetch("/perfumery"),
          apiFetch("/sublimation"),
          apiFetch("/combos"),
        ]);
        const perfOpts: ProductOption[] = (Array.isArray(perf) ? perf : []).map((p: any) => ({
          id: p.id,
          label: `${p.brand} ${p.name} ${p.ml}ml`,
          price: Number(p.salePrice ?? 0),
          costPrice: Number(p.costPrice ?? 0),
          type: "perfumeria" as const,
          code: p.code ?? null,
          stock: Number(p.stock ?? 0),
          brand: p.brand,
          ml: p.ml,
        }));
        const subOpts: ProductOption[] = (Array.isArray(sub) ? sub : []).map((s: any) => ({
          id: s.id,
          label: s.name,
          price: Number(s.salePrice ?? 0),
          costPrice: Number(s.costPrice ?? 0),
          type: "sublimacion" as const,
          code: s.code ?? null,
          stock: Number(s.stock ?? 0),
          brand: "Varios",
          subType: s.itemType,
        }));
        const comboOpts: ProductOption[] = (Array.isArray(combos) ? combos : []).map((c: any) => ({
          id: c.id,
          label: c.name,
          price: c.fixedPrice != null ? Number(c.fixedPrice) : c.items.reduce((sum: number, it: any) => sum + Number(it.unitPrice), 0),
          costPrice: Number(c.totalCost ?? 0),
          type: "combo" as const,
          code: c.code ?? null,
          stock: 999,
          comboItems: c.items,
          fixedPrice: c.fixedPrice != null ? Number(c.fixedPrice) : null,
          brand: "C&G Combo",
        }));
        setProducts([...perfOpts, ...subOpts, ...comboOpts]);
      } catch { }
    }
    loadProducts();
  }, []);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        // Don't close view if any modal/dialog is open
        if (document.querySelector('[role="dialog"]') || document.querySelector('[data-state="open"]')) return;
        setView("list");
        return;
      }
      switch (e.key) {
        case "F2":
          e.preventDefault();
          const lastIdx = form.items.length - 1;
          document.getElementById(`product-code-input-${lastIdx}`)?.focus();
          break;
        case "F4":
          e.preventDefault();
          setCheckoutOpen(true);
          break;
        case "F6":
          e.preventDefault();
          setNotesModalOpen(true);
          break;
        case "F7":
          e.preventDefault();
          setClientModalOpen(true);
          break;
        case "F3":
          e.preventDefault();
          setProductModalOpen(true);
          break;
        case "F9":
          e.preventDefault();
          setQuickClientName("");
          setQuickClientRtn("");
          setQuickClientModalOpen(true);
          break;
        case "F8":
          e.preventDefault();
          if (editingId) handleCancel(editingId);
          break;
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [view, form.items.length, checkoutOpen, clientModalOpen, productModalOpen, editingId]);

  const loadInvoices = async () => {
    try {
      setLoading(true);
      const data = await apiFetch("/invoices");
      setInvoices(Array.isArray(data) ? data : []);
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadInvoices();

    // Revisión previa de cotización
    const draftStr = localStorage.getItem("facturaDraft");
    if (draftStr) {
      try {
        const draft = JSON.parse(draftStr);
        setForm({
          clientId: String(draft.clientId ?? ""),
          clientName: draft.clientName || "",
          clientPhone: draft.clientPhone || "",
          clientEmail: draft.clientEmail || "",
          clientAddress: draft.clientAddress || "",
          clientCity: draft.clientCity || "",
          clientDepartment: draft.clientDepartment || "",
          clientRtn: draft.clientRtn || "",
          paymentMethod: "efectivo",
          transferReference: "",
          discount: Number(draft.discount || 0),
          tax: Number(draft.tax || 0),
          notes: draft.notes || "",
          issueDate: new Date().toISOString().split("T")[0],
          dueDate: "",
          numeroGuia: "",
          transportista: "",
          estadoEntrega: "Pendiente",
          items: draft.items?.map((it: any) => ({
            description: it.description,
            quantity: it.quantity,
            unitPrice: it.unitPrice,
          })) ?? [],
        });
        setEditingId(null);
        setView("form");
        localStorage.removeItem("facturaDraft");
        toast({ title: "Borrador cargado" });
      } catch (err) {
        localStorage.removeItem("facturaDraft");
      }
    }
  }, []);

  const openCreate = () => {
    setForm(defaultForm());
    setEditingId(null);
    setInternalExpenses(0);
    setProfitTaxes(0);
    setView("form");
  };

  const openEdit = async (inv: Invoice) => {
    try {
      const full: Invoice = await apiFetch(`/invoices/${inv.id}`);
      setForm({
        clientId: String(full.clientId ?? ""),
        clientName: full.clientName,
        clientPhone: full.clientPhone ?? "",
        clientEmail: full.clientEmail ?? "",
        clientAddress: full.clientAddress ?? "",
        clientCity: full.clientCity ?? "",
        clientDepartment: full.clientDepartment ?? "",
        clientRtn: full.clientRtn ?? "",
        paymentMethod: (full.paymentMethod as InvoiceForm["paymentMethod"]) ?? "efectivo",
        transferReference: full.transferReference ?? "",
        discount: full.discount,
        tax: full.tax,
        notes: full.notes ?? "",
        issueDate: full.issueDate,
        dueDate: full.dueDate ?? "",
        numeroGuia: full.numeroGuia ?? "",
        transportista: full.transportista ?? "",
        estadoEntrega: full.estadoEntrega ?? "Pendiente",
          items: full.items?.map(it => ({
            description: it.description,
            quantity: it.quantity,
            unitPrice: it.unitPrice,
            code: "",
          })) ?? [],
      });
      setEditingId(full.id);
      setInternalExpenses(full.internalExpenses ?? 0);
      setProfitTaxes(full.taxes ?? 0);
      setView("form");
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    }
  };

  const selectClient = (client: Client) => {
    setForm(f => ({
      ...f,
      clientId: String(client.id),
      clientName: client.name,
      clientPhone: client.phone ?? "",
      clientEmail: client.email ?? "",
      clientAddress: client.address ?? "",
      clientCity: client.city ?? "",
      clientDepartment: client.department ?? "",
      clientRtn: client.rtn ?? "",
    }));
    setClientModalOpen(false);
  };

  const handleQuickClientSave = async () => {
    if (!quickClientName.trim()) {
      toast({ title: "Error", description: "Nombre requerido", variant: "destructive" });
      return;
    }
    setQuickClientSaving(true);
    try {
      const newClient = await apiFetch("/clients", {
        method: "POST",
        body: JSON.stringify({
          name: quickClientName,
          rtn: quickClientRtn || undefined,
          city: "SPS",
          department: "Cortés",
          phone: "",
          email: "",
          address: "Consumidor Final"
        }),
      });
      selectClient(newClient);
      setQuickClientModalOpen(false);
      toast({ title: "Cliente Guardado", description: "Registrado y seleccionado para esta factura." });
    } catch (e: any) {
      toast({ title: "Error al guardar", description: e.message, variant: "destructive" });
    } finally {
      setQuickClientSaving(false);
    }
  };

  const selectProduct = (itemIndex: number, product: ProductOption, initialQuantity?: number) => {
    setForm(f => {
      const quantityPrefix = initialQuantity ?? f.items[itemIndex].quantity;
      if (product.type === "combo" && product.comboItems) {
        const expanded = product.comboItems.map((ci: any) => ({
          description: ci.productName,
          quantity: ci.quantity * quantityPrefix,
          unitPrice: product.fixedPrice != null ? product.fixedPrice / product.comboItems!.length : Number(ci.unitPrice),
          productId: ci.productId,
          productType: ci.productType,
          costPrice: Number(ci.costPrice ?? 0),
        }));
        const newItems = [...f.items.slice(0, itemIndex), ...expanded, ...f.items.slice(itemIndex + 1)];
        if (newItems[newItems.length - 1].description !== "") newItems.push({ description: "", quantity: 1, unitPrice: 0, code: "" });
        return { ...f, items: newItems };
      }
      const items = [...f.items];
      items[itemIndex] = { ...items[itemIndex], description: product.label, quantity: quantityPrefix, unitPrice: product.price, productId: product.id, productType: product.type, costPrice: product.costPrice, code: product.code || "" };
      if (itemIndex === items.length - 1) items.push({ description: "", quantity: 1, unitPrice: 0, code: "" });
      return { ...f, items };
    });
    setItemDropOpen(s => ({ ...s, [itemIndex]: false }));
  };

  const handleCodeSearch = async (itemIndex: number, inputValue: string) => {
    let trimmed = inputValue.trim();
    if (!trimmed) return;
    let q = 1;
    if (trimmed.includes("*")) {
      const p = trimmed.split("*");
      q = Number(p[0]) || 1;
      trimmed = p.slice(1).join("*").trim();
    }
    const found = products.find(p => p.code?.toLowerCase() === trimmed.toLowerCase()) || products.find(p => p.id === Number(trimmed));
    if (found) { selectProduct(itemIndex, found, q); setCodeError(s => ({ ...s, [itemIndex]: false })); }
    else { setCodeError(s => ({ ...s, [itemIndex]: true })); setTimeout(() => setCodeError(s => ({ ...s, [itemIndex]: false })), 2000); }
  };

  const updateItem = (i: number, field: keyof ItemForm, value: string | number) => {
    setForm(f => {
      const items = [...f.items];
      items[i] = { ...items[i], [field]: value };
      return { ...f, items };
    });
  };

  const addItem = () => setForm(f => ({ ...f, items: [...f.items, { description: "", quantity: 1, unitPrice: 0, code: "" }] }));
  const removeItem = (i: number) => setForm(f => ({ ...f, items: f.items.filter((_, idx) => idx !== i) }));

  const subtotal = form.items.reduce((s, it) => s + it.quantity * it.unitPrice, 0);
  const total = subtotal - form.discount + form.tax;
  const totalRevenue = subtotal;
  const totalBaseCost = form.items.reduce((s, it) => s + it.quantity * (it.costPrice ?? 0), 0);
  const grossProfit = totalRevenue - totalBaseCost;
  const netBusinessProfit = grossProfit - internalExpenses;
  const partnerPayout = netBusinessProfit * 0.5;
  const ownerGross = netBusinessProfit * 0.5;
  const computedTaxes = taxMode === "percent" ? ownerGross * (taxPercent / 100) : profitTaxes;
  const ownerRealIncome = ownerGross - computedTaxes;

  const handleSubmit = async () => {
    if (!form.clientName.trim()) { toast({ title: "Error", description: "Cliente requerido", variant: "destructive" }); return; }
    setSubmitting(true);
    try {
      const body = {
        ...form,
        clientId: form.clientId ? Number(form.clientId) : undefined,
        baseCost: totalBaseCost,
        internalExpenses,
        taxes: computedTaxes,
        partnerPayout,
        ownerPayout: ownerRealIncome,
        items: form.items.filter(it => it.description.trim() !== "")
      };
      if (editingId) await apiFetch(`/invoices/${editingId}`, { method: "PATCH", body: JSON.stringify(body) });
      else await apiFetch("/invoices", { method: "POST", body: JSON.stringify(body) });
      toast({ title: "Guardado" });
      setView("list");
      loadInvoices();
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    } finally { setSubmitting(false); }
  };

  const handleCancel = async (id: number) => {
    try {
      await apiFetch(`/invoices/${id}`, { method: "PATCH", body: JSON.stringify({ status: "cancelada" }) });
      toast({ title: "Cancelada" });
      loadInvoices();
      if (view === "form") setView("list");
    } catch (e: any) { toast({ title: "Error", description: e.message, variant: "destructive" }); }
  };

  const handleDelete = async () => {
    if (!deleteId) return;
    try {
      await apiFetch(`/invoices/${deleteId}`, { method: "DELETE" });
      toast({ title: "Eliminada" });
      setDeleteOpen(false);
      loadInvoices();
      if (view === "form") setView("list");
    } catch (e: any) { toast({ title: "Error", description: e.message, variant: "destructive" }); }
  };

  const submitGuide = async () => {
    if (!guideInvoice) return;
    setGuideUploading(true);
    try {
      if (guideFile) {
        const fd = new FormData();
        fd.append("foto", guideFile);
        if (guideNumber) fd.append("numeroGuia", guideNumber);
        fd.append("transportista", guideCourier);
        await fetch(`/api/invoices/${guideInvoice.id}/guia`, { method: "POST", body: fd });
      } else {
        await apiFetch(`/invoices/${guideInvoice.id}`, { method: "PATCH", body: JSON.stringify({ numeroGuia: guideNumber, transportista: guideCourier, estadoEntrega: "En Tránsito" }) });
      }
      toast({ title: "Guía guardada" });
      setGuideModalOpen(false);
      loadInvoices();
    } catch (e: any) { toast({ title: "Error", description: e.message, variant: "destructive" }); }
    finally { setGuideUploading(false); }
  };

  const markEntregado = async (id: number) => {
    try {
      await apiFetch(`/invoices/${id}`, { method: "PATCH", body: JSON.stringify({ estadoEntrega: "Entregado" }) });
      toast({ title: "Entregado" });
      loadInvoices();
    } catch (e: any) { toast({ title: "Error", description: e.message, variant: "destructive" }); }
  };

  const handleWhatsApp = (inv: Invoice) => {
    if (inv.clientPhone) {
      openWhatsApp(inv, inv.clientPhone);
    } else {
      setWaInvoice(inv);
      setWaPhoneInput("");
      setWaDialogOpen(true);
    }
  };

  const openPrint = (inv: Invoice) => setPrintInvoice(inv);





  const StatusBadge = ({ status }: { status: Invoice["status"] }) => {
    const config = STATUS_CONFIG[status];
    return (
      <span className={`inline-flex items-center gap-1.5 text-[10px] font-black uppercase px-2.5 py-1 rounded-full border shadow-sm ${config.classes}`}>
        <span className={`w-1.5 h-1.5 rounded-full ${config.dot}`} />
        {config.label}
      </span>
    );
  };

  const editingInvoice = editingId ? invoices.find(i => i.id === editingId) : null;

  const filtered = invoices
    .filter(i => statusFilter === "all" || i.status === statusFilter)
    .filter(i =>
      !searchQuery ||
      i.clientName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      i.invoiceNumber.toLowerCase().includes(searchQuery.toLowerCase())
    );

  const counts = {
    all: invoices.length,
    pendiente: invoices.filter(i => i.status === "pendiente").length,
    pagada: invoices.filter(i => i.status === "pagada").length,
    cancelada: invoices.filter(i => i.status === "cancelada").length,
  };

  if (view === "list") {
    return (
      <div className="space-y-5 animate-in fade-in duration-200">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <FileText className="h-6 w-6 text-foreground" />
            <h1 className="text-xl font-bold">Facturas</h1>
          </div>
          <Button onClick={openCreate} className="h-10 bg-blue-600 hover:bg-blue-700 text-white font-bold uppercase tracking-widest px-5 shadow-lg text-[10px]">
            <Plus className="h-3.5 w-3.5 mr-1.5" /> Nueva Factura
          </Button>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <div className="relative">
            <Search className="absolute left-3 top-2 h-3.5 w-3.5 text-muted-foreground" />
            <Input className="pl-9 h-9 w-60 bg-background text-xs" placeholder="Buscar factura..." value={searchQuery} onChange={e => setSearchQuery(e.target.value)} />
          </div>
          <div className="flex bg-muted p-1 rounded-lg border gap-1 overflow-x-auto no-scrollbar">
            {(["all", "pendiente", "pagada", "cancelada"] as const).map(s => {
              const labels: Record<string, string> = { all: "Todas", pendiente: "Pendientes", pagada: "Pagadas", cancelada: "Canceladas" };
              const count = counts[s];
              const active = statusFilter === s;
              return (
                <button
                  key={s}
                  onClick={() => setStatusFilter(s)}
                  className={`flex items-center gap-2 px-4 py-1.5 rounded-md text-[10px] font-black uppercase tracking-widest transition-all whitespace-nowrap ${active
                    ? "bg-background text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground"
                    }`}
                >
                  {labels[s]}
                  <span className={`px-1.5 py-0.5 rounded-full text-[9px] ${active ? "bg-blue-100 text-blue-700" : "bg-muted-foreground/10 text-muted-foreground"}`}>
                    {count}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        <div className="bg-card rounded-xl border shadow-sm overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 border-b">
              <tr>
                <th className="text-left px-3 py-3 font-black text-[9px] uppercase tracking-widest text-muted-foreground">Número</th>
                <th className="text-left px-3 py-3 font-black text-[9px] uppercase tracking-widest text-muted-foreground">Cliente</th>
                <th className="text-left px-3 py-3 font-black text-[9px] uppercase tracking-widest text-muted-foreground">Estado</th>
                <th className="text-left px-3 py-3 font-black text-[9px] uppercase tracking-widest text-muted-foreground">Logística</th>
                <th className="text-right px-3 py-3 font-black text-[9px] uppercase tracking-widest text-muted-foreground">Total</th>
                <th className="w-16" />
              </tr>
            </thead>
            <tbody className="divide-y divide-muted/50">
              {filtered.map(inv => (
                <tr key={inv.id} className="hover:bg-muted/30 transition-colors group">
                  <td className="px-3 py-3 font-mono font-bold text-[11px] text-foreground cursor-pointer" onClick={() => openEdit(inv)}>{inv.invoiceNumber}</td>
                  <td className="px-3 py-3 font-medium text-[11px] text-foreground cursor-pointer" onClick={() => openEdit(inv)}>{inv.clientName}</td>
                  <td className="px-3 py-3 cursor-pointer" onClick={() => openEdit(inv)}><StatusBadge status={inv.status} /></td>
                  <td className="px-3 py-3">
                    <div className="flex items-center gap-2">
                       <GuideBadge status={inv.estadoEntrega} />
                       {inv.estadoEntrega !== 'Entregado' && <button onClick={() => markEntregado(inv.id)} className="h-5 px-1.5 bg-emerald-600 text-white rounded text-[8px] font-black uppercase">Ok</button>}
                    </div>
                  </td>
                  <td className="px-3 py-3 text-right font-black text-[11px] text-foreground">{formatCurrency(inv.total)}</td>
                  <td className="px-3 py-3 text-right">
                    <div className="flex gap-1 justify-end opacity-0 group-hover:opacity-100 transition-opacity">
                      <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => handleWhatsApp(inv)}><MessageCircle className="h-3.5 w-3.5" /></Button>
                      <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openPrint(inv)}><Printer className="h-3.5 w-3.5" /></Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    );
  }

  const currentStatus = editingInvoice?.status ?? "pendiente";

  return (
    <div className="flex flex-col h-[calc(100vh-1rem)] max-h-[calc(100vh-1rem)] overflow-hidden bg-background animate-in fade-in duration-200 border rounded-lg shadow-2xl m-2">
      <header className="h-14 border-b bg-muted/40 flex items-center justify-between px-6 shrink-0">
        <div className="flex items-center gap-6">
          <Button variant="ghost" size="sm" className="h-9 gap-1.5 font-bold uppercase tracking-widest text-muted-foreground" onClick={() => { setView("list"); setEditingId(null); setForm(defaultForm()); }}>
            <ArrowLeft className="h-4 w-4" /> Salir [ESC]
          </Button>
          <div className="h-6 w-px bg-border mx-2"></div>
          <div className="flex flex-col">
            <h1 className="font-black text-sm tracking-tight uppercase leading-tight">{editingId ? (editingInvoice?.invoiceNumber ?? "Factura") : "Terminal POS"}</h1>
            <span className="text-[9px] font-black text-muted-foreground uppercase tracking-[0.2em]">C&G Electronics</span>
          </div>
          {editingId && editingInvoice && <StatusBadge status={editingInvoice.status} />}
        </div>
        <div className="flex items-center gap-3">
          <Button variant="outline" size="sm" className="h-9 gap-2 font-bold uppercase tracking-wider border-blue-200/50 text-blue-600 hover:bg-blue-50" onClick={() => setProductModalOpen(true)}><Package className="h-4 w-4" /> Productos [F3]</Button>
          <Button variant="outline" size="sm" className="h-9 gap-2 font-bold uppercase tracking-wider" onClick={() => setNotesModalOpen(true)}><FileText className="h-4 w-4" /> Notas [F6]</Button>
          <Button variant="outline" size="sm" className="h-9 gap-2 font-bold uppercase tracking-wider" onClick={() => setClientModalOpen(true)}><UserPlus className="h-4 w-4" /> Cliente [F7]</Button>
          <Button className="h-9 bg-blue-600 hover:bg-blue-700 text-white font-bold uppercase tracking-wider px-6 shadow-lg" onClick={() => setCheckoutOpen(true)}><Coins className="h-4 w-4 mr-2" /> Cobrar [F4]</Button>
        </div>
      </header>

      <main className="flex flex-1 overflow-hidden">
        <section className="flex-[7] flex flex-col border-r overflow-hidden bg-card/50">
          <div className="flex-1 overflow-auto">
            <table className="w-full border-collapse">
              <thead className="sticky top-0 bg-muted z-20 border-b">
                <tr>
                  <th className="px-4 py-3 text-left text-[10px] font-black uppercase tracking-widest text-muted-foreground w-12">#</th>
                  <th className="px-2 py-3 text-left text-[10px] font-black uppercase tracking-widest text-muted-foreground w-40">Código [F2]</th>
                  <th className="px-2 py-3 text-left text-[10px] font-black uppercase tracking-widest text-muted-foreground">Descripción</th>
                  <th className="px-2 py-3 text-center text-[10px] font-black uppercase tracking-widest text-muted-foreground w-20">Cant.</th>
                  <th className="px-2 py-3 text-right text-[10px] font-black uppercase tracking-widest text-muted-foreground w-32">Precio</th>
                  <th className="px-2 py-3 text-right text-[10px] font-black uppercase tracking-widest text-muted-foreground w-32">Total</th>
                  <th className="w-10"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-muted/50">
                {form.items.map((it, i) => (
                  <tr key={i} className="group hover:bg-blue-50/50 transition-colors">
                    <td className="px-4 py-4 text-[10px] font-black font-mono text-muted-foreground/40">{i + 1}</td>
                    <td className="px-2 py-2">
                      <Input
                        id={`product-code-input-${i}`}
                        className={`h-9 font-mono text-xs font-bold ${codeError[i] ? "border-red-500 bg-red-50" : "bg-transparent border-transparent focus:border-blue-500"}`}
                        placeholder="Cód..."
                        value={it.code}
                        onChange={e => updateItem(i, "code", e.target.value)}
                        onKeyDown={e => e.key === "Enter" && handleCodeSearch(i, e.currentTarget.value)}
                      />
                    </td>
                    <td className="px-2 py-2">
                       <Input className="h-9 text-xs font-semibold bg-transparent border-transparent focus:border-blue-500" placeholder="Producto..." value={it.description} onChange={e => updateItem(i, "description", e.target.value)} />
                    </td>
                    <td className="px-2 py-2">
                       <Input type="number" className="h-9 text-center font-mono font-bold text-xs bg-transparent border-transparent focus:border-blue-500" value={it.quantity} onChange={e => updateItem(i, "quantity", Number(e.target.value))} />
                    </td>
                    <td className="px-2 py-2">
                       <Input type="number" className="h-9 text-right font-mono font-bold text-xs bg-transparent border-transparent focus:border-blue-500" value={it.unitPrice} onChange={e => updateItem(i, "unitPrice", Number(e.target.value))} />
                    </td>
                    <td className="px-2 py-2 text-right font-black font-mono text-xs">{formatCurrency(it.quantity * it.unitPrice)}</td>
                    <td className="px-4 py-2">
                       <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-red-600 opacity-0 group-hover:opacity-100" onClick={() => removeItem(i)}><Trash2 className="h-4 w-4" /></Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="p-6 border-t bg-muted/10">
               <Button variant="outline" size="sm" className="h-10 gap-2 border-dashed font-bold uppercase tracking-widest text-blue-600 border-blue-200" onClick={addItem}><Plus className="h-4 w-4" /> Agregar Línea</Button>
            </div>
          </div>
        </section>

        <aside className="flex-[3] flex flex-col bg-muted/20 overflow-hidden min-w-[340px] max-w-[400px]">
          <section className="p-6 bg-card border-b shadow-sm shrink-0">
            <div className="space-y-3">
              <div className="flex justify-between items-baseline"><span className="text-[9px] font-black text-muted-foreground uppercase tracking-widest">Subtotal</span><span className="text-lg font-bold font-mono">{formatCurrency(subtotal)}</span></div>
              <div className="flex justify-between items-center text-red-600"><span className="text-[9px] font-black uppercase tracking-widest">Descuento</span><Input type="number" className="w-20 h-7 text-right font-mono font-bold text-xs" value={form.discount} onChange={e => setForm(f => ({ ...f, discount: Number(e.target.value) }))} /></div>
              <div className="flex justify-between items-center"><span className="text-[9px] font-black uppercase tracking-widest">ISV (15%)</span><Input type="number" className="w-20 h-7 text-right font-mono font-bold text-xs" value={form.tax} onChange={e => setForm(f => ({ ...f, tax: Number(e.target.value) }))} /></div>
              <div className="pt-4 border-t border-slate-200">
                <div className="bg-slate-950 text-white p-4 rounded-xl shadow-xl flex flex-col items-end">
                   <span className="text-[8px] font-black uppercase tracking-[0.3em] self-start opacity-50 mb-1">Total Factura</span>
                   <div className="text-4xl font-black font-mono tracking-tighter tabular-nums">{formatCurrency(total)}</div>
                </div>
              </div>
            </div>
          </section>

          <section className="flex-1 flex flex-col overflow-hidden">
            <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1 flex flex-col">
              <TabsList className="w-full justify-start h-12 bg-card border-b rounded-none px-6 gap-6">
                <TabsTrigger value="billing" className="text-[10px] font-black uppercase tracking-widest">Info</TabsTrigger>
                <TabsTrigger value="delivery" className="text-[10px] font-black uppercase tracking-widest">Logística</TabsTrigger>
                <TabsTrigger value="profit" className="text-[10px] font-black uppercase tracking-widest">Interno</TabsTrigger>
              </TabsList>
              <div className="flex-1 overflow-auto p-4 bg-card/30">
                <TabsContent value="billing" className="m-0 space-y-4">
                  <div className="p-3 bg-blue-600/10 border border-blue-500/20 rounded-xl">
                    <div className="flex justify-between items-center mb-1">
                      <span className="text-[8px] font-black uppercase text-blue-400 tracking-widest">Cliente Seleccionado</span>
                      <span className="text-[8px] font-bold text-blue-500/50 uppercase">#{form.clientId || "N/A"}</span>
                    </div>
                    <span className="text-sm font-black text-white truncate block">{form.clientName || "Consumidor Final"}</span>
                    <span className="text-[9px] font-bold text-slate-500 block uppercase tracking-wider mt-0.5">{form.clientRtn || "SIN RTN REGISTRADO"}</span>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1"><Label className="text-[9px] font-black uppercase text-slate-500 tracking-widest">Emisión</Label><Input type="date" className="h-8 font-mono font-bold text-xs bg-background/50" value={form.issueDate} onChange={e => setForm(f => ({ ...f, issueDate: e.target.value }))} /></div>
                    <div className="space-y-1"><Label className="text-[9px] font-black uppercase text-slate-500 tracking-widest">Vencimiento</Label><Input type="date" className="h-8 font-mono font-bold text-xs bg-background/50" value={form.dueDate} onChange={e => setForm(f => ({ ...f, dueDate: e.target.value }))} /></div>
                  </div>
                </TabsContent>
                <TabsContent value="delivery" className="m-0 space-y-4">
                   <div className="space-y-4">
                      <Select value={form.transportista} onValueChange={v => setForm(f => ({ ...f, transportista: v }))}><SelectTrigger className="h-10 font-bold"><SelectValue placeholder="Transportista" /></SelectTrigger><SelectContent><SelectItem value="C807">C807</SelectItem><SelectItem value="Forza">Forza</SelectItem><SelectItem value="CAEX">CAEX</SelectItem><SelectItem value="Pickup">Tienda</SelectItem></SelectContent></Select>
                      <Input className="h-10 font-mono font-bold" placeholder="Tracking #" value={form.numeroGuia} onChange={e => setForm(f => ({ ...f, numeroGuia: e.target.value }))} />
                      <Select value={form.estadoEntrega} onValueChange={v => setForm(f => ({ ...f, estadoEntrega: v }))}><SelectTrigger className="h-10 font-bold"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="Pendiente">Pendiente</SelectItem><SelectItem value="En Tránsito">En Tránsito</SelectItem><SelectItem value="Entregado">Entregado</SelectItem></SelectContent></Select>
                   </div>
                </TabsContent>
                <TabsContent value="profit" className="m-0 space-y-3">
                   <div className="bg-slate-900 text-white p-4 rounded-xl space-y-3 shadow-xl border border-white/5">
                      <div className="flex justify-between items-baseline text-slate-400"><span className="text-[9px] font-bold uppercase">Ingreso</span><span className="text-[11px] font-mono">{formatCurrency(totalRevenue)}</span></div>
                      <div className="flex justify-between items-baseline text-red-400"><span className="text-[9px] font-bold uppercase">Costo</span><span className="text-[11px] font-mono">-{formatCurrency(totalBaseCost)}</span></div>
                      <div className="flex justify-between items-center py-2 border-y border-white/5"><span className="text-[9px] font-black uppercase text-blue-400">Ut. Bruta</span><span className="text-base font-black font-mono text-blue-400">{formatCurrency(grossProfit)}</span></div>
                      <div className="grid grid-cols-2 gap-2 pt-1">
                        <div className="p-2 bg-white/5 rounded-lg text-center"><span className="text-[8px] font-black uppercase text-slate-500 block mb-1">Socio</span><span className="text-xs font-black font-mono">{formatCurrency(partnerPayout)}</span></div>
                        <div className="p-2 bg-emerald-500/10 rounded-lg text-center border border-emerald-500/20"><span className="text-[8px] font-black uppercase text-emerald-500 block mb-1">Dueños</span><span className="text-xs font-black font-mono text-emerald-400">{formatCurrency(ownerRealIncome)}</span></div>
                      </div>
                   </div>
                </TabsContent>
              </div>
            </Tabs>
          </section>

          <section className="p-6 bg-card border-t grid grid-cols-2 gap-4 shrink-0 shadow-xl">
            <Button variant="outline" className="h-14 font-black uppercase tracking-widest text-red-600 border-red-100 hover:bg-red-50" onClick={() => editingId && handleCancel(editingId)} disabled={!editingId || currentStatus === "cancelada"}><XCircle className="h-5 w-5 mr-2" /> Anular</Button>
            <Button className="h-14 bg-blue-600 hover:bg-blue-700 text-white font-black uppercase tracking-widest shadow-lg" onClick={() => setCheckoutOpen(true)}><Coins className="h-5 w-5 mr-2" /> Cobrar [F4]</Button>
          </section>
        </aside>
      </main>

      {/* Modals Inline to prevent re-mounting flicker */}
      <Dialog open={checkoutOpen} onOpenChange={setCheckoutOpen}>
        <DialogContent className="max-w-md p-0 overflow-hidden border-none shadow-2xl">
          <div className="bg-slate-950 p-8 text-white">
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-xl font-black uppercase tracking-widest text-blue-400">Finalizar Venta</h2>
              <Coins className="h-6 w-6 text-blue-400" />
            </div>
            <div className="space-y-1 mb-8">
              <span className="text-[10px] font-black uppercase text-slate-500 tracking-[0.3em]">Total a Pagar</span>
              <div className="text-5xl font-black font-mono tracking-tighter">{formatCurrency(total)}</div>
            </div>
            <div className="space-y-4">
              <div className="space-y-2">
                <Label className="text-[10px] font-black uppercase text-blue-400 tracking-widest">Efectivo Recibido</Label>
                <Input
                  type="number" autoFocus
                  className="h-16 bg-white/10 border-white/20 text-3xl font-black font-mono text-center focus:ring-blue-500 focus:bg-white/20"
                  value={receivedAmount}
                  onChange={e => setReceivedAmount(e.target.value)}
                  onKeyDown={e => e.key === "Enter" && handleSubmit()}
                />
              </div>
              <div className={`p-6 rounded-2xl flex justify-between items-center transition-all ${receivedAmount && Number(receivedAmount) - total >= 0 ? "bg-emerald-500/20 border border-emerald-500/30" : "bg-white/5 border border-white/10"}`}>
                <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">Cambio (Vuelto)</span>
                <span className={`text-3xl font-black font-mono ${receivedAmount && Number(receivedAmount) - total >= 0 ? "text-emerald-400" : "text-slate-500"}`}>{formatCurrency(Math.max(0, (Number(receivedAmount) || 0) - total))}</span>
              </div>
            </div>
          </div>
          <div className="p-6 bg-card flex gap-3">
            <Button variant="outline" className="flex-1 h-12 font-bold uppercase tracking-wider" onClick={() => setCheckoutOpen(false)}>Cancelar</Button>
            <Button className="flex-1 h-12 bg-blue-600 hover:bg-blue-700 text-white font-black uppercase tracking-wider shadow-lg" onClick={handleSubmit} disabled={submitting}>Confirmar Venta</Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={clientModalOpen} onOpenChange={setClientModalOpen}>
        <DialogContent className="max-w-2xl p-0 overflow-hidden">
          <div className="p-6 border-b bg-muted/30">
            <h2 className="text-lg font-black uppercase tracking-widest flex items-center gap-2">
              <UserPlus className="h-5 w-5 text-blue-600" /> Seleccionar Cliente
            </h2>
            <div className="relative mt-4">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                autoFocus className="h-11 pl-10" placeholder="Buscar por nombre, teléfono o RTN..."
                onChange={e => setSearchQuery(e.target.value)}
              />
            </div>
          </div>
          <div className="max-h-[400px] overflow-auto p-2 divide-y">
            {(Array.isArray(clients) ? clients : [])
              .filter(c => !searchQuery || c.name.toLowerCase().includes(searchQuery.toLowerCase()) || c.rtn?.includes(searchQuery))
              .map(c => (
                <button key={c.id} className="w-full text-left p-4 hover:bg-blue-50 transition-colors flex justify-between items-center group" onClick={() => selectClient(c)}>
                  <div>
                    <div className="font-bold text-sm uppercase group-hover:text-blue-600">{c.name}</div>
                    <div className="text-[10px] text-muted-foreground font-medium uppercase tracking-wider mt-0.5">{c.rtn || "Sin RTN"} • {c.phone || "Sin Tel."}</div>
                  </div>
                  <div className="text-[10px] font-black text-muted-foreground bg-muted px-2 py-1 rounded uppercase group-hover:bg-blue-100 group-hover:text-blue-700">{c.city || "SPS"}</div>
                </button>
              ))}
            <div className="p-6 text-center">
               <Button variant="outline" className="border-dashed h-11 px-8 font-bold uppercase tracking-widest text-blue-600" onClick={() => setClientModalOpen(false)}>
                 + Crear Cliente Nuevo
               </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={productModalOpen} onOpenChange={setProductModalOpen}>
        <DialogContent className="max-w-4xl p-0 overflow-hidden border border-white/10 shadow-2xl bg-slate-950 text-slate-100 animate-in fade-in duration-200 sm:!zoom-in-100 sm:!slide-in-from-top-[50%] sm:!slide-in-from-left-[50%]">
          <div className="p-6 border-b border-white/5 bg-slate-900/50">
            <div className="flex justify-between items-center mb-5">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-blue-600/20 rounded-lg shrink-0">
                  <Package className="h-5 w-5 text-blue-400" />
                </div>
                <div>
                  <h2 className="text-lg font-black uppercase tracking-widest text-white leading-none">Catálogo Maestro</h2>
                  <p className="text-[9px] font-bold text-slate-500 uppercase tracking-widest mt-1">Búsqueda rápida [F3]</p>
                </div>
              </div>
              <div className="flex flex-col items-end opacity-50">
                 <span className="text-[9px] font-black text-blue-500 uppercase tracking-widest">C&G Electronics</span>
                 <span className="text-[8px] font-bold text-slate-600 uppercase">v2.4 POS</span>
              </div>
            </div>
            <div className="relative">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-500" />
              <Input
                autoFocus className="h-12 pl-12 bg-slate-900 border-white/10 text-white text-base placeholder:text-slate-600 focus:ring-2 focus:ring-blue-500 transition-all"
                placeholder="Escribe nombre, marca o código..."
                value={itemSearchQuery}
                onChange={e => setItemSearchQuery(e.target.value)}
              />
            </div>
            <div className="flex gap-2 mt-4 overflow-x-auto no-scrollbar pb-1">
               {(["all", "perfumeria", "consumible", "combo", "maquinaria"] as const).map(c => {
                 const labels: Record<string, string> = { all: "Todos", perfumeria: "Perfumería", consumible: "Insumos", combo: "Combos", maquinaria: "Maquinaria" };
                 const active = catFilter === c;
                 return (
                   <button
                     key={c}
                     onClick={() => setCatFilter(c)}
                     className={`px-4 py-2 rounded-full text-[10px] font-black uppercase tracking-widest transition-all whitespace-nowrap border ${active ? "bg-blue-600 text-white border-blue-500 shadow-[0_0_15px_rgba(37,99,235,0.4)]" : "bg-slate-900 text-slate-500 border-white/5 hover:text-slate-300"}`}
                   >
                     {labels[c]}
                   </button>
                 );
               })}
            </div>
          </div>
          <div className="max-h-[55vh] overflow-auto p-6 bg-slate-950 grid grid-cols-1 md:grid-cols-2 gap-4">
              {products
                .filter(p => {
                  // Categoría filter
                  const matchesCat = catFilter === "all" ||
                    (catFilter === "perfumeria" && p.type === "perfumeria") ||
                    (catFilter === "combo" && p.type === "combo") ||
                    (catFilter === "maquinaria" && p.subType === "maquinaria") ||
                    (catFilter === "consumible" && (p.type === "sublimacion" && p.subType !== "maquinaria"));

                  if (!matchesCat) return false;
                  if (!itemSearchQuery) return true;
                  const q = itemSearchQuery.toLowerCase();
                  return (
                    p.label.toLowerCase().includes(q) ||
                    p.code?.toLowerCase().includes(q) ||
                    p.brand?.toLowerCase().includes(q) ||
                    p.type.toLowerCase().includes(q)
                  );
                })
                .map(p => (
                  <button
                    key={`${p.type}-${p.id}`}
                    className="flex items-stretch gap-4 p-4 bg-slate-900/60 hover:bg-blue-600/10 border border-white/5 rounded-2xl transition-all hover:border-blue-500/50 group text-left relative overflow-hidden min-h-[110px]"
                    onClick={() => {
                      const emptyIdx = form.items.findIndex(it => it.description === "");
                      const targetIdx = emptyIdx === -1 ? form.items.length : emptyIdx;
                      selectProduct(targetIdx, p);
                      setProductModalOpen(false);
                      setItemSearchQuery("");
                    }}
                  >
                    <div className="flex flex-col items-center gap-2 shrink-0 justify-center">
                      <div className="h-12 w-12 rounded-xl bg-slate-800 flex items-center justify-center text-slate-500 group-hover:bg-blue-600 group-hover:text-white transition-all shadow-inner">
                        <Package className="h-6 w-6" />
                      </div>
                      <div className={`text-[7px] font-black uppercase px-2 py-0.5 rounded-full ${p.type === "perfumeria" ? "bg-purple-600/20 text-purple-400 border border-purple-500/30" : p.type === "combo" ? "bg-amber-600/20 text-amber-400 border border-amber-500/30" : "bg-blue-600/20 text-blue-400 border border-blue-500/30"} whitespace-nowrap`}>
                        {p.type}
                      </div>
                    </div>
                    <div className="flex-1 min-w-0 flex flex-col">
                      <div className="flex items-center gap-2 mb-1">
                        {p.brand && <span className="text-[8px] font-black uppercase text-blue-500 tracking-widest">{p.brand}</span>}
                        {p.ml && <span className="text-[8px] font-bold text-slate-500 bg-white/5 px-1 rounded">{p.ml}ml</span>}
                      </div>
                      <div className="font-black text-[11px] uppercase text-slate-200 group-hover:text-white leading-tight mb-1 break-words line-clamp-2 min-h-[1.5em]">
                        {p.type === "combo" ? `COMBO: ${p.label}` : p.label}
                      </div>
                      <div className="text-[9px] font-mono text-slate-600 group-hover:text-blue-400">#{p.code || p.id}</div>
                      <div className="mt-auto pt-3 flex items-center justify-between border-t border-white/5">
                         <span className="text-[13px] font-mono font-black text-blue-400">{formatCurrency(p.price)}</span>
                         <div className="flex items-center gap-1.5">
                           <div className={`h-1.5 w-1.5 rounded-full ${p.stock > 0 ? "bg-emerald-500" : "bg-red-500"}`} />
                           <span className={`text-[9px] font-black uppercase ${p.stock > 0 ? "text-emerald-500/80" : "text-red-600/80"}`}>
                             {p.stock > 0 ? `${p.stock} STOCK` : "OUT"}
                           </span>
                         </div>
                      </div>
                    </div>
                  </button>
                ))}
          </div>
          <div className="p-6 bg-slate-900/50 border-t border-white/5 flex justify-between items-center">
             <div className="text-[10px] font-bold text-slate-500 uppercase tracking-widest flex items-center gap-4">
                <span className="flex items-center gap-1.5"><kbd className="bg-slate-800 px-1.5 py-0.5 rounded text-slate-300">↑↓</kbd> Navegar</span>
                <span className="flex items-center gap-1.5"><kbd className="bg-slate-800 px-1.5 py-0.5 rounded text-slate-300">ENTER</kbd> Seleccionar</span>
             </div>
             <Button variant="ghost" className="font-black uppercase tracking-widest text-[10px] text-slate-400 hover:text-white hover:bg-white/5" onClick={() => setProductModalOpen(false)}>Cerrar [ESC]</Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={quickClientModalOpen} onOpenChange={setQuickClientModalOpen}>
        <DialogContent className="max-w-md p-0 overflow-hidden border border-white/10 shadow-2xl bg-slate-950 text-slate-100 animate-in fade-in duration-200">
          <div className="p-6 border-b border-white/5 bg-slate-900/50">
            <div className="flex items-center gap-3">
               <div className="p-2 bg-blue-600/20 rounded-lg">
                  <UserPlus className="h-5 w-5 text-blue-400" />
               </div>
               <div>
                  <h2 className="text-lg font-black uppercase tracking-widest text-white leading-none">Alta Rápida [F9]</h2>
                  <p className="text-[9px] font-bold text-slate-500 uppercase tracking-widest mt-1">Nuevo cliente para esta factura</p>
               </div>
            </div>
          </div>
          <div className="p-6 space-y-5">
             <div className="space-y-2">
                <Label className="text-[10px] font-black uppercase text-slate-400 tracking-widest">Nombre Completo</Label>
                <Input
                  autoFocus className="h-12 bg-slate-900 border-white/10 text-white placeholder:text-slate-600 focus:ring-2 focus:ring-blue-500 transition-all"
                  placeholder="Ej. Juan Pérez..."
                  value={quickClientName}
                  onChange={e => setQuickClientName(e.target.value)}
                />
             </div>
             <div className="space-y-2">
                <Label className="text-[10px] font-black uppercase text-slate-400 tracking-widest">RTN (Opcional)</Label>
                <Input
                  className="h-12 bg-slate-900 border-white/10 text-white placeholder:text-slate-600 focus:ring-2 focus:ring-blue-500 transition-all"
                  placeholder="0801-1990-XXXXX"
                  value={quickClientRtn}
                  onChange={e => setQuickClientRtn(e.target.value)}
                  onKeyDown={e => e.key === "Enter" && handleQuickClientSave()}
                />
             </div>
          </div>
          <div className="p-6 bg-slate-900/50 border-t border-white/5 flex gap-3">
             <Button variant="ghost" className="flex-1 font-black uppercase tracking-widest text-[10px] text-slate-400 hover:text-white hover:bg-white/5" onClick={() => setQuickClientModalOpen(false)}>Cancelar</Button>
             <Button className="flex-1 bg-blue-600 hover:bg-blue-700 text-white font-black uppercase tracking-widest text-[10px] shadow-lg" onClick={handleQuickClientSave} disabled={quickClientSaving}>
               {quickClientSaving ? "Guardando..." : "Guardar [ENTER]"}
             </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={notesModalOpen} onOpenChange={setNotesModalOpen}>
        <DialogContent className="max-w-lg p-0 overflow-hidden border border-white/10 shadow-2xl bg-slate-950 text-slate-100">
           <div className="p-6 border-b border-white/5 bg-slate-900/50">
              <div className="flex items-center gap-3">
                 <div className="p-2 bg-blue-600/20 rounded-lg"><FileText className="h-5 w-5 text-blue-400" /></div>
                 <div>
                    <h2 className="text-lg font-black uppercase tracking-widest text-white leading-none">Notas de Factura [F6]</h2>
                    <p className="text-[9px] font-bold text-slate-500 uppercase tracking-widest mt-1">Garantía y detalles internos</p>
                 </div>
              </div>
           </div>
           <div className="p-6">
              <Textarea
                autoFocus className="min-h-[200px] bg-slate-900 border-white/10 text-slate-100 text-sm font-medium leading-relaxed p-4 focus:ring-2 focus:ring-blue-500"
                placeholder="Escriba aquí..."
                value={form.notes}
                onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
              />
           </div>
           <div className="p-6 bg-slate-900/50 border-t border-white/5 flex justify-end">
              <Button className="bg-blue-600 hover:bg-blue-700 text-white font-black uppercase tracking-widest text-[10px] px-8" onClick={() => setNotesModalOpen(false)}>Aceptar [ESC]</Button>
           </div>
        </DialogContent>
      </Dialog>

      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader><AlertDialogTitle>¿Eliminar factura?</AlertDialogTitle></AlertDialogHeader>
          <AlertDialogFooter><AlertDialogCancel>Cancelar</AlertDialogCancel><AlertDialogAction onClick={handleDelete} className="bg-red-600">Eliminar</AlertDialogAction></AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {printInvoice && <PrintModal invoice={printInvoice} onClose={() => setPrintInvoice(null)} />}

      <Dialog open={waDialogOpen} onOpenChange={setWaDialogOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>WhatsApp</DialogTitle></DialogHeader>
          <div className="py-4 space-y-2">
            <Label>Teléfono</Label>
            <Input placeholder="+504" value={waPhoneInput} onChange={e => setWaPhoneInput(e.target.value)} autoFocus />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setWaDialogOpen(false)}>Cancelar</Button>
            <Button className="bg-green-600 hover:bg-green-700 text-white" onClick={() => { if (waInvoice && waPhoneInput.trim()) { openWhatsApp(waInvoice, waPhoneInput.trim()); setWaDialogOpen(false); } }}>Enviar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={guideModalOpen} onOpenChange={setGuideModalOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>{guidePreviewUrl ? "Guía" : "Subir Guía"}</DialogTitle></DialogHeader>
          <div className="py-4">
            {guidePreviewUrl ? <img src={guidePreviewUrl} alt="Guia" className="max-w-full rounded border mx-auto" /> : (
              <div className="space-y-4">
                <Select value={guideCourier} onValueChange={setGuideCourier}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="C807">C807</SelectItem><SelectItem value="Forza">Forza</SelectItem><SelectItem value="CAEX">CAEX</SelectItem></SelectContent></Select>
                <Input placeholder="Guía #" value={guideNumber} onChange={e => setGuideNumber(e.target.value)} />
                <Input type="file" accept="image/*" onChange={e => setGuideFile(e.target.files?.[0] || null)} />
              </div>
            )}
          </div>
          <DialogFooter><Button variant="outline" onClick={() => setGuideModalOpen(false)}>Cerrar</Button>{!guidePreviewUrl && <Button onClick={submitGuide} disabled={guideUploading} className="bg-blue-600">Guardar</Button>}</DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
