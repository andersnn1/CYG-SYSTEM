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
  Package, Copy, ExternalLink, Image as ImageIcon, Truck
} from "lucide-react";
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
  type: "perfumeria" | "sublimacion";
  code?: string | null;
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
  // Honduran mobile: 8 digits starting with 3 or 9
  if (digits.length === 8 && (digits[0] === "9" || digits[0] === "3")) {
    return `504${digits}`;
  }
  // Already has country code
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
      {/* ── HEADER: logo imagen izquierda / ciudad derecha ── */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "6px" }}>
        {/* Logo oficial */}
        <img
          src="/logo.png"
          alt="C&G Electronics"
          style={{ height: "80px", width: "auto", objectFit: "contain", display: "block" }}
        />
        {/* Ciudad */}
        <div style={{ textAlign: "right", fontSize: "8.5pt", color: "#555", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.5px" }}>
          SAN PEDRO SULA, HONDURAS
        </div>
      </div>

      {/* ── Separador ── */}
      <div style={{ borderTop: "1.5px solid #e5e7eb", marginBottom: "14px" }} />

      {/* ── Dos columnas: Factura+Fechas izquierda | Cliente derecha ── */}
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

      {/* ── Tabla de ítems ── */}
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
                  {Number.isInteger(item.quantity) ? item.quantity.toFixed(2) : item.quantity.toFixed(2)}
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

      {/* ── Términos + Totales alineados a la derecha ── */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", marginTop: "10px", marginBottom: "14px" }}>
        {/* Notas/términos */}
        <div style={{ fontSize: "8.5pt", color: "#555", flex: 1 }}>
          {invoice.notes && <div style={{ marginBottom: "4px" }}>{invoice.notes}</div>}
          {invoice.paymentMethod === "transferencia" && invoice.transferReference && (
            <div><span style={{ fontWeight: 700 }}>Comunicación del pago: </span>{invoice.transferReference}</div>
          )}
        </div>
        {/* Bloque totales */}
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
          {/* Total con fondo azul */}
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", background: BLUE, color: "#fff", padding: "8px 12px", borderRadius: "2px" }}>
            <span style={{ fontWeight: 700, fontSize: "10pt" }}>Total</span>
            <span style={{ fontWeight: 900, fontSize: "12pt", letterSpacing: "-0.5px" }}>
              L {total.toLocaleString("es-HN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </span>
          </div>
        </div>
      </div>



      {/* ── Spacer ── */}
      <div style={{ flex: 1 }} />

      {/* ── Pie de página ── */}
      <div style={{ borderTop: "1.5px solid #d1d5db", paddingTop: "10px", marginTop: "8px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end" }}>
          {/* Contacto */}
          <div style={{ fontSize: "8pt", color: "#555", lineHeight: 1.7 }}>
            <div style={{ fontWeight: 700, color: "#111", marginBottom: "2px", fontSize: "8.5pt" }}>Contacto</div>
            <div>electronicscheapandgood@gmail.com</div>
            <div>+504 9479-9621</div>
          </div>
          {/* Slogan + página */}
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

// ─── Thermal Print View ───────────────────────────────────────────────────────

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
      {/* Header centrado */}
      <div style={{ textAlign: "center", marginBottom: "6px" }}>
        <div style={{ ...base, fontWeight: 900, fontSize: "13pt", letterSpacing: "0.5px" }}>C&amp;G Electronics</div>
        <div style={{ ...base, fontSize: "7.5pt" }}>San Pedro Sula, Cortés, Honduras</div>
        <div style={{ ...base, fontSize: "7pt", color: "#444" }}>electrónica · perfumería · sublimación</div>
      </div>

      {sep()}

      {/* Datos de la factura */}
      <div style={{ marginBottom: "4px" }}>
        {row("FACTURA:", invoice.invoiceNumber, true)}
        {row("Fecha:", invoice.issueDate)}
        {invoice.dueDate && row("Vence:", invoice.dueDate)}
      </div>

      {sep()}

      {/* Datos del cliente */}
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

      {/* Productos */}
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

      {/* Totales */}
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

      {/* Pago */}
      {invoice.paymentMethod && (
        <div style={{ marginBottom: "4px" }}>
          {row("Forma de pago:", PAYMENT_LABELS[invoice.paymentMethod] ?? invoice.paymentMethod)}
          {invoice.paymentMethod === "transferencia" && invoice.transferReference &&
            row("Referencia:", invoice.transferReference)}
        </div>
      )}

      {/* Notas */}
      {invoice.notes && (
        <>
          {sep()}
          <div style={{ ...base, fontSize: "8pt", color: "#333" }}>{invoice.notes}</div>
        </>
      )}

      {sep()}

      {/* Pie centrado */}
      <div style={{ textAlign: "center", marginTop: "4px" }}>
        <div style={{ ...base, fontSize: "8.5pt", fontStyle: "italic" }}>Gracias por su preferencia</div>
        <div style={{ ...base, fontWeight: 700 }}>C&amp;G Electronics</div>
      </div>
    </div>
  );
}

// ─── Print Modal ──────────────────────────────────────────────────────────────

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
      {/* ── Toolbar ── */}
      <div style={{
        background: "#1e293b", color: "#fff",
        display: "flex", alignItems: "center", justifyContent: "space-between",
        padding: "10px 20px", gap: "12px", flexShrink: 0, flexWrap: "wrap",
      }}>
        {/* Preview toggle */}
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

        {/* Print buttons */}
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

      {/* ── Preview area ── */}
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
  costPrice?: number; // used for real-time profit calc
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
  discount: 0, tax: 0, notes: "", issueDate: today, dueDate: "",
  paymentMethod: "efectivo", transferReference: "", numeroGuia: "", transportista: "", estadoEntrega: "Pendiente",
  items: [{ description: "", quantity: 1, unitPrice: 0 }],
});

// ─── Main Component ───────────────────────────────────────────────────────────

export default function Facturas() {
  const { toast } = useToast();
  const { data: clients } = useListClients();

  // View state
  const [view, setView] = useState<"list" | "form">("list");

  // List state
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState("all");
  const [searchQuery, setSearchQuery] = useState("");

  // Form state
  const [submitting, setSubmitting] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState<InvoiceForm>(defaultForm());
  const [showAddress, setShowAddress] = useState(false);

  // Client search
  const [clientSearch, setClientSearch] = useState("");
  const [clientDropOpen, setClientDropOpen] = useState(false);
  const clientRef = useRef<HTMLDivElement>(null);

  // Delete
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteId, setDeleteId] = useState<number | null>(null);

  // Print
  const [printInvoice, setPrintInvoice] = useState<Invoice | null>(null);

  // ── Utilidad Real (Panel Interno) ──────────────────────────────────────
  const [internalExpenses, setInternalExpenses] = useState(0);
  const [internalExpensesNote, setInternalExpensesNote] = useState("");
  const [profitTaxes, setProfitTaxes] = useState(0);
  const [taxMode, setTaxMode] = useState<"manual" | "percent">("manual");
  const [taxPercent, setTaxPercent] = useState(0);

  // WhatsApp
  const [waInvoice, setWaInvoice] = useState<Invoice | null>(null);
  const [waPhoneInput, setWaPhoneInput] = useState("");
  const [waDialogOpen, setWaDialogOpen] = useState(false);

  const handleWhatsApp = (inv: Invoice) => {
    if (inv.clientPhone) {
      openWhatsApp(inv, inv.clientPhone);
    } else {
      setWaInvoice(inv);
      setWaPhoneInput("");
      setWaDialogOpen(true);
    }
  };

  const openPrint = async (inv: Invoice) => {
    try {
      const full: Invoice = await apiFetch(`/invoices/${inv.id}`);
      setPrintInvoice(full);
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    }
  };

  // Guide upload
  const [guideModalOpen, setGuideModalOpen] = useState(false);
  const [guidePreviewUrl, setGuidePreviewUrl] = useState("");
  const [guideInvoice, setGuideInvoice] = useState<Invoice | null>(null);
  const [guideFile, setGuideFile] = useState<File | null>(null);
  const [guideNumber, setGuideNumber] = useState("");
  const [guideCourier, setGuideCourier] = useState("C807");
  const [guideUploading, setGuideUploading] = useState(false);

  const openGuideModal = (inv: Invoice) => {
    setGuideInvoice(inv);
    setGuideNumber(inv.numeroGuia || "");
    setGuideCourier(inv.transportista || "C807");
    setGuideFile(null);
    setGuidePreviewUrl("");
    setGuideModalOpen(true);
  };

  const submitGuide = async () => {
    if (!guideInvoice) return;
    if (!guideFile && !guideNumber.trim()) {
      toast({ title: "Error", description: "Sube una foto o ingresa un número de guía", variant: "destructive" });
      return;
    }
    setGuideUploading(true);
    try {
      if (guideFile) {
        const formData = new FormData();
        formData.append("foto", guideFile);
        if (guideNumber.trim()) formData.append("numeroGuia", guideNumber.trim());
        formData.append("transportista", guideCourier);

        const res = await fetch(`/api/invoices/${guideInvoice.id}/guia`, {
          method: "POST",
          body: formData,
        });
        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          throw new Error(err.error || `HTTP ${res.status}`);
        }
      } else if (guideNumber.trim()) {
        await apiFetch(`/invoices/${guideInvoice.id}`, {
          method: "PATCH",
          body: JSON.stringify({ numeroGuia: guideNumber.trim(), transportista: guideCourier, estadoEntrega: "En Tránsito" }),
        });
      }
      toast({ title: "Guía guardada exitosamente" });
      setGuideModalOpen(false);
      loadInvoices();
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    } finally {
      setGuideUploading(false);
    }
  };

  const markEntregado = async (id: number) => {
    try {
      await apiFetch(`/invoices/${id}`, { method: "PATCH", body: JSON.stringify({ estadoEntrega: "Entregado" }) });
      toast({ title: "Factura marcada como Entregada", variant: "default" });
      if (view === "form") setView("list");
      loadInvoices();
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    }
  };

  // Products
  const [products, setProducts] = useState<ProductOption[]>([]);
  const [itemSearch, setItemSearch] = useState<Record<number, string>>({});
  const [itemDropOpen, setItemDropOpen] = useState<Record<number, boolean>>({});
  const [codeError, setCodeError] = useState<Record<number, boolean>>({});

  // ── Load products ──────────────────────────────────────────────────────────
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
          costPrice: Number(p.costPrice ?? 0),
          type: "perfumeria" as const,
          code: p.code ?? null,
        }));
        const subOpts: ProductOption[] = (Array.isArray(sub) ? sub : []).map((s: any) => ({
          id: s.id,
          label: s.name,
          price: Number(s.salePrice ?? 0),
          costPrice: Number(s.costPrice ?? 0),
          type: "sublimacion" as const,
          code: s.code ?? null,
        }));
        setProducts([...perfOpts, ...subOpts]);
      } catch { /* products unavailable */ }
    }
    loadProducts();
  }, []);

  // ── POS Keyboard Shortcuts ─────────────────────────────────────────────────
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ignore if viewing the list
      if (view === "list") return;

      switch (e.key) {
        case "F2":
          e.preventDefault();
          // Focus the code input of the LAST item row primarily
          const lastIdx = form.items.length - 1;
          const codeInput = document.getElementById(`product-code-input-${lastIdx}`);
          const searchInput = document.getElementById(`product-search-input-${lastIdx}`);
          (codeInput || searchInput)?.focus();
          break;
        case "F4":
          e.preventDefault();
          document.getElementById("btn-save-invoice")?.click();
          break;
        case "F7":
          e.preventDefault();
          document.getElementById("client-search-input")?.focus();
          break;
        case "F8":
          e.preventDefault();
          document.getElementById("btn-cancel-invoice")?.click();
          break;
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [view, form.items.length]);

  // ── Load invoices ──────────────────────────────────────────────────────────
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
        setShowAddress(!!(draft.clientAddress || draft.clientCity || draft.clientDepartment));
        setClientSearch(draft.clientName || "");
        setView("form");
        localStorage.removeItem("facturaDraft");
        toast({ title: "Borrador cargado para revisión previa" });
      } catch (err) {
        localStorage.removeItem("facturaDraft");
      }
    }
  }, []);

  // ── Filtered list ──────────────────────────────────────────────────────────
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

  // ── Actions ────────────────────────────────────────────────────────────────
  const openCreate = () => {
    setForm(defaultForm());
    setEditingId(null);
    setShowAddress(false);
    setClientSearch("");
    setItemSearch({});
    setItemDropOpen({});
    // Reset internal panel
    setInternalExpenses(0);
    setInternalExpensesNote("");
    setProfitTaxes(0);
    setTaxMode("manual");
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
        })) ?? [],
      });
      setEditingId(full.id);
      setShowAddress(!!(full.clientAddress || full.clientCity || full.clientDepartment));
      setClientSearch(full.clientName);
      setItemSearch({});
      setItemDropOpen({});
      
      // Populate internal panel
      setInternalExpenses(full.internalExpenses ?? 0);
      setInternalExpensesNote(full.internalExpensesNote ?? "");
      setProfitTaxes(full.taxes ?? 0);
      setTaxMode("manual");

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
    }));
    setClientSearch(client.name);
    setClientDropOpen(false);
  };

  const selectProduct = (itemIndex: number, product: ProductOption) => {
    setForm(f => {
      const items = [...f.items];
      items[itemIndex] = {
        ...items[itemIndex],
        description: product.label,
        unitPrice: product.price,
        productId: product.id,
        productType: product.type,
        costPrice: product.costPrice,
      };
      // Auto-add new row if it's the last row
      if (itemIndex === items.length - 1) {
        items.push({ description: "", quantity: 1, unitPrice: 0 });
      }
      return { ...f, items };
    });
    setItemDropOpen(s => ({ ...s, [itemIndex]: false }));
    setItemSearch(s => {
      const next = { ...s };
      delete next[itemIndex];
      return next;
    });
    
    // Auto focus the next row's code input
    setTimeout(() => {
      document.getElementById(`product-code-input-${itemIndex + 1}`)?.focus();
    }, 100);
  };

  const handleCodeSearch = async (itemIndex: number, inputValue: string) => {
    const trimmed = inputValue.trim();
    if (!trimmed) return;

    // 1. Try exact product code match
    const found = products.find(p => p.code && p.code.toLowerCase() === trimmed.toLowerCase())
      ?? products.find(p => p.id === Number(trimmed));
    if (found) {
      selectProduct(itemIndex, found);
      setCodeError(s => ({ ...s, [itemIndex]: false }));
      return;
    }

    // 2. Try combo code match → add as single item
    try {
      const combo = await apiFetch(`/combos/${encodeURIComponent(trimmed.toUpperCase())}`);
      if (combo && Array.isArray(combo.items) && combo.items.length > 0) {
        setForm(f => {
          const items = [...f.items];
          items[itemIndex] = {
            ...items[itemIndex],
            description: `${combo.code} - ${combo.name}`,
            quantity: 1,
            unitPrice: combo.fixedPrice != null
              ? Number(combo.fixedPrice)
              : combo.items.reduce((sum: number, ci: any) => sum + Number(ci.unitPrice), 0),
            productId: combo.id,
            productType: "combo",
          };
          // Auto-add new row if it's the last row
          if (itemIndex === items.length - 1) {
            items.push({ description: "", quantity: 1, unitPrice: 0 });
          }
          return { ...f, items };
        });
        setItemSearch(s => ({ ...s, [itemIndex]: "" }));
        setCodeError(s => ({ ...s, [itemIndex]: false }));
        toast({ title: `Combo agregado al listado` });
        
        // Auto focus the next row's code input
        setTimeout(() => {
          document.getElementById(`product-code-input-${itemIndex + 1}`)?.focus();
        }, 100);
        return;
      }
    } catch { /* not a combo — fall through */ }

    setCodeError(s => ({ ...s, [itemIndex]: true }));
    setTimeout(() => setCodeError(s => ({ ...s, [itemIndex]: false })), 3000);
  };

  const updateItem = (i: number, field: keyof ItemForm, value: string | number) => {
    setForm(f => {
      const items = [...f.items];
      items[i] = { ...items[i], [field]: value };
      return { ...f, items };
    });
  };

  const addItem = () =>
    setForm(f => ({ ...f, items: [...f.items, { description: "", quantity: 1, unitPrice: 0 }] }));

  const removeItem = (i: number) =>
    setForm(f => ({ ...f, items: f.items.filter((_, idx) => idx !== i) }));

  const subtotal = form.items.reduce((s, it) => s + it.quantity * it.unitPrice, 0);
  const total = subtotal - form.discount + form.tax;

  // ── Live Profit Calculations ─────────────────────────────────────────
  const totalRevenue = form.items.reduce((s, it) => s + it.quantity * it.unitPrice, 0);
  const totalBaseCost = form.items.reduce((s, it) => s + it.quantity * (it.costPrice ?? 0), 0);
  const grossProfit = totalRevenue - totalBaseCost;
  
  // Los gastos internos se restan de la utilidad ANTES de repartir (Gastos compartidos)
  const netBusinessProfit = grossProfit - internalExpenses;
  const partnerPayout = netBusinessProfit * 0.5;
  const ownerGross = netBusinessProfit * 0.5;
  
  const computedTaxes = taxMode === "percent" ? ownerGross * (taxPercent / 100) : profitTaxes;
  const ownerRealIncome = ownerGross - computedTaxes;

  const handleSubmit = async () => {
    if (!form.clientName.trim()) {
      toast({ title: "Error", description: "Nombre de cliente requerido", variant: "destructive" });
      return;
    }
    if (form.items.some(it => !it.description.trim() || it.quantity < 1 || it.unitPrice <= 0)) {
      toast({ title: "Error", description: "Complete todos los ítems correctamente", variant: "destructive" });
      return;
    }
    setSubmitting(true);
    try {
      const body = {
        clientId: form.clientId ? Number(form.clientId) : undefined,
        clientName: form.clientName,
        clientPhone: form.clientPhone || undefined,
        clientEmail: form.clientEmail || undefined,
        clientAddress: form.clientAddress || undefined,
        clientCity: form.clientCity || undefined,
        clientDepartment: form.clientDepartment || undefined,
        clientRtn: form.clientRtn || undefined,
        paymentMethod: form.paymentMethod,
        transferReference: form.paymentMethod === "transferencia" ? (form.transferReference || undefined) : undefined,
        discount: form.discount,
        tax: form.tax,
        notes: form.notes || undefined,
        issueDate: form.issueDate,
        dueDate: form.dueDate || undefined,
        items: form.items.map(it => ({
          description: it.description,
          quantity: it.quantity,
          unitPrice: it.unitPrice,
          productId: it.productId,
          productType: it.productType,
        })),
        numeroGuia: form.numeroGuia || undefined,
        transportista: form.transportista || undefined,
        estadoEntrega: form.estadoEntrega || "Pendiente",
        // ── Utilidad Real ────────────────────────────────────────────────
        baseCost: totalBaseCost,
        internalExpenses,
        internalExpensesNote: internalExpensesNote || undefined,
        taxes: computedTaxes,
        partnerPayout,
        ownerPayout: ownerRealIncome,
      };

      if (editingId) {
        await apiFetch(`/invoices/${editingId}`, { method: "PATCH", body: JSON.stringify(body) });
        toast({ title: "Factura actualizada" });
      } else {
        await apiFetch("/invoices", { method: "POST", body: JSON.stringify(body) });
        toast({ title: "Factura creada" });
      }
      setView("list");
      setForm(defaultForm());
      setEditingId(null);
      loadInvoices();
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    } finally {
      setSubmitting(false);
    }
  };

  const handleConfirm = async (id: number) => {
    try {
      await apiFetch(`/invoices/${id}`, { method: "PATCH", body: JSON.stringify({ status: "pagada" }) });
      toast({ title: "Factura marcada como pagada" });
      if (view === "form") setView("list");
      loadInvoices();
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    }
  };

  const handleCancel = async (id: number) => {
    try {
      await apiFetch(`/invoices/${id}`, { method: "PATCH", body: JSON.stringify({ status: "cancelada" }) });
      toast({ title: "Factura cancelada" });
      if (view === "form") setView("list");
      loadInvoices();
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    }
  };

  const handleDelete = async () => {
    if (!deleteId) return;
    try {
      await apiFetch(`/invoices/${deleteId}`, { method: "DELETE" });
      toast({ title: "Factura eliminada" });
      setDeleteOpen(false);
      setDeleteId(null);
      if (view === "form") setView("list");
      loadInvoices();
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    }
  };

  // ── Current invoice status (when editing) ─────────────────────────────────
  const editingInvoice = editingId ? invoices.find(i => i.id === editingId) : null;

  // ─────────────────────────────────────────────────────────────────────────────
  // LIST VIEW
  // ─────────────────────────────────────────────────────────────────────────────
  if (view === "list") {
    return (
      <div className="space-y-5 animate-in fade-in duration-200">
        {/* Top bar */}
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <FileText className="h-5 w-5 sm:h-6 sm:w-6 text-foreground flex-shrink-0" />
            <h1 className="text-2xl sm:text-2xl font-bold text-foreground">Facturas</h1>
          </div>
          <Button onClick={openCreate} className="gap-2 bg-blue-600 hover:bg-blue-700 text-white font-semibold flex-shrink-0 h-11">
            <Plus className="h-4 w-4" />
            <span className="hidden sm:inline">Nueva Factura</span>
          </Button>
        </div>

        {/* Filter bar */}
        <div className="space-y-2 sm:space-y-0 sm:flex sm:flex-wrap sm:items-center sm:gap-3">
          {/* Search */}
          <div className="relative">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              className="pl-9 w-full sm:w-64 bg-background"
              placeholder="Buscar por cliente o número..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
            />
            {searchQuery && (
              <button
                className="absolute right-2.5 top-2.5 text-muted-foreground hover:text-foreground"
                onClick={() => setSearchQuery("")}
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </div>

          {/* Status buttons — scrollable on mobile */}
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1 sm:pb-0 no-scrollbar">
            {(["all", "pendiente", "pagada", "cancelada"] as const).map(s => {
              const labels: Record<string, string> = { all: "Todas", pendiente: "Pendientes", pagada: "Pagadas", cancelada: "Canceladas" };
              const count = counts[s];
              const active = statusFilter === s;
              return (
                <button
                  key={s}
                  onClick={() => setStatusFilter(s)}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-all border whitespace-nowrap flex-shrink-0 ${active
                    ? "bg-blue-600 text-white border-blue-600 shadow-sm"
                    : "bg-background text-muted-foreground border-border hover:border-blue-300 hover:text-foreground"
                    }`}
                >
                  {labels[s]}
                  <span className={`text-xs px-1.5 py-0.5 rounded-full font-semibold ${active ? "bg-white/20 text-white" : "bg-muted text-muted-foreground"
                    }`}>
                    {count}
                  </span>
                </button>
              );
            })}
          </div>

          <span className="text-sm text-muted-foreground sm:ml-auto">
            {filtered.length} {filtered.length === 1 ? "factura" : "facturas"}
          </span>
        </div>

        {/* Table */}
        {loading ? (
          <div className="space-y-2">
            {[1, 2, 3, 4, 5].map(i => (
              <Skeleton key={i} className="h-12 w-full rounded-lg" />
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <div className="bg-card rounded-xl border py-20 text-center">
            <div className="w-14 h-14 bg-muted rounded-xl flex items-center justify-center mx-auto mb-3">
              <FileText className="h-7 w-7 text-muted-foreground" />
            </div>
            <p className="text-foreground font-medium">
              {searchQuery || statusFilter !== "all" ? "Sin resultados" : "No hay facturas"}
            </p>
            <p className="text-muted-foreground text-sm mt-1">
              {searchQuery || statusFilter !== "all"
                ? "Prueba con otros filtros"
                : "Crea tu primera factura con el botón de arriba"}
            </p>
          </div>
        ) : (
          <>
            {/* ── Desktop Table ── */}
            <div className="hidden sm:block bg-card rounded-xl border overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-muted/50">
                    <th className="text-left px-4 py-3 font-semibold text-muted-foreground">Número</th>
                    <th className="text-left px-4 py-3 font-semibold text-muted-foreground">Cliente</th>
                    <th className="text-left px-4 py-3 font-semibold text-muted-foreground hidden md:table-cell">Fecha Emisión</th>
                    <th className="text-left px-4 py-3 font-semibold text-muted-foreground hidden lg:table-cell">Vencimiento</th>
                    <th className="text-left px-4 py-3 font-semibold text-muted-foreground hidden lg:table-cell">Método Pago</th>
                    <th className="text-left px-4 py-3 font-semibold text-muted-foreground">Estado</th>
                    <th className="text-left px-4 py-3 font-semibold text-muted-foreground">Logística</th>
                    <th className="text-right px-4 py-3 font-semibold text-muted-foreground">Total</th>
                    <th className="w-10" />
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((inv, idx) => (
                    <tr
                      key={inv.id}
                      className={`hover:bg-muted/50 transition-colors border-b last:border-b-0 ${idx % 2 === 0 ? "" : "bg-muted/20"}`}
                    >
                      <td className="px-4 py-3 font-mono font-semibold text-foreground cursor-pointer" onClick={() => openEdit(inv)}>{inv.invoiceNumber}</td>
                      <td className="px-4 py-3 font-medium text-foreground max-w-[180px] truncate cursor-pointer" onClick={() => openEdit(inv)}>{inv.clientName}</td>
                      <td className="px-4 py-3 text-muted-foreground hidden md:table-cell cursor-pointer" onClick={() => openEdit(inv)}>{inv.issueDate}</td>
                      <td className="px-4 py-3 text-muted-foreground hidden lg:table-cell cursor-pointer" onClick={() => openEdit(inv)}>
                        {inv.dueDate ?? <span className="text-muted-foreground/50">—</span>}
                      </td>
                      <td className="px-4 py-3 hidden lg:table-cell cursor-pointer" onClick={() => openEdit(inv)}>
                        {inv.paymentMethod ? (
                          <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-md bg-muted text-muted-foreground font-medium border">
                            <CreditCard className="h-3 w-3" />
                            {PAYMENT_LABELS[inv.paymentMethod] ?? inv.paymentMethod}
                          </span>
                        ) : (
                          <span className="text-muted-foreground/50">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3 cursor-pointer" onClick={() => openEdit(inv)}>
                        <StatusBadge status={inv.status} />
                      </td>
                      <td className="px-4 py-3" onClick={e => e.stopPropagation()}>
                        <div className="flex flex-col gap-1.5 items-start">
                          <div className="flex items-center gap-2">
                            <GuideBadge status={inv.estadoEntrega} />
                            {inv.estadoEntrega !== 'Entregado' && (
                              <button
                                title="Marcar como Entregado"
                                onClick={() => markEntregado(inv.id)}
                                className="bg-green-600 hover:bg-green-700 text-white rounded px-1.5 py-0.5 text-[10px] font-bold transition-colors shadow-sm"
                              >
                                Entregado ✓
                              </button>
                            )}
                          </div>
                          {inv.numeroGuia || inv.fotoGuiaPath ? (
                            <div className="flex items-center gap-1.5 text-xs text-muted-foreground bg-muted/50 py-0.5 px-1.5 rounded-md border">
                              {inv.numeroGuia && (
                                <>
                                  <span className="font-mono font-medium">{inv.transportista ? `${inv.transportista}-` : ""}{inv.numeroGuia}</span>
                                  <button title="Copiar" onClick={() => { navigator.clipboard.writeText(inv.numeroGuia!); toast({title: "Copiado"}) }} className="hover:text-foreground">
                                    <Copy className="h-3 w-3" />
                                  </button>
                                  <a
                                    title="Rastrear"
                                    href={
                                      inv.transportista === "Forza" ? `https://forzadelivery.com/rastreo?guia=${inv.numeroGuia}` :
                                      inv.transportista === "CAEX" ? `https://caexlogistics.com/rastreo/?guia=${inv.numeroGuia}` :
                                      `https://c807.com/tracking?guide=${inv.numeroGuia}`
                                    }
                                    target="_blank"
                                    rel="noreferrer"
                                    className="hover:text-blue-600"
                                  >
                                    <ExternalLink className="h-3 w-3" />
                                  </a>
                                </>
                              )}
                              {inv.fotoGuiaPath && (
                                <button title="Ver Evidencia" onClick={() => { setGuidePreviewUrl(inv.fotoGuiaPath!); setGuideModalOpen(true); }} className="hover:text-blue-600 ml-1">
                                  <ImageIcon className="h-3.5 w-3.5" />
                                </button>
                              )}
                              {!inv.fotoGuiaPath && (
                                <button title="Subir Foto" onClick={() => openGuideModal(inv)} className="hover:text-blue-600 ml-1">
                                  <Plus className="h-3 w-3" />
                                </button>
                              )}
                            </div>
                          ) : (
                            <button onClick={() => openGuideModal(inv)} className="text-[10px] bg-blue-50 text-blue-600 hover:bg-blue-100 hover:text-blue-700 px-2 py-0.5 rounded font-semibold border border-blue-200 transition-colors">
                              + Subir Guía
                            </button>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-right font-bold text-foreground cursor-pointer" onClick={() => openEdit(inv)}>
                        {formatCurrency(inv.total)}
                      </td>
                      <td className="px-2 py-3 text-right">
                        <div className="flex items-center justify-end gap-1">
                          <button
                            title="Enviar por WhatsApp"
                            onClick={e => { e.stopPropagation(); handleWhatsApp(inv); }}
                            className="p-1.5 rounded-lg text-muted-foreground hover:text-green-600 hover:bg-green-50 dark:hover:bg-green-900/20 transition-colors"
                          >
                            <MessageCircle className="h-4 w-4" />
                          </button>
                          <button
                            title="Imprimir / PDF"
                            onClick={e => { e.stopPropagation(); openPrint(inv); }}
                            className="p-1.5 rounded-lg text-muted-foreground hover:text-blue-600 hover:bg-blue-50 transition-colors"
                          >
                            <Printer className="h-4 w-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* ── Mobile Cards ── */}
            <div className="sm:hidden space-y-3">
              {filtered.map(inv => (
                <div key={inv.id} className="bg-card border border-border rounded-xl overflow-hidden">

                  {/* Card header: number + status + total */}
                  <div
                    className="px-4 pt-4 pb-3 cursor-pointer"
                    onClick={() => openEdit(inv)}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-mono font-bold text-foreground">{inv.invoiceNumber}</span>
                          <StatusBadge status={inv.status} />
                        </div>
                        <p className="font-semibold text-foreground mt-1 truncate">{inv.clientName}</p>
                        <div className="flex items-center gap-3 mt-0.5">
                          <span className="text-xs text-muted-foreground">{inv.issueDate}</span>
                          {inv.paymentMethod && (
                            <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                              <CreditCard className="h-3 w-3" />
                              {PAYMENT_LABELS[inv.paymentMethod] ?? inv.paymentMethod}
                            </span>
                          )}
                        </div>
                      </div>
                      <div className="text-right flex-shrink-0">
                        <p className="text-xl font-bold text-foreground">{formatCurrency(inv.total)}</p>
                        {inv.dueDate && (
                          <p className="text-xs text-muted-foreground mt-0.5">Vence: {inv.dueDate}</p>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Logistics section */}
                  <div className="px-4 py-3 border-t border-border/60 bg-muted/20">
                    <div className="flex items-center gap-2 flex-wrap">
                      <GuideBadge status={inv.estadoEntrega} />
                      {inv.estadoEntrega !== 'Entregado' && (
                        <button
                          onClick={() => markEntregado(inv.id)}
                          className="bg-green-600 hover:bg-green-700 text-white rounded-lg px-2.5 py-1 text-xs font-bold transition-colors"
                        >
                          Entregado ✓
                        </button>
                      )}
                    </div>

                    {inv.numeroGuia || inv.fotoGuiaPath ? (
                      <div className="mt-2 flex items-center gap-2 bg-background px-3 py-2 rounded-lg border text-sm text-muted-foreground">
                        {inv.numeroGuia && (
                          <>
                            <span className="font-mono font-semibold text-foreground">
                              {inv.transportista ? `${inv.transportista} · ` : ""}{inv.numeroGuia}
                            </span>
                            <button
                              title="Copiar número de guía"
                              onClick={() => { navigator.clipboard.writeText(inv.numeroGuia!); toast({ title: "Copiado" }); }}
                              className="ml-auto p-1 rounded hover:bg-muted transition-colors"
                            >
                              <Copy className="h-4 w-4" />
                            </button>
                            <a
                              title="Rastrear envío"
                              href={
                                inv.transportista === "Forza" ? `https://forzadelivery.com/rastreo?guia=${inv.numeroGuia}` :
                                inv.transportista === "CAEX" ? `https://caexlogistics.com/rastreo/?guia=${inv.numeroGuia}` :
                                `https://c807.com/tracking?guide=${inv.numeroGuia}`
                              }
                              target="_blank"
                              rel="noreferrer"
                              className="p-1 rounded hover:bg-muted hover:text-blue-600 transition-colors"
                            >
                              <ExternalLink className="h-4 w-4" />
                            </a>
                          </>
                        )}
                        {inv.fotoGuiaPath && (
                          <button
                            title="Ver foto de evidencia"
                            onClick={() => { setGuidePreviewUrl(inv.fotoGuiaPath!); setGuideModalOpen(true); }}
                            className="p-1 rounded hover:bg-muted hover:text-blue-600 transition-colors"
                          >
                            <ImageIcon className="h-4 w-4" />
                          </button>
                        )}
                        {!inv.fotoGuiaPath && (
                          <button
                            title="Subir foto de evidencia"
                            onClick={() => openGuideModal(inv)}
                            className="p-1 rounded hover:bg-muted hover:text-blue-600 transition-colors"
                          >
                            <Plus className="h-4 w-4" />
                          </button>
                        )}
                      </div>
                    ) : (
                      <button
                        onClick={() => openGuideModal(inv)}
                        className="mt-2 text-xs bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400 hover:bg-blue-100 px-3 py-1.5 rounded-lg font-semibold border border-blue-200 dark:border-blue-800 transition-colors"
                      >
                        + Subir Guía de Envío
                      </button>
                    )}
                  </div>

                  {/* Action bar */}
                  <div className="flex border-t border-border/60 divide-x divide-border/60">
                    <button
                      className="flex-1 flex items-center justify-center gap-1.5 py-3 text-sm font-semibold text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-colors"
                      onClick={() => openEdit(inv)}
                    >
                      Abrir
                    </button>
                    <button
                      title="Enviar por WhatsApp"
                      className="flex-1 flex items-center justify-center py-3 text-muted-foreground hover:text-green-600 hover:bg-green-50 dark:hover:bg-green-900/20 transition-colors"
                      onClick={() => handleWhatsApp(inv)}
                    >
                      <MessageCircle className="h-5 w-5" />
                    </button>
                    <button
                      title="Imprimir / PDF"
                      className="flex-1 flex items-center justify-center py-3 text-muted-foreground hover:text-blue-600 hover:bg-blue-50 transition-colors"
                      onClick={() => openPrint(inv)}
                    >
                      <Printer className="h-5 w-5" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </>
        )}

        {/* Delete AlertDialog */}
        <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>¿Eliminar esta factura?</AlertDialogTitle>
              <AlertDialogDescription>
                Esta acción no se puede deshacer. La factura será eliminada permanentemente.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancelar</AlertDialogCancel>
              <AlertDialogAction
                onClick={handleDelete}
                className="bg-red-600 hover:bg-red-700 font-bold"
              >
                Eliminar
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        {/* Print Modal */}
        {printInvoice && (
          <PrintModal invoice={printInvoice} onClose={() => setPrintInvoice(null)} />
        )}

        {/* WhatsApp phone dialog */}
        <Dialog open={waDialogOpen} onOpenChange={setWaDialogOpen}>
          <DialogContent className="max-w-sm">
            <DialogHeader>
              <DialogTitle>Enviar por WhatsApp</DialogTitle>
            </DialogHeader>
            <p className="text-sm text-muted-foreground">
              Esta factura no tiene teléfono registrado. Ingresa un número para continuar.
            </p>
            <div className="space-y-2">
              <Label>Número de teléfono</Label>
              <Input
                placeholder="+504 9999-9999"
                value={waPhoneInput}
                onChange={e => setWaPhoneInput(e.target.value)}
                autoFocus
              />
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setWaDialogOpen(false)}>Cancelar</Button>
              <Button
                className="bg-green-600 hover:bg-green-700 text-white"
                onClick={() => {
                  if (waInvoice && waPhoneInput.trim()) {
                    openWhatsApp(waInvoice, waPhoneInput.trim());
                    setWaDialogOpen(false);
                  }
                }}
              >
                <MessageCircle className="h-4 w-4 mr-1.5" /> Abrir WhatsApp
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      {/* ── Guide Upload & Preview Dialogs ── */}
      <Dialog open={guideModalOpen} onOpenChange={setGuideModalOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{guidePreviewUrl ? "Vista de Evidencia de Entregado / Guía" : "Subir Guía de Envío"}</DialogTitle>
          </DialogHeader>
          
          <div className="space-y-4 py-4">
            {guidePreviewUrl ? (
              <div className="flex flex-col items-center gap-4">
                <img src={guidePreviewUrl} alt="Guia" className="max-w-full rounded-lg shadow-md border" style={{ maxHeight: '60vh' }} />
              </div>
            ) : (
              <>
                <div className="space-y-2">
                  <Label>Factura</Label>
                  <p className="font-mono text-sm font-semibold">{guideInvoice?.invoiceNumber}</p>
                </div>
                <div className="space-y-2">
                  <Label>Transportista / Empresa de Envío</Label>
                  <Select value={guideCourier} onValueChange={setGuideCourier}>
                    <SelectTrigger className="bg-background">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="C807">C807</SelectItem>
                      <SelectItem value="Forza">Forza Delivery</SelectItem>
                      <SelectItem value="CAEX">CAEX Logistics</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Número de Guía o Rastreo</Label>
                  <Input 
                    placeholder="Ej. 123456" 
                    value={guideNumber} 
                    onChange={e => setGuideNumber(e.target.value)} 
                  />
                  <p className="text-xs text-muted-foreground mt-1">Este número se usará para el rastreo del paquete con {guideCourier}.</p>
                </div>
                <div className="space-y-2 pt-2">
                  <Label>Foto / Comprobante Múltiple</Label>
                  <Input 
                    type="file" 
                    accept="image/*" 
                    onChange={e => setGuideFile(e.target.files?.[0] || null)} 
                    className="file:text-sm file:font-semibold file:text-blue-600 file:bg-blue-50 file:border-0 hover:file:bg-blue-100 cursor-pointer"
                  />
                </div>
              </>
            )}
          </div>
          
          <DialogFooter>
            <Button variant="outline" onClick={() => setGuideModalOpen(false)}>Cerrar</Button>
            {!guidePreviewUrl && (
              <Button 
                onClick={submitGuide} 
                disabled={guideUploading}
                className="bg-blue-600 hover:bg-blue-700 text-white font-semibold flex items-center gap-2"
              >
                {guideUploading ? "Guardando..." : <><Truck className="h-4 w-4" /> Guardar Guía</>}
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
      </div>
    );
  }

    // ─────────────────────────────────────────────────────────────────────────────
  // FORM VIEW (DOCUMENT STYLE)
  // ─────────────────────────────────────────────────────────────────────────────
  const currentStatus = editingInvoice?.status ?? "pendiente";

  return (
    <div className="animate-in fade-in duration-200 pb-24">
      {/* ── Top Action Bar ── */}
      <div className="max-w-5xl mx-auto flex items-center justify-between mb-4 px-2">
        <Button
          variant="ghost"
          size="sm"
          className="gap-1.5 text-muted-foreground hover:text-foreground"
          onClick={() => { setView("list"); setEditingId(null); setForm(defaultForm()); }}
        >
          <ArrowLeft className="h-4 w-4" /> Volver a Facturas
        </Button>
        
        <div className="flex items-center gap-2">
          {editingId && editingInvoice && (
            <StatusBadge status={editingInvoice.status} />
          )}
          
          {editingId && editingInvoice && (
             <>
               <Button variant="outline" size="sm" className="text-green-600 h-8 gap-1.5" onClick={() => handleWhatsApp(editingInvoice)}>
                 <MessageCircle className="h-4 w-4" /> WhatsApp
               </Button>
               <Button variant="outline" size="sm" className="text-blue-600 h-8 gap-1.5" onClick={() => openPrint(editingInvoice)}>
                 <Printer className="h-4 w-4" /> Imprimir
               </Button>
               <Button variant="ghost" size="icon" className="text-muted-foreground hover:text-red-600 hover:bg-red-50 h-8 w-8" onClick={() => { setDeleteId(editingId); setDeleteOpen(true); }}>
                 <Trash2 className="h-4 w-4" />
               </Button>
               <div className="w-px h-5 bg-border mx-1"></div>
             </>
          )}

          <Button
            id="btn-save-invoice"
            variant="outline"
            className="font-semibold h-8"
            onClick={handleSubmit}
            disabled={submitting}
          >
            {submitting ? "Guardando..." : "Guardar [F4]"}
          </Button>

          {editingId && editingInvoice && currentStatus !== "pagada" && currentStatus !== "cancelada" && (
            <Button
              className="bg-blue-600 hover:bg-blue-700 text-white font-semibold h-8"
              onClick={() => handleConfirm(editingId)}
            >
              <CheckCircle className="h-4 w-4 mr-1.5" /> Confirmar
            </Button>
          )}

          {editingId && editingInvoice && currentStatus !== "cancelada" && (
            <Button
              id="btn-cancel-invoice"
              variant="outline"
              className="border-red-300 text-red-600 hover:bg-red-50 hover:border-red-400 font-semibold h-8"
              onClick={() => handleCancel(editingId)}
            >
              <XCircle className="h-4 w-4 mr-1.5" /> Anular [F8]
            </Button>
          )}
        </div>
      </div>

      {/* ── Document Paper ── */}
      <div className="max-w-5xl mx-auto bg-card border shadow-sm rounded-sm overflow-hidden">
        
        {/* Document Header */}
        <div className="p-8 pb-4 grid grid-cols-1 md:grid-cols-2 gap-8 items-start">
          
          {/* Left: Client Info */}
          <div>
            <h1 className="text-3xl font-black text-foreground tracking-tight mb-6">
              {editingId ? (editingInvoice?.invoiceNumber ?? "Factura") : "NUEVA FACTURA"}
            </h1>
            
            <div className="space-y-1 relative" ref={clientRef}>
              <Label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Cliente [F7]</Label>
              
              <Input
                id="client-search-input"
                className="h-9 border-transparent hover:border-input focus:border-ring bg-transparent font-semibold text-lg px-1 rounded-sm shadow-none focus-visible:ring-1"
                placeholder="Escriba el nombre del cliente..."
                value={clientSearch}
                onChange={e => {
                  setClientSearch(e.target.value);
                  setClientDropOpen(true);
                  setForm(f => ({ ...f, clientName: e.target.value, clientId: "" }));
                }}
                onKeyDown={e => {
                  if (e.key === "Enter" && clientDropOpen && clientSearch.trim()) {
                    e.preventDefault();
                    const matches = (Array.isArray(clients) ? clients : []).filter((c: Client) => 
                      c.name.toLowerCase().includes(clientSearch.toLowerCase())
                    );
                    if (matches.length > 0) {
                      selectClient(matches[0]);
                    }
                  }
                }}
                onFocus={() => setClientDropOpen(true)}
                onBlur={() => setTimeout(() => setClientDropOpen(false), 200)}
              />
              
              {clientDropOpen && clientSearch.trim().length > 0 && (
                <div className="absolute z-50 left-0 right-0 mt-1 bg-card border rounded-xl shadow-xl max-h-52 overflow-y-auto">
                  {(Array.isArray(clients) ? clients : [])
                    .filter((c: Client) => c.name.toLowerCase().includes(clientSearch.toLowerCase()))
                    .slice(0, 8)
                    .map((c: Client) => (
                      <button
                        key={c.id}
                        type="button"
                        className="w-full text-left px-4 py-2.5 text-sm hover:bg-muted transition-colors first:rounded-t-xl last:rounded-b-xl"
                        onMouseDown={() => selectClient(c)}
                      >
                        <span className="font-medium text-foreground">{c.name}</span>
                        {c.phone && <span className="text-muted-foreground ml-2 text-xs">{c.phone}</span>}
                      </button>
                    ))}
                </div>
              )}

              {/* Client Meta (RTN, Phone, Address) - only show if clientName is not empty to keep it clean */}
              <div className="grid grid-cols-2 gap-2 mt-2">
                <div>
                   <Input 
                     className="h-8 border-transparent hover:border-input focus:border-ring bg-transparent text-sm px-1 shadow-none text-muted-foreground" 
                     placeholder="RTN" 
                     value={form.clientRtn} 
                     onChange={e => setForm(f => ({ ...f, clientRtn: e.target.value.replace(/\D/g,"").slice(0,14) }))} 
                   />
                </div>
                <div>
                   <Input 
                     className="h-8 border-transparent hover:border-input focus:border-ring bg-transparent text-sm px-1 shadow-none text-muted-foreground" 
                     placeholder="Teléfono" 
                     value={form.clientPhone} 
                     onChange={e => setForm(f => ({ ...f, clientPhone: e.target.value }))} 
                   />
                </div>
                <div className="col-span-2">
                   <Input 
                     className="h-8 border-transparent hover:border-input focus:border-ring bg-transparent text-sm px-1 shadow-none text-muted-foreground" 
                     placeholder="Dirección completa" 
                     value={form.clientAddress} 
                     onChange={e => setForm(f => ({ ...f, clientAddress: e.target.value }))} 
                   />
                </div>
              </div>
            </div>
          </div>

          {/* Right: Invoice Meta */}
          <div className="flex flex-col md:items-end space-y-1 md:pt-14">
            <div className="flex items-center gap-3 w-full md:w-64">
              <Label className="text-xs font-semibold text-muted-foreground w-24 md:text-right">Emisión</Label>
              <Input type="date" className="h-8 border-transparent hover:border-input focus:border-ring bg-transparent font-medium px-1 shadow-none" value={form.issueDate} onChange={e => setForm(f => ({...f, issueDate: e.target.value}))} />
            </div>
            <div className="flex items-center gap-3 w-full md:w-64">
              <Label className="text-xs font-semibold text-muted-foreground w-24 md:text-right">Vencimiento</Label>
              <Input type="date" className="h-8 border-transparent hover:border-input focus:border-ring bg-transparent font-medium px-1 shadow-none" value={form.dueDate} onChange={e => setForm(f => ({...f, dueDate: e.target.value}))} />
            </div>
            <div className="flex items-center gap-3 w-full md:w-64">
              <Label className="text-xs font-semibold text-muted-foreground w-24 md:text-right">Pago</Label>
              <Select value={form.paymentMethod} onValueChange={v => setForm(f => ({...f, paymentMethod: v as InvoiceForm["paymentMethod"]}))}>
                <SelectTrigger className="h-8 border-transparent hover:border-input focus:border-ring bg-transparent px-1 shadow-none font-medium">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="efectivo">Efectivo</SelectItem>
                  <SelectItem value="tarjeta">Tarjeta</SelectItem>
                  <SelectItem value="transferencia">Transferencia</SelectItem>
                  <SelectItem value="cheque">Cheque</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {form.paymentMethod === "transferencia" && (
               <div className="flex items-center gap-3 w-full md:w-64">
                 <Label className="text-xs font-semibold text-muted-foreground w-24 md:text-right">Referencia</Label>
                 <Input className="h-8 border-transparent hover:border-input focus:border-ring bg-transparent px-1 shadow-none text-sm" placeholder="# Transf." value={form.transferReference} onChange={e => setForm(f => ({...f, transferReference: e.target.value}))} />
               </div>
            )}
          </div>
        </div>

        {/* ── Table ── */}
        <div className="mt-4 border-y border-border/50">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-muted/30 border-b border-border/50">
                <th className="text-left px-6 py-2 text-[10px] uppercase font-bold text-muted-foreground w-36">Código [F2]</th>
                <th className="text-left px-2 py-2 text-[10px] uppercase font-bold text-muted-foreground">Descripción</th>
                <th className="text-center px-2 py-2 text-[10px] uppercase font-bold text-muted-foreground w-20">Cant.</th>
                <th className="text-right px-2 py-2 text-[10px] uppercase font-bold text-muted-foreground w-28">Precio U.</th>
                <th className="text-right px-6 py-2 text-[10px] uppercase font-bold text-muted-foreground w-28">Total</th>
                <th className="w-10"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/20">
              {form.items.map((item, i) => (
                <tr key={i} className="group hover:bg-muted/20 transition-colors">
                  <td className="px-6 py-1 align-top">
                    <div className="relative">
                      <Input
                        id={`product-code-input-${i}`}
                        className="h-8 border-transparent hover:border-input focus:border-ring bg-transparent font-mono text-xs px-1 shadow-none w-full"
                        placeholder="..."
                        onKeyDown={e => {
                          if (e.key === "Enter") {
                            e.preventDefault();
                            handleCodeSearch(i, (e.currentTarget.value ?? "").trim());
                          }
                        }}
                      />
                      {codeError[i] && (
                        <span className="absolute -bottom-4 left-0 text-[10px] text-red-500 font-medium">No encontrado</span>
                      )}
                    </div>
                  </td>
                  <td className="px-2 py-1 align-top relative">
                    <div className="flex items-center group/search">
                      <Input
                        id={`product-search-input-${i}`}
                        className={`h-8 border-transparent hover:border-input focus:border-ring bg-transparent px-1 shadow-none w-full ${!item.description ? 'font-light italic text-muted-foreground' : 'font-medium'}`}
                        placeholder="Buscar producto o describir..."
                        value={itemSearch[i] !== undefined ? itemSearch[i] : item.description}
                        onChange={e => {
                          if (itemSearch[i] !== undefined) {
                            setItemSearch(s => ({ ...s, [i]: e.target.value }));
                          } else {
                            updateItem(i, "description", e.target.value);
                          }
                        }}
                        onKeyDown={e => {
                          if (e.key === "Enter" && itemDropOpen[i] && (itemSearch[i] ?? "").trim()) {
                            e.preventDefault();
                            const matches = products.filter(p => p.label.toLowerCase().includes((itemSearch[i] ?? "").toLowerCase()));
                            if (matches.length > 0) {
                              selectProduct(i, matches[0]);
                            } else {
                              handleCodeSearch(i, (itemSearch[i] ?? "").trim());
                            }
                          }
                        }}
                        onFocus={() => {
                           if (itemSearch[i] === undefined) {
                              setItemSearch(s => ({ ...s, [i]: item.description }));
                           }
                           setItemDropOpen(s => ({ ...s, [i]: true }));
                        }}
                        onBlur={() => setTimeout(() => setItemDropOpen(s => ({ ...s, [i]: false })), 200)}
                      />
                      {item.productId && (
                         <button type="button" className="opacity-0 group-hover/search:opacity-100 p-1 hover:text-red-500 transition-opacity" onClick={() => {
                           setForm(f => {
                             const items = [...f.items];
                             items[i] = { ...items[i], productId: undefined, productType: undefined };
                             return { ...f, items };
                           });
                         }}>
                           <X className="h-3 w-3" />
                         </button>
                      )}
                    </div>
                    {itemDropOpen[i] && (itemSearch[i] ?? "").length > 0 && (
                      <div className="absolute z-50 left-0 right-0 mt-1 bg-card border rounded-xl shadow-xl max-h-48 overflow-y-auto">
                        {products
                          .filter(p => p.label.toLowerCase().includes((itemSearch[i] ?? "").toLowerCase()))
                          .slice(0, 12)
                          .map(p => (
                            <button
                              key={`${p.type}-${p.id}`}
                              type="button"
                              className="w-full text-left px-3 py-2.5 text-sm hover:bg-muted flex items-center justify-between first:rounded-t-xl last:rounded-b-xl"
                              onMouseDown={() => selectProduct(i, p)}
                            >
                              <div className="flex items-center gap-2 truncate">
                                <span className={`text-[10px] px-1.5 py-0.5 rounded font-bold shrink-0 ${p.type === "perfumeria" ? "bg-purple-100 text-purple-700" : "bg-cyan-100 text-cyan-700"}`}>
                                  {p.type === "perfumeria" ? "Perf." : "Sub."}
                                </span>
                                <span className="truncate font-medium">{p.label}</span>
                              </div>
                              <span className="text-xs font-bold shrink-0 ml-2">{formatCurrency(p.price)}</span>
                            </button>
                          ))}
                      </div>
                    )}
                  </td>
                  <td className="px-2 py-1 align-top">
                    <Input
                      type="number" min={1}
                      className="h-8 border-transparent hover:border-input focus:border-ring bg-transparent text-center px-1 shadow-none"
                      value={item.quantity || ""}
                      onChange={e => updateItem(i, "quantity", Number(e.target.value))}
                    />
                  </td>
                  <td className="px-2 py-1 align-top">
                    <Input
                      type="number" min={0} step="0.01"
                      className="h-8 border-transparent hover:border-input focus:border-ring bg-transparent text-right px-1 shadow-none"
                      value={item.unitPrice || ""}
                      onChange={e => updateItem(i, "unitPrice", Number(e.target.value))}
                    />
                  </td>
                  <td className="px-6 py-1 align-top pt-2.5 text-right font-semibold">
                    {formatCurrency(item.quantity * item.unitPrice)}
                  </td>
                  <td className="px-2 py-1 align-top pt-2">
                    <button
                      type="button" disabled={form.items.length === 1}
                      onClick={() => removeItem(i)}
                      className="text-muted-foreground/40 hover:text-red-500 transition-colors disabled:opacity-0"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="px-6 py-2">
             <button type="button" onClick={addItem} className="text-[10px] font-bold uppercase text-blue-600 hover:text-blue-800 transition-colors">
               + Agregar Línea
             </button>
          </div>
        </div>

        {/* ── Footer ── */}
        <div className="p-8 grid grid-cols-1 md:grid-cols-2 gap-8">
           {/* Left: Notes & Logistics */}
           <div className="space-y-6">
              <div>
                <Label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Notas y Condiciones</Label>
                <Textarea
                  className="mt-1 border-transparent hover:border-input focus:border-ring bg-muted/20 text-sm min-h-[60px] resize-none shadow-none"
                  value={form.notes}
                  onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
                  placeholder="Condiciones de pago, instrucciones especiales..."
                />
              </div>

              {/* Logistics mini-panel */}
              <div className="p-3 bg-muted/20 rounded border border-transparent hover:border-border transition-colors">
                 <Label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider mb-2 block">Envío y Logística</Label>
                 <div className="grid grid-cols-2 gap-2">
                    <Select value={form.transportista} onValueChange={v => setForm(f => ({ ...f, transportista: v }))}>
                      <SelectTrigger className="h-7 border-transparent hover:border-input focus:border-ring bg-background px-2 text-xs shadow-none">
                        <SelectValue placeholder="Transportista" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="Forza">Forza Delivery</SelectItem>
                        <SelectItem value="CAEX">CAEX Logistics</SelectItem>
                        <SelectItem value="C807">C807</SelectItem>
                        <SelectItem value="Recogida">Recogida Tienda</SelectItem>
                      </SelectContent>
                    </Select>
                    
                    <Select value={form.estadoEntrega} onValueChange={v => setForm(f => ({ ...f, estadoEntrega: v }))}>
                      <SelectTrigger className="h-7 border-transparent hover:border-input focus:border-ring bg-background px-2 text-xs shadow-none">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="Pendiente">Pendiente</SelectItem>
                        <SelectItem value="En Tránsito">En Tránsito</SelectItem>
                        <SelectItem value="Entregado">Entregado</SelectItem>
                      </SelectContent>
                    </Select>
                    
                    <Input
                      className="col-span-2 h-7 border-transparent hover:border-input focus:border-ring bg-background px-2 text-xs shadow-none"
                      value={form.numeroGuia}
                      onChange={e => setForm(f => ({ ...f, numeroGuia: e.target.value }))}
                      placeholder="Número de Guía (Ej. FOR-12345)"
                    />
                 </div>
              </div>
           </div>

           {/* Right: Totals */}
           <div className="space-y-1">
             <div className="flex justify-between py-1 text-sm text-muted-foreground">
               <span>Subtotal</span>
               <span className="font-medium text-foreground">{formatCurrency(subtotal)}</span>
             </div>
             <div className="flex items-center justify-between py-1 group">
               <Label className="text-sm text-muted-foreground group-hover:text-foreground transition-colors">Descuento</Label>
               <Input
                 type="number" min={0} step="0.01"
                 className="h-7 border-transparent hover:border-input focus:border-ring bg-transparent text-right w-28 px-1 shadow-none text-sm text-red-600 font-medium"
                 value={form.discount || ""}
                 onChange={e => setForm(f => ({ ...f, discount: Number(e.target.value) }))}
               />
             </div>
             <div className="flex items-center justify-between py-1 group">
               <Label className="text-sm text-muted-foreground group-hover:text-foreground transition-colors">Impuesto (ISV)</Label>
               <Input
                 type="number" min={0} step="0.01"
                 className="h-7 border-transparent hover:border-input focus:border-ring bg-transparent text-right w-28 px-1 shadow-none text-sm font-medium"
                 value={form.tax || ""}
                 onChange={e => setForm(f => ({ ...f, tax: Number(e.target.value) }))}
               />
             </div>
             <div className="flex justify-between items-center pt-3 mt-1 border-t border-border/50">
               <span className="font-black text-lg uppercase">Total</span>
               <span className="text-3xl font-black text-blue-600 tracking-tight">{formatCurrency(total)}</span>
             </div>
           </div>
        </div>
      </div>

      {/* ── Internal Profit Panel (Below the main document) ── */}
      <div className="max-w-5xl mx-auto mt-6 print-hide">
        <details className="group">
           <summary className="flex items-center gap-2 cursor-pointer select-none text-muted-foreground hover:text-foreground transition-colors font-medium text-sm">
             <span className="group-open:rotate-90 transition-transform">▶</span>
             Panel Interno (Utilidad Real & Gastos)
           </summary>
           <div className="mt-4 p-5 bg-amber-50/50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800/50 rounded-sm">
             <div className="grid grid-cols-2 md:grid-cols-6 gap-4 mb-5">
               <div className="space-y-1"><div className="text-[10px] text-amber-800/70 dark:text-amber-200/50 font-bold uppercase">Ventas</div><div className="text-sm font-black text-emerald-600">{formatCurrency(totalRevenue)}</div></div>
               <div className="space-y-1"><div className="text-[10px] text-amber-800/70 dark:text-amber-200/50 font-bold uppercase">Costo Base</div><div className="text-sm font-black text-red-500">{formatCurrency(totalBaseCost)}</div></div>
               <div className="space-y-1"><div className="text-[10px] text-amber-800/70 dark:text-amber-200/50 font-bold uppercase">Ut. Bruta</div><div className="text-sm font-black text-blue-600">{formatCurrency(grossProfit)}</div></div>
               <div className="space-y-1"><div className="text-[10px] text-amber-800/70 dark:text-amber-200/50 font-bold uppercase">Socio (50%)</div><div className="text-sm font-black text-purple-600">{formatCurrency(partnerPayout)}</div></div>
               <div className="space-y-1"><div className="text-[10px] text-amber-800/70 dark:text-amber-200/50 font-bold uppercase">Mi Bruto</div><div className="text-sm font-black text-indigo-600">{formatCurrency(ownerGross)}</div></div>
               <div className="space-y-1"><div className="text-[10px] text-amber-800/70 dark:text-amber-200/50 font-bold uppercase">Mi Neto</div><div className={`text-sm font-black ${ownerRealIncome >= 0 ? "text-emerald-600" : "text-red-600"}`}>{formatCurrency(ownerRealIncome)}</div></div>
             </div>
             
             <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div>
                  <Label className="text-[10px] font-bold text-amber-900/70 dark:text-amber-200/70 uppercase">Gastos Operativos (Ej. Taxi, Cajas)</Label>
                  <div className="flex gap-2 mt-1">
                    <Input type="number" className="h-8 border-amber-200 bg-white dark:bg-black w-24" placeholder="0.00" value={internalExpenses || ""} onChange={e => setInternalExpenses(Number(e.target.value) || 0)} />
                    <Input className="h-8 border-amber-200 bg-white dark:bg-black flex-1" placeholder="Nota de gasto..." value={internalExpensesNote} onChange={e => setInternalExpensesNote(e.target.value)} />
                  </div>
                </div>
                <div className="md:col-span-2">
                  <Label className="text-[10px] font-bold text-amber-900/70 dark:text-amber-200/70 uppercase">Reserva de Impuestos</Label>
                  <div className="flex gap-2 mt-1 items-center">
                    <div className="flex bg-white dark:bg-black border border-amber-200 rounded h-8 p-0.5">
                       <button type="button" onClick={() => setTaxMode("manual")} className={`px-2 text-[10px] font-bold rounded ${taxMode === "manual" ? "bg-amber-600 text-white" : "text-amber-700"}`}>LPS</button>
                       <button type="button" onClick={() => setTaxMode("percent")} className={`px-2 text-[10px] font-bold rounded ${taxMode === "percent" ? "bg-amber-600 text-white" : "text-amber-700"}`}>%</button>
                    </div>
                    {taxMode === "manual" ? (
                      <Input type="number" className="h-8 border-amber-200 bg-white dark:bg-black w-28" placeholder="0.00" value={profitTaxes || ""} onChange={e => setProfitTaxes(Number(e.target.value) || 0)} />
                    ) : (
                      <>
                        <Input type="number" className="h-8 border-amber-200 bg-white dark:bg-black w-20" placeholder="%" value={taxPercent || ""} onChange={e => setTaxPercent(Number(e.target.value) || 0)} />
                        <span className="text-xs font-bold text-amber-700 dark:text-amber-400">= {formatCurrency(computedTaxes)}</span>
                      </>
                    )}
                  </div>
                </div>
             </div>
           </div>
        </details>
      </div>

      {/* ── Delete AlertDialog ── */}
      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar esta factura?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta acción no se puede deshacer. La factura será eliminada permanentemente.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              className="bg-red-600 hover:bg-red-700 font-bold"
            >
              Eliminar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* ── Print Modal ── */}
      {printInvoice && (
        <PrintModal invoice={printInvoice} onClose={() => setPrintInvoice(null)} />
      )}

      {/* ── WhatsApp phone dialog ── */}
      <Dialog open={waDialogOpen} onOpenChange={setWaDialogOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Enviar por WhatsApp</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            Esta factura no tiene teléfono registrado. Ingresa un número para continuar.
          </p>
          <div className="space-y-2">
            <Label>Número de teléfono</Label>
            <Input
              placeholder="+504 9999-9999"
              value={waPhoneInput}
              onChange={e => setWaPhoneInput(e.target.value)}
              autoFocus
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setWaDialogOpen(false)}>Cancelar</Button>
            <Button
              className="bg-green-600 hover:bg-green-700 text-white"
              onClick={() => {
                if (waInvoice && waPhoneInput.trim()) {
                  openWhatsApp(waInvoice, waPhoneInput.trim());
                  setWaDialogOpen(false);
                }
              }}
            >
              <MessageCircle className="h-4 w-4 mr-1.5" /> Abrir WhatsApp
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
