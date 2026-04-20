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
      return { ...f, items };
    });
    setItemDropOpen(s => ({ ...s, [itemIndex]: false }));
    setItemSearch(s => ({ ...s, [itemIndex]: "" }));
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
          return { ...f, items };
        });
        setItemSearch(s => ({ ...s, [itemIndex]: "" }));
        setCodeError(s => ({ ...s, [itemIndex]: false }));
        toast({ title: `Combo agregado al listado` });
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
  const partnerPayout = grossProfit * 0.5;
  const ownerGross = grossProfit * 0.5;
  const computedTaxes = taxMode === "percent" ? ownerGross * (taxPercent / 100) : profitTaxes;
  const ownerRealIncome = ownerGross - internalExpenses - computedTaxes;

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
  // FORM VIEW
  // ─────────────────────────────────────────────────────────────────────────────
  const currentStatus = editingInvoice?.status ?? "pendiente";

  return (
    <div className="animate-in fade-in duration-200 space-y-6 pb-16">
      {/* ── Form header ── */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        {/* Left: back + title */}
        <div className="flex items-center gap-3">
          <Button
            variant="ghost"
            size="sm"
            className="gap-1.5 text-muted-foreground hover:text-foreground"
            onClick={() => { setView("list"); setEditingId(null); setForm(defaultForm()); }}
          >
            <ArrowLeft className="h-4 w-4" /> Facturas
          </Button>
          <Separator orientation="vertical" className="h-5" />
          <span className="font-bold text-foreground text-lg">
            {editingId ? (editingInvoice?.invoiceNumber ?? "Editar Factura") : "Nueva Factura"}
          </span>
          {editingId && editingInvoice && (
            <StatusBadge status={editingInvoice.status} />
          )}
        </div>

        {/* Right: actions */}
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            className="font-semibold"
            onClick={handleSubmit}
            disabled={submitting}
          >
            {submitting ? "Guardando..." : "Guardar"}
          </Button>

          {editingId && editingInvoice && currentStatus !== "pagada" && (
            <Button
              className="bg-blue-600 hover:bg-blue-700 text-white font-semibold"
              onClick={() => handleConfirm(editingId)}
            >
              <CheckCircle className="h-4 w-4 mr-1.5" /> Confirmar
            </Button>
          )}

          {editingId && editingInvoice && currentStatus !== "cancelada" && (
            <Button
              variant="outline"
              className="border-red-300 text-red-600 hover:bg-red-50 hover:border-red-400 font-semibold"
              onClick={() => handleCancel(editingId)}
            >
              <XCircle className="h-4 w-4 mr-1.5" /> Cancelar
            </Button>
          )}

          {editingId && editingInvoice && (
            <Button
              variant="outline"
              className="gap-1.5 font-semibold text-green-600 border-green-300 hover:bg-green-50 dark:hover:bg-green-900/20"
              onClick={() => handleWhatsApp(editingInvoice)}
              title="Enviar por WhatsApp"
            >
              <MessageCircle className="h-4 w-4" /> WhatsApp
            </Button>
          )}

          {editingId && editingInvoice && (
            <Button
              variant="outline"
              className="gap-1.5 font-semibold text-blue-600 border-blue-300 hover:bg-blue-50"
              onClick={() => openPrint(editingInvoice)}
              title="Imprimir / Exportar PDF"
            >
              <Printer className="h-4 w-4" /> PDF
            </Button>
          )}

          {editingId && editingInvoice && (
            <Button
              variant="ghost"
              size="icon"
              className="text-muted-foreground hover:text-red-600 hover:bg-red-50"
              onClick={() => { setDeleteId(editingId); setDeleteOpen(true); }}
              title="Eliminar factura"
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          )}
        </div>
      </div>

      {/* ── Two-column layout ── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* ─── Left column (2/3) ─── */}
        <div className="lg:col-span-2 space-y-6">

          {/* Section: Información del Cliente */}
          <section className="bg-card rounded-xl border p-5 space-y-4">
            <h2 className="font-bold text-foreground text-sm uppercase tracking-wide">
              Información del Cliente
            </h2>

            {/* Client search */}
            <div className="relative" ref={clientRef}>
              <Label className="text-xs text-muted-foreground font-medium">Buscar cliente existente</Label>
              <div className="relative mt-1">
                <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  className="pl-9 bg-background"
                  placeholder="Nombre del cliente..."
                  value={clientSearch}
                  onChange={e => {
                    setClientSearch(e.target.value);
                    setClientDropOpen(true);
                    setForm(f => ({ ...f, clientName: e.target.value, clientId: "" }));
                  }}
                  onFocus={() => setClientDropOpen(true)}
                  onBlur={() => setTimeout(() => setClientDropOpen(false), 150)}
                />
              </div>
              {clientDropOpen && clientSearch.trim().length > 0 && (
                <div className="absolute z-50 w-full mt-1 bg-card border border-border rounded-xl shadow-lg max-h-52 overflow-y-auto">
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
                        {c.phone && (
                          <span className="text-muted-foreground ml-2 text-xs">{c.phone}</span>
                        )}
                      </button>
                    ))}
                  {(clients ?? []).filter((c: Client) => c.name.toLowerCase().includes(clientSearch.toLowerCase())).length === 0 && (
                    <p className="px-4 py-3 text-sm text-muted-foreground text-center">Sin coincidencias</p>
                  )}
                </div>
              )}
            </div>

            {/* Name */}
            <div>
              <Label className="text-xs text-muted-foreground font-medium">Nombre *</Label>
              <Input
                className="mt-1 bg-background"
                value={form.clientName}
                onChange={e => setForm(f => ({ ...f, clientName: e.target.value }))}
                placeholder="Nombre completo o empresa"
              />
            </div>

            {/* Phone */}
            <div>
              <Label className="text-xs text-muted-foreground font-medium">Teléfono</Label>
              <Input
                className="mt-1 bg-background"
                value={form.clientPhone}
                onChange={e => setForm(f => ({ ...f, clientPhone: e.target.value }))}
                placeholder="+504..."
              />
            </div>

            {/* RTN */}
            <div>
              <Label className="text-xs text-muted-foreground font-medium">RTN</Label>
              <Input
                className="mt-1 bg-background"
                value={form.clientRtn}
                onChange={e => {
                  const val = e.target.value.replace(/\D/g, "").slice(0, 14);
                  setForm(f => ({ ...f, clientRtn: val }));
                }}
                placeholder="00000000000000"
                maxLength={14}
                inputMode="numeric"
              />
            </div>

            {/* Collapsible address */}
            <div>
              <button
                type="button"
                onClick={() => setShowAddress(v => !v)}
                className="flex items-center gap-1.5 text-xs font-semibold text-blue-600 hover:text-blue-700 transition-colors"
              >
                {showAddress
                  ? <><ChevronUp className="h-3.5 w-3.5" /> Ocultar dirección</>
                  : <><ChevronDown className="h-3.5 w-3.5" /> + Agregar dirección</>
                }
              </button>
              {showAddress && (
                <div className="grid grid-cols-2 gap-3 mt-3">
                  <div>
                    <Label className="text-xs text-muted-foreground font-medium">Ciudad</Label>
                    <Input
                      className="mt-1 bg-background"
                      value={form.clientCity}
                      onChange={e => setForm(f => ({ ...f, clientCity: e.target.value }))}
                      placeholder="San Pedro Sula"
                    />
                  </div>
                  <div>
                    <Label className="text-xs text-muted-foreground font-medium">Departamento</Label>
                    <Select
                      value={form.clientDepartment}
                      onValueChange={v => setForm(f => ({ ...f, clientDepartment: v }))}
                    >
                      <SelectTrigger className="mt-1 bg-background">
                        <SelectValue placeholder="Seleccionar..." />
                      </SelectTrigger>
                      <SelectContent>
                        {departments.map(d => <SelectItem key={d} value={d}>{d}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="col-span-2">
                    <Label className="text-xs text-muted-foreground font-medium">Dirección</Label>
                    <Input
                      className="mt-1 bg-background"
                      value={form.clientAddress}
                      onChange={e => setForm(f => ({ ...f, clientAddress: e.target.value }))}
                      placeholder="Dirección completa"
                    />
                  </div>
                </div>
              )}
            </div>
          </section>

          {/* Section: Detalles de Pago */}
          <section className="bg-card rounded-xl border p-5 space-y-4">
            <h2 className="font-bold text-foreground text-sm uppercase tracking-wide">
              Detalles de Pago
            </h2>
            <div>
              <Label className="text-xs text-muted-foreground font-medium">Método de pago</Label>
              <Select
                value={form.paymentMethod}
                onValueChange={v => setForm(f => ({ ...f, paymentMethod: v as InvoiceForm["paymentMethod"] }))}
              >
                <SelectTrigger className="mt-1 bg-background">
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
              <div>
                <Label className="text-xs text-muted-foreground font-medium">Número / Referencia de transferencia</Label>
                <Input
                  className="mt-1 bg-background"
                  value={form.transferReference}
                  onChange={e => setForm(f => ({ ...f, transferReference: e.target.value }))}
                  placeholder="Número o referencia de la transferencia"
                />
              </div>
            )}
          </section>

          {/* Section: Notas */}
          <section className="bg-card rounded-xl border p-5 space-y-3">
            <h2 className="font-bold text-foreground text-sm uppercase tracking-wide">Notas</h2>
            <Textarea
              className="bg-background resize-none text-sm"
              value={form.notes}
              onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
              placeholder="Condiciones de pago, instrucciones especiales..."
              rows={3}
            />
          </section>
        </div>

        {/* ─── Right column (1/3) ─── */}
        <div className="space-y-6 lg:sticky lg:top-6 lg:self-start">

          {/* Section: Fechas */}
          <section className="bg-card rounded-xl border p-5 space-y-4">
            <h2 className="font-bold text-foreground text-sm uppercase tracking-wide">Fechas</h2>
            <div>
              <Label className="text-xs text-muted-foreground font-medium">Fecha de emisión *</Label>
              <Input
                type="date"
                className="mt-1 bg-background"
                value={form.issueDate}
                onChange={e => setForm(f => ({ ...f, issueDate: e.target.value }))}
              />
            </div>
            <div>
              <Label className="text-xs text-muted-foreground font-medium">Fecha de vencimiento</Label>
              <Input
                type="date"
                className="mt-1 bg-background"
                value={form.dueDate}
                onChange={e => setForm(f => ({ ...f, dueDate: e.target.value }))}
              />
            </div>
          </section>

          {/* Section: Resumen */}
          <section className="bg-card rounded-xl border p-5 space-y-3">
            <h2 className="font-bold text-foreground text-sm uppercase tracking-wide">Resumen</h2>
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Subtotal</span>
              <span className="font-medium text-foreground">{formatCurrency(subtotal)}</span>
            </div>
            <div className="flex items-center justify-between gap-4">
              <Label className="text-sm text-muted-foreground shrink-0">Descuento</Label>
              <Input
                type="number"
                min={0}
                step="0.01"
                className="bg-background h-8 text-sm text-right w-28"
                value={form.discount}
                onChange={e => setForm(f => ({ ...f, discount: Number(e.target.value) }))}
              />
            </div>
            <div className="flex items-center justify-between gap-4">
              <Label className="text-sm text-muted-foreground shrink-0">ISV</Label>
              <Input
                type="number"
                min={0}
                step="0.01"
                className="bg-background h-8 text-sm text-right w-28"
                value={form.tax}
                onChange={e => setForm(f => ({ ...f, tax: Number(e.target.value) }))}
              />
            </div>
            <Separator />
            <div className="flex justify-between items-center">
              <span className="font-bold text-foreground">Total</span>
              <span className="text-2xl font-black text-blue-600">{formatCurrency(total)}</span>
            </div>
          </section>
        </div>
      </div>

      {/* ── Panel Interno: Utilidad Real ── (NUNCA visible al imprimir) */}
      <section className="print-hide bg-amber-50 dark:bg-amber-950/30 rounded-xl border border-amber-200 dark:border-amber-800 p-5 space-y-4">
        <div className="flex items-center gap-2">
          <span className="text-base">🔒</span>
          <h2 className="font-bold text-amber-900 dark:text-amber-200 text-sm uppercase tracking-wide">
            Panel Interno — Utilidad Real (Escenario B)
          </h2>
          <span className="ml-auto text-xs text-amber-600 dark:text-amber-400 italic">No aparece en la factura del cliente</span>
        </div>

        {/* Métricas calculadas automáticamente */}
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          {[
            { label: "Ingresos Totales", value: totalRevenue, color: "text-emerald-700 dark:text-emerald-400" },
            { label: "Costo Base", value: totalBaseCost, color: "text-red-600 dark:text-red-400" },
            { label: "Utilidad Bruta", value: grossProfit, color: "text-blue-700 dark:text-blue-400" },
            { label: "Pago al Socio (50%)", value: partnerPayout, color: "text-purple-700 dark:text-purple-400" },
            { label: "Mi Bruto (50%)", value: ownerGross, color: "text-indigo-700 dark:text-indigo-400" },
            { label: "Mi Utilidad Real", value: ownerRealIncome, color: ownerRealIncome >= 0 ? "text-emerald-700 dark:text-emerald-400" : "text-red-600 dark:text-red-400" },
          ].map(({ label, value, color }) => (
            <div key={label} className="bg-white dark:bg-amber-900/20 rounded-lg p-3 border border-amber-100 dark:border-amber-800">
              <div className="text-xs text-amber-700 dark:text-amber-400 font-medium mb-1">{label}</div>
              <div className={`text-sm font-bold ${color}`}>{formatCurrency(value)}</div>
            </div>
          ))}
        </div>

        {/* Inputs del dueño */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {/* Gastos internos */}
          <div className="space-y-1.5">
            <Label className="text-sm text-amber-800 dark:text-amber-300 font-semibold">
              Gastos Operativos Internos (L)
            </Label>
            <Input
              id="internal-expenses"
              type="number"
              min={0}
              step="0.01"
              className="bg-white dark:bg-amber-900/20 border-amber-200 dark:border-amber-700 h-9 text-sm"
              placeholder="0.00"
              value={internalExpenses || ""}
              onChange={e => setInternalExpenses(Number(e.target.value) || 0)}
            />
          </div>

          {/* Nota de gastos */}
          <div className="space-y-1.5">
            <Label className="text-sm text-amber-800 dark:text-amber-300 font-semibold">
              Nota de Gastos (ej. envío, empaques)
            </Label>
            <Input
              id="internal-expenses-note"
              type="text"
              className="bg-white dark:bg-amber-900/20 border-amber-200 dark:border-amber-700 h-9 text-sm"
              placeholder="Descripción opcional..."
              value={internalExpensesNote}
              onChange={e => setInternalExpensesNote(e.target.value)}
            />
          </div>

          {/* Impuestos / Reserva SAR */}
          <div className="space-y-1.5 sm:col-span-2">
            <Label className="text-sm text-amber-800 dark:text-amber-300 font-semibold">
              Reserva para Impuestos (SAR / Municipalidad)
            </Label>
            <div className="flex gap-2 flex-wrap">
              <button
                type="button"
                onClick={() => setTaxMode("manual")}
                className={`text-xs px-3 py-1.5 rounded-md border font-semibold transition-colors ${taxMode === "manual" ? "bg-amber-600 text-white border-amber-600" : "bg-white dark:bg-transparent border-amber-300 text-amber-700 dark:text-amber-300"}`}
              >
                Monto Fijo (L)
              </button>
              <button
                type="button"
                onClick={() => setTaxMode("percent")}
                className={`text-xs px-3 py-1.5 rounded-md border font-semibold transition-colors ${taxMode === "percent" ? "bg-amber-600 text-white border-amber-600" : "bg-white dark:bg-transparent border-amber-300 text-amber-700 dark:text-amber-300"}`}
              >
                Porcentaje (%)
              </button>
              {taxMode === "manual" ? (
                <Input
                  id="profit-taxes-amount"
                  type="number"
                  min={0}
                  step="0.01"
                  className="bg-white dark:bg-amber-900/20 border-amber-200 dark:border-amber-700 h-9 text-sm flex-1"
                  placeholder="0.00"
                  value={profitTaxes || ""}
                  onChange={e => setProfitTaxes(Number(e.target.value) || 0)}
                />
              ) : (
                <div className="flex items-center gap-2 flex-1">
                  <Input
                    id="profit-taxes-percent"
                    type="number"
                    min={0}
                    max={100}
                    step="0.1"
                    className="bg-white dark:bg-amber-900/20 border-amber-200 dark:border-amber-700 h-9 text-sm"
                    placeholder="0.0"
                    value={taxPercent || ""}
                    onChange={e => setTaxPercent(Number(e.target.value) || 0)}
                  />
                  <span className="text-sm text-amber-700 dark:text-amber-400 shrink-0">% = {formatCurrency(computedTaxes)}</span>
                </div>
              )}
            </div>
          </div>
        </div>
      </section>

      {/* ── Products table (full width) ── */}
      <section className="bg-card rounded-xl border overflow-hidden">
        <div className="px-5 py-4 border-b flex items-center justify-between">
          <h2 className="font-bold text-foreground text-sm uppercase tracking-wide">Productos / Servicios</h2>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/50">
                <th className="text-left px-4 py-3 font-semibold text-muted-foreground w-8">#</th>
                <th className="text-left px-4 py-3 font-semibold text-muted-foreground">Descripción / Inventario</th>
                <th className="text-center px-4 py-3 font-semibold text-muted-foreground w-24">Cant.</th>
                <th className="text-right px-4 py-3 font-semibold text-muted-foreground w-32">Precio Unit.</th>
                <th className="text-right px-4 py-3 font-semibold text-muted-foreground w-28">Total</th>
                <th className="w-10" />
              </tr>
            </thead>
            <tbody>
              {form.items.map((item, i) => (
                <tr key={i} className="border-b last:border-b-0 align-top">
                  {/* # */}
                  <td className="px-4 py-3 text-muted-foreground font-mono text-xs pt-4">{i + 1}</td>

                  {/* Description + product search */}
                  <td className="px-4 py-3 min-w-[280px]">
                    {/* Product search input */}
                    <div className="relative mb-2">
                      <div className="flex items-center gap-1.5">
                        {/* Code search mini input */}
                        <div className="flex flex-col shrink-0">
                          <Input
                            type="text"
                            className="bg-background h-8 text-sm text-center w-24 shrink-0"
                            placeholder="Código"
                            title="Escribir código y presionar Enter"
                            onKeyDown={e => {
                              if (e.key === "Enter") {
                                e.preventDefault();
                                handleCodeSearch(i, (e.currentTarget.value ?? "").trim());
                              }
                            }}
                          />
                          {codeError[i] && (
                            <span className="text-xs text-red-500 font-medium mt-0.5 text-center">No encontrado</span>
                          )}
                        </div>
                        {/* Name search */}
                        <div className="relative flex-1">
                          <Search className="absolute left-2.5 top-2 h-3.5 w-3.5 text-muted-foreground" />
                          <Input
                            className="pl-8 pr-7 bg-background h-8 text-sm"
                            placeholder="Buscar producto..."
                            value={itemSearch[i] ?? ""}
                            onChange={e => {
                              setItemSearch(s => ({ ...s, [i]: e.target.value }));
                              setItemDropOpen(s => ({ ...s, [i]: true }));
                            }}
                            onFocus={() => setItemDropOpen(s => ({ ...s, [i]: true }))}
                            onBlur={() => setTimeout(() => setItemDropOpen(s => ({ ...s, [i]: false })), 150)}
                          />
                          {(itemSearch[i] || item.productId) && (
                            <button
                              type="button"
                              className="absolute right-2 top-2 text-muted-foreground hover:text-foreground"
                              onClick={() => {
                                setItemSearch(s => ({ ...s, [i]: "" }));
                                setForm(f => {
                                  const items = [...f.items];
                                  items[i] = { ...items[i], productId: undefined, productType: undefined };
                                  return { ...f, items };
                                });
                              }}
                            >
                              <X className="h-3.5 w-3.5" />
                            </button>
                          )}
                        </div>
                        {/* Type badge */}
                        {item.productId && item.productType && (
                          <span className={`text-xs px-2 py-0.5 rounded-md font-semibold shrink-0 ${item.productType === "perfumeria"
                            ? "bg-purple-100 text-purple-700"
                            : "bg-cyan-100 text-cyan-700"
                            }`}>
                            {item.productType === "perfumeria" ? "Perfumería" : "Sublimación"}
                          </span>
                        )}
                      </div>

                      {/* Product dropdown */}
                      {itemDropOpen[i] && (itemSearch[i] ?? "").length > 0 && (
                        <div className="absolute z-50 left-[72px] right-0 mt-1 bg-card border border-border rounded-xl shadow-lg max-h-48 overflow-y-auto">
                          {products
                            .filter(p => p.label.toLowerCase().includes((itemSearch[i] ?? "").toLowerCase()))
                            .slice(0, 12)
                            .map(p => (
                              <button
                                key={`${p.type}-${p.id}`}
                                type="button"
                                className="w-full text-left px-3 py-2 text-sm hover:bg-muted transition-colors flex items-center justify-between gap-2 first:rounded-t-xl last:rounded-b-xl"
                                onMouseDown={() => selectProduct(i, p)}
                              >
                                <div className="flex items-center gap-2 min-w-0">
                                  <span className={`text-xs px-1.5 py-0.5 rounded font-semibold shrink-0 ${p.type === "perfumeria"
                                    ? "bg-purple-100 text-purple-700"
                                    : "bg-cyan-100 text-cyan-700"
                                    }`}>
                                    {p.type === "perfumeria" ? "Perf." : "Sub."}
                                  </span>
                                  <span className="truncate text-foreground font-medium">{p.label}</span>
                                </div>
                                <span className="text-xs font-bold text-foreground shrink-0">{formatCurrency(p.price)}</span>
                              </button>
                            ))}
                          {products.filter(p => p.label.toLowerCase().includes((itemSearch[i] ?? "").toLowerCase())).length === 0 && (
                            <p className="px-3 py-3 text-sm text-muted-foreground text-center">Sin resultados</p>
                          )}
                        </div>
                      )}
                    </div>

                    {/* Description input */}
                    <Input
                      className="bg-background h-8 text-sm"
                      value={item.description}
                      onChange={e => updateItem(i, "description", e.target.value)}
                      placeholder="Descripción del ítem *"
                    />
                    {item.productId && (
                      <p className="text-xs text-emerald-600 font-medium mt-1 flex items-center gap-1">
                        <CheckCircle className="h-3 w-3" /> Producto vinculado — se descontará del inventario
                      </p>
                    )}
                  </td>

                  {/* Quantity */}
                  <td className="px-4 py-3">
                    <Input
                      type="number"
                      min={1}
                      className="bg-background h-8 text-sm text-center w-full"
                      value={item.quantity}
                      onChange={e => updateItem(i, "quantity", Number(e.target.value))}
                    />
                  </td>

                  {/* Unit price */}
                  <td className="px-4 py-3">
                    <Input
                      type="number"
                      min={0}
                      step="0.01"
                      className="bg-background h-8 text-sm text-right w-full"
                      value={item.unitPrice}
                      onChange={e => updateItem(i, "unitPrice", Number(e.target.value))}
                    />
                  </td>

                  {/* Row total */}
                  <td className="px-4 py-3 text-right font-semibold text-foreground pt-4">
                    {formatCurrency(item.quantity * item.unitPrice)}
                  </td>

                  {/* Delete */}
                  <td className="px-2 py-3 pt-3">
                    <button
                      type="button"
                      disabled={form.items.length === 1}
                      onClick={() => removeItem(i)}
                      className="p-1.5 rounded-lg text-muted-foreground hover:text-red-500 hover:bg-red-50 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="px-5 py-3 border-t">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="gap-1.5 text-blue-600 hover:text-blue-700 hover:bg-blue-50 font-semibold"
            onClick={addItem}
          >
            <Plus className="h-4 w-4" /> Agregar línea
          </Button>
        </div>
      </section>

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
