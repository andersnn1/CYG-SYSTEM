import React, { useState, useEffect, useRef } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useListClients } from "@workspace/api-client-react";
import type { Client } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { formatCurrency, departments } from "@/lib/format";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import {
  Plus, Trash2, ClipboardList, CheckCircle, XCircle, Clock,
  Search, X, ChevronDown, ChevronUp, ArrowLeft, Send, FileText, Printer, Download, MessageCircle, AlertTriangle, Package
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useLocation } from "wouter";
import { useIsMobile } from "@/hooks/use-mobile";
import { useSwipe } from "@/hooks/use-swipe";
import { usePullToRefresh } from "@/hooks/use-pull-to-refresh";
import { downloadPdfFromHtml } from "@/lib/pdf";


// ─── Types ────────────────────────────────────────────────────────────────────

interface QuoteItem {
  id?: number;
  description: string;
  quantity: number;
  unitPrice: number;
  total: number;
}

interface Quote {
  id: number;
  quoteNumber: string;
  clientId?: number | null;
  clientName: string;
  clientPhone?: string | null;
  clientEmail?: string | null;
  clientAddress?: string | null;
  clientCity?: string | null;
  clientDepartment?: string | null;
  clientRtn?: string | null;
  paymentMethod?: string | null;
  status: "pendiente" | "aceptada" | "rechazada" | "convertida";
  followUpCount?: number;
  subtotal: number;
  discount: number;
  tax: number;
  total: number;
  notes?: string | null;
  issueDate: string;
  validUntil?: string | null;
  scheduledPurchaseDate?: string | null;
  invoiceId?: number | null;
  items?: QuoteItem[];
  createdAt: string;
  updatedAt: string;
}

interface ProductOption {
  id: number;
  label: string;
  price: number;
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
    throw new Error((err as any).error || `HTTP ${res.status}`);
  }
  if (res.status === 204) return null;
  return res.json();
}

// ─── Status Config ─────────────────────────────────────────────────────────────

const STATUS_CONFIG = {
  pendiente:  { label: "Pendiente",  classes: "bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-900/30 dark:text-amber-300",     dot: "bg-amber-400"   },
  aceptada:   { label: "Aceptada",   classes: "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-900/30 dark:text-emerald-300", dot: "bg-emerald-400" },
  rechazada:  { label: "Rechazada",  classes: "bg-red-50 text-red-700 border-red-200 dark:bg-red-900/30 dark:text-red-300",         dot: "bg-red-400"    },
  convertida: { label: "Convertida", classes: "bg-purple-50 text-purple-700 border-purple-200 dark:bg-purple-900/30 dark:text-purple-300", dot: "bg-purple-400" },
} as const;

function StatusBadge({ status }: { status: Quote["status"] }) {
  const config = STATUS_CONFIG[status] ?? {
    label: status ?? "—",
    classes: "bg-gray-100 text-gray-700 border-gray-200 dark:bg-gray-800 dark:text-gray-300",
    dot: "bg-gray-400",
  };
  const { label, classes, dot } = config;
  return (
    <span className={`inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-full border ${classes}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${dot}`} />
      {label}
    </span>
  );
}

// ─── Print helpers ─────────────────────────────────────────────────────────────

function buildQuoteHtml(quote: Quote): string {
  const BLUE = "#2563EB";
  const subtotal = Number(quote.subtotal);
  const discount = Number(quote.discount);
  const tax      = Number(quote.tax);
  const total    = Number(quote.total);
  const fmt = (n: number) => n.toLocaleString("es-HN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  const itemsHtml = (quote.items ?? []).map(item => `
    <tr style="border-bottom:0.5px solid #e5e7eb;">
      <td style="padding:7px 8px;font-size:9pt;color:#111;">${item.description}</td>
      <td style="padding:7px 8px;font-size:9pt;color:#374151;text-align:center;">${item.quantity.toFixed(2)}</td>
      <td style="padding:7px 8px;font-size:9pt;color:#374151;text-align:right;">${fmt(item.unitPrice)}</td>
      <td style="padding:7px 8px;font-size:9pt;color:${BLUE};font-weight:700;text-align:right;">L ${fmt(item.total)}</td>
    </tr>`).join("");

  const subtotalRow = (discount > 0 || tax > 0) ? `<div style="display:flex;justify-content:space-between;padding:4px 10px;font-size:9pt;"><span style="color:#555;">Subtotal</span><span style="font-weight:600;">L ${fmt(subtotal)}</span></div>` : "";
  const discountRow = discount > 0 ? `<div style="display:flex;justify-content:space-between;padding:4px 10px;font-size:9pt;"><span style="color:#555;">Descuento</span><span style="font-weight:600;color:#b91c1c;">-L ${fmt(discount)}</span></div>` : "";
  const taxRow      = tax > 0      ? `<div style="display:flex;justify-content:space-between;padding:4px 10px;font-size:9pt;"><span style="color:#555;">ISV (15%)</span><span style="font-weight:600;">L ${fmt(tax)}</span></div>` : "";

  const validUntilBlock = quote.validUntil ? `
    <div>
      <div style="font-size:7.5pt;color:#888;text-transform:uppercase;letter-spacing:0.5px;margin-bottom:2px;font-weight:700;">Válida hasta</div>
      <div style="font-size:10pt;font-weight:700;color:#111;">${quote.validUntil}</div>
    </div>` : "";

  const clientInfo = [
    quote.clientRtn     ? `<div style="font-size:8.5pt;color:#555;margin-top:3px;">RTN: ${quote.clientRtn}</div>` : "",
    quote.clientPhone   ? `<div style="font-size:8.5pt;color:#555;">Tel: ${quote.clientPhone}</div>` : "",
    quote.clientEmail   ? `<div style="font-size:8.5pt;color:#555;">${quote.clientEmail}</div>` : "",
    (quote.clientAddress || quote.clientCity || quote.clientDepartment)
      ? `<div style="font-size:8.5pt;color:#555;">${[quote.clientAddress, quote.clientCity, quote.clientDepartment].filter(Boolean).join(", ")}</div>` : "",
  ].join("");

  const notesHtml = quote.notes ? `<div style="font-size:8.5pt;color:#555;">${quote.notes}</div>` : "";

  return `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <title>Cotización ${quote.quoteNumber}</title>
  <style>
    @page { size: letter portrait; margin: 0; }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: Arial, 'Helvetica Neue', sans-serif;
      font-size: 10pt; color: #111; background: #fff;
      width: 216mm; min-height: 279mm;
      padding: 12mm 16mm 10mm 16mm;
      display: flex; flex-direction: column;
      overflow: visible;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }
    table { border-collapse: collapse; width: 100%; }
    .spacer { flex: 1; }
    img { display: block; }
  </style>
</head>
<body>
  <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;">
    <img src="${window.location.origin}/logo.png" alt="C&amp;G Electronics" style="height:80px;width:auto;object-fit:contain;" />
    <div style="text-align:right;font-size:8.5pt;color:#555;font-weight:600;text-transform:uppercase;letter-spacing:0.5px;">SAN PEDRO SULA, HONDURAS</div>
  </div>
  <div style="border-top:1.5px solid #e5e7eb;margin-bottom:14px;"></div>
  <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:16px;">
    <div style="flex:1;">
      <div style="font-size:20pt;font-weight:900;color:${BLUE};margin-bottom:10px;">Cotización ${quote.quoteNumber}</div>
      <div style="display:flex;gap:32px;">
        <div>
          <div style="font-size:7.5pt;color:#888;text-transform:uppercase;letter-spacing:0.5px;margin-bottom:2px;font-weight:700;">Fecha de emisión</div>
          <div style="font-size:10pt;font-weight:700;color:#111;">${quote.issueDate}</div>
        </div>
        ${validUntilBlock}
      </div>
    </div>
    <div style="text-align:right;min-width:200px;">
      <div style="font-size:12pt;font-weight:700;color:#111;">${quote.clientName}</div>
      ${clientInfo}
    </div>
  </div>
  <table>
    <thead>
      <tr style="border-bottom:2px solid ${BLUE};">
        <th style="padding:6px 8px;font-size:8pt;font-weight:700;color:${BLUE};text-transform:uppercase;text-align:left;width:50%;">DESCRIPCIÓN</th>
        <th style="padding:6px 8px;font-size:8pt;font-weight:700;color:${BLUE};text-transform:uppercase;text-align:center;width:10%;">CANT.</th>
        <th style="padding:6px 8px;font-size:8pt;font-weight:700;color:${BLUE};text-transform:uppercase;text-align:right;width:20%;">PRECIO UNIT.</th>
        <th style="padding:6px 8px;font-size:8pt;font-weight:700;color:${BLUE};text-transform:uppercase;text-align:right;width:20%;">IMPORTE</th>
      </tr>
    </thead>
    <tbody>${itemsHtml}</tbody>
  </table>
  <div style="display:flex;justify-content:space-between;align-items:flex-end;margin-top:10px;margin-bottom:14px;">
    <div style="flex:1;">${notesHtml}</div>
    <div style="min-width:260px;">
      ${subtotalRow}${discountRow}${taxRow}
      <div style="display:flex;justify-content:space-between;align-items:center;background:${BLUE};color:#fff;padding:8px 12px;border-radius:2px;">
        <span style="font-weight:700;font-size:10pt;">Total</span>
        <span style="font-weight:900;font-size:12pt;">L ${fmt(total)}</span>
      </div>
    </div>
  </div>
  <div class="spacer"></div>
  <div style="border-top:1.5px solid #d1d5db;padding-top:10px;margin-top:8px;">
    <div style="display:flex;justify-content:space-between;align-items:flex-end;">
      <div style="font-size:8pt;color:#555;line-height:1.75;">
        <div style="font-weight:700;color:#111;font-size:8.5pt;">Contacto</div>
        <div>electronicscheapandgood@gmail.com</div>
        <div>+504 9479-9621</div>
      </div>
      <div style="text-align:right;">
        <div style="font-size:10pt;font-weight:900;color:${BLUE};letter-spacing:0.5px;">GOOD PRICE, GOOD EXPERIENCE</div>
        <div style="font-size:7.5pt;color:#aaa;margin-top:3px;">Página 1 / 1</div>
      </div>
    </div>
  </div>
</body>
</html>`;
}

/**
 * Genera y descarga la cotización directamente como PDF al dispositivo,
 * sin pasar por el diálogo de impresión.
 */
async function downloadQuotePdf(
  quote: Quote,
  onStart: () => void,
  onDone: () => void,
) {
  onStart();
  try {
    const html = buildQuoteHtml(quote);
    await downloadPdfFromHtml(html, `cotizacion-${quote.quoteNumber}.pdf`);
  } catch (err: any) {
    console.error("Error generating PDF", err);
  } finally {
    onDone();
  }
}

/**
 * Escribe el HTML de la cotización en una ventana y dispara impresión.
 * Si se pasa `win`, escribe ahí (ventana ya abierta antes del await).
 * Si no, abre una ventana nueva (solo viable desde un gesto de usuario directo).
 */
function printQuoteWindow(quote: Quote, win?: Window | null) {
  const html = buildQuoteHtml(quote);
  const target = win ?? window.open("", "_blank", "width=900,height=1100");
  if (!target) return;
  target.document.open();
  target.document.write(html);
  target.document.close();
  target.focus();
  // Dar 300ms para que el navegador cargue la imagen del logo antes de imprimir
  setTimeout(() => {
    target.print();
    target.addEventListener("afterprint", () => target.close());
  }, 300);
}

// Vista previa (modal) — solo pantalla, sin impresión automática
function QuotePrintView({ quote }: { quote: Quote }) {
  const subtotal = Number(quote.subtotal);
  const discount = Number(quote.discount);
  const tax = Number(quote.tax);
  const total = Number(quote.total);
  const BLUE = "#2563EB";

  return (
    <div
      style={{
        background: "#fff", color: "#111",
        fontFamily: "Arial, 'Helvetica Neue', sans-serif",
        width: "216mm", minHeight: "279mm",
        margin: "0 auto", padding: "12mm 16mm 10mm 16mm",
        boxSizing: "border-box", fontSize: "10pt",
        display: "flex", flexDirection: "column",
        overflow: "visible",
      }}
    >
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "6px" }}>
        <img src="/logo.png" alt="C&amp;G Electronics" style={{ height: "80px", width: "auto", objectFit: "contain" }} />
        <div style={{ textAlign: "right", fontSize: "8.5pt", color: "#555", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.5px" }}>
          SAN PEDRO SULA, HONDURAS
        </div>
      </div>

      <div style={{ borderTop: "1.5px solid #e5e7eb", marginBottom: "14px" }} />

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "16px" }}>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: "20pt", fontWeight: 900, color: BLUE, marginBottom: "10px" }}>
            Cotización {quote.quoteNumber}
          </div>
          <div style={{ display: "flex", gap: "32px" }}>
            <div>
              <div style={{ fontSize: "7.5pt", color: "#888", textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: "2px", fontWeight: 700 }}>Fecha de emisión</div>
              <div style={{ fontSize: "10pt", fontWeight: 700, color: "#111" }}>{quote.issueDate}</div>
            </div>
            {quote.validUntil && (
              <div>
                <div style={{ fontSize: "7.5pt", color: "#888", textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: "2px", fontWeight: 700 }}>Válida hasta</div>
                <div style={{ fontSize: "10pt", fontWeight: 700, color: "#111" }}>{quote.validUntil}</div>
              </div>
            )}
          </div>
        </div>
        <div style={{ textAlign: "right", minWidth: "200px" }}>
          <div style={{ fontSize: "12pt", fontWeight: 700, color: "#111" }}>{quote.clientName}</div>
          {quote.clientRtn && <div style={{ fontSize: "8.5pt", color: "#555", marginTop: "3px" }}>RTN: {quote.clientRtn}</div>}
          {quote.clientPhone && <div style={{ fontSize: "8.5pt", color: "#555" }}>Tel: {quote.clientPhone}</div>}
          {quote.clientEmail && <div style={{ fontSize: "8.5pt", color: "#555" }}>{quote.clientEmail}</div>}
          {(quote.clientAddress || quote.clientCity || quote.clientDepartment) && (
            <div style={{ fontSize: "8.5pt", color: "#555" }}>
              {[quote.clientAddress, quote.clientCity, quote.clientDepartment].filter(Boolean).join(", ")}
            </div>
          )}
        </div>
      </div>

      <table style={{ width: "100%", borderCollapse: "collapse" }}>
        <thead>
          <tr style={{ borderBottom: `2px solid ${BLUE}` }}>
            <th style={{ padding: "6px 8px", fontSize: "8pt", fontWeight: 700, color: BLUE, textTransform: "uppercase", textAlign: "left", width: "50%" }}>DESCRIPCIÓN</th>
            <th style={{ padding: "6px 8px", fontSize: "8pt", fontWeight: 700, color: BLUE, textTransform: "uppercase", textAlign: "center", width: "10%" }}>CANT.</th>
            <th style={{ padding: "6px 8px", fontSize: "8pt", fontWeight: 700, color: BLUE, textTransform: "uppercase", textAlign: "right", width: "20%" }}>PRECIO UNIT.</th>
            <th style={{ padding: "6px 8px", fontSize: "8pt", fontWeight: 700, color: BLUE, textTransform: "uppercase", textAlign: "right", width: "20%" }}>IMPORTE</th>
          </tr>
        </thead>
        <tbody>
          {quote.items?.map((item, idx) => (
            <tr key={idx} style={{ borderBottom: "0.5px solid #e5e7eb" }}>
              <td style={{ padding: "7px 8px", fontSize: "9pt", color: "#111" }}>{item.description}</td>
              <td style={{ padding: "7px 8px", fontSize: "9pt", color: "#374151", textAlign: "center" }}>{item.quantity.toFixed(2)}</td>
              <td style={{ padding: "7px 8px", fontSize: "9pt", color: "#374151", textAlign: "right" }}>
                {item.unitPrice.toLocaleString("es-HN", { minimumFractionDigits: 2 })}
              </td>
              <td style={{ padding: "7px 8px", fontSize: "9pt", color: BLUE, fontWeight: 700, textAlign: "right" }}>
                L {item.total.toLocaleString("es-HN", { minimumFractionDigits: 2 })}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", marginTop: "10px", marginBottom: "14px" }}>
        <div style={{ fontSize: "8.5pt", color: "#555", flex: 1 }}>
          {quote.notes && <div>{quote.notes}</div>}
        </div>
        <div style={{ minWidth: "260px" }}>
          {(discount > 0 || tax > 0) && (
            <div style={{ display: "flex", justifyContent: "space-between", padding: "4px 10px", fontSize: "9pt" }}>
              <span style={{ color: "#555" }}>Subtotal</span>
              <span style={{ fontWeight: 600 }}>L {subtotal.toLocaleString("es-HN", { minimumFractionDigits: 2 })}</span>
            </div>
          )}
          {discount > 0 && (
            <div style={{ display: "flex", justifyContent: "space-between", padding: "4px 10px", fontSize: "9pt" }}>
              <span style={{ color: "#555" }}>Descuento</span>
              <span style={{ fontWeight: 600, color: "#b91c1c" }}>-L {discount.toLocaleString("es-HN", { minimumFractionDigits: 2 })}</span>
            </div>
          )}
          {tax > 0 && (
            <div style={{ display: "flex", justifyContent: "space-between", padding: "4px 10px", fontSize: "9pt" }}>
              <span style={{ color: "#555" }}>ISV (15%)</span>
              <span style={{ fontWeight: 600 }}>L {tax.toLocaleString("es-HN", { minimumFractionDigits: 2 })}</span>
            </div>
          )}
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", background: BLUE, color: "#fff", padding: "8px 12px", borderRadius: "2px" }}>
            <span style={{ fontWeight: 700, fontSize: "10pt" }}>Total</span>
            <span style={{ fontWeight: 900, fontSize: "12pt" }}>L {total.toLocaleString("es-HN", { minimumFractionDigits: 2 })}</span>
          </div>
        </div>
      </div>

      <div style={{ flex: 1 }} />

      <div style={{ borderTop: "1.5px solid #d1d5db", paddingTop: "10px", marginTop: "8px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end" }}>
          <div style={{ fontSize: "8pt", color: "#555", lineHeight: 1.75 }}>
            <div style={{ fontWeight: 700, color: "#111", fontSize: "8.5pt" }}>Contacto</div>
            <div>electronicscheapandgood@gmail.com</div>
            <div>+504 9479-9621</div>
          </div>
          <div style={{ textAlign: "right" }}>
            <div style={{ fontSize: "10pt", fontWeight: 900, color: BLUE, letterSpacing: "0.5px" }}>GOOD PRICE, GOOD EXPERIENCE</div>
            <div style={{ fontSize: "7.5pt", color: "#aaa", marginTop: "3px" }}>Página 1 / 1</div>
          </div>
        </div>
      </div>
    </div>
  );
}

// Modal de vista previa — solo muestra el documento, sin auto-imprimir
function QuotePrintModal({ quote, onPrint, onClose, onDownload, downloading }: {
  quote: Quote; onPrint: () => void; onClose: () => void;
  onDownload: () => void; downloading: boolean;
}) {
  const containerRef = React.useRef<HTMLDivElement>(null);
  const [scale, setScale] = React.useState(1);
  const DOC_WIDTH = 816; // 216mm at 96dpi

  React.useLayoutEffect(() => {
    function calcScale() {
      const available = containerRef.current?.clientWidth ?? window.innerWidth;
      const padding = 32; // 16px each side
      setScale(Math.min(1, (available - padding) / DOC_WIDTH));
    }
    calcScale();
    window.addEventListener("resize", calcScale);
    return () => window.removeEventListener("resize", calcScale);
  }, []);

  const btnBase: React.CSSProperties = {
    border: "none", borderRadius: "8px", padding: "8px 16px",
    fontWeight: 700, fontSize: "13px", cursor: "pointer",
    display: "flex", alignItems: "center", gap: "6px",
  };
  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 1000, background: "rgba(0,0,0,0.6)", display: "flex", flexDirection: "column" }}>
      <div style={{ background: "#1e293b", color: "#fff", display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 20px", gap: "12px", flexWrap: "wrap" }}>
        <span style={{ fontSize: "13px", fontWeight: 600 }}>{quote.quoteNumber}</span>
        <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
          <button
            onClick={onDownload}
            disabled={downloading}
            style={{ ...btnBase, background: "#16a34a", color: "#fff", opacity: downloading ? 0.7 : 1 }}
          >
            {downloading
              ? <span style={{ width: 14, height: 14, border: "2px solid #fff", borderTopColor: "transparent", borderRadius: "50%", display: "inline-block", animation: "spin 0.6s linear infinite" }} />
              : <Download size={14} />
            }
            Descargar PDF
          </button>
          <button onClick={onPrint} style={{ ...btnBase, background: "#2563EB", color: "#fff" }}>
            <Printer size={14} /> Imprimir
          </button>
          <button onClick={onClose} style={{ ...btnBase, background: "transparent", color: "#94a3b8", border: "1px solid #334155" }}>
            Cerrar
          </button>
        </div>
      </div>
      <div ref={containerRef} style={{ flex: 1, overflowY: "auto", overflowX: "hidden", display: "flex", justifyContent: "center", alignItems: "flex-start", padding: "20px 16px" }}>
        {/* zoom shrinks both visual size and layout space, so scrollbar stays accurate */}
        <div style={{ zoom: scale as any, flexShrink: 0 }}>
          <div style={{ boxShadow: "0 8px 40px rgba(0,0,0,0.45)", borderRadius: "4px", overflow: "hidden" }}>
            <QuotePrintView quote={quote} />
          </div>
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
};

type QuoteForm = {
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
  validUntil: string;
  scheduledPurchaseDate: string;
  paymentMethod: "efectivo" | "tarjeta" | "transferencia" | "cheque";
  items: ItemForm[];
};

const todayDate = new Date();
const today = todayDate.toISOString().split("T")[0];
const validDate = new Date(todayDate);
validDate.setDate(validDate.getDate() + 5);
const defaultValidUntil = validDate.toISOString().split("T")[0];

const defaultForm = (): QuoteForm => ({
  clientId: "", clientName: "", clientPhone: "", clientEmail: "",
  clientAddress: "", clientCity: "", clientDepartment: "", clientRtn: "",
  discount: 0, tax: 0, notes: "", issueDate: today, validUntil: defaultValidUntil,
  scheduledPurchaseDate: "",
  paymentMethod: "efectivo",
  items: [{ description: "", quantity: 1, unitPrice: 0 }],
});

// ─── Main Component ───────────────────────────────────────────────────────────

export default function Cotizaciones() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { data: clients } = useListClients();
  const [location, setLocation] = useLocation();
  const isMobile = useIsMobile();

  const isCreate = location === "/cotizaciones/nueva";
  const editMatch = location.match(/^\/cotizaciones\/editar\/(\d+)$/);
  const editingId = editMatch ? Number(editMatch[1]) : null;
  const view = (isCreate || editingId) ? "form" : "list";

  // Mock navigate / setView / setEditingId for backward compatibility
  const navigate = setLocation;
  const setView = (v: "list" | "form") => {
    if (v === "list") {
      setLocation("/cotizaciones");
    } else {
      setLocation("/cotizaciones/nueva");
    }
  };
  const setEditingId = (id: number | null) => {
    if (id === null) {
      setLocation("/cotizaciones");
    } else {
      setLocation(`/cotizaciones/editar/${id}`);
    }
  };

  const [quotes, setQuotes] = useState<Quote[]>([]);
  const [loading, setLoading] = useState(true);
  const { isPulling, ...pullHandlers } = usePullToRefresh(async () => {
    await loadQuotes();
  });

  const swipeHandlers = useSwipe(undefined, () => setLocation("/cotizaciones"));
  const [statusFilter, setStatusFilter] = useState("all");
  const [searchQuery, setSearchQuery] = useState("");

  const [submitting, setSubmitting] = useState(false);
  const [form, setForm] = useState<QuoteForm>(defaultForm());
  const [showAddress, setShowAddress] = useState(false);

  const [clientSearch, setClientSearch] = useState("");
  const [clientDropOpen, setClientDropOpen] = useState(false);
  const [highlightedClientIndex, setHighlightedClientIndex] = useState(0);
  const clientRef = useRef<HTMLDivElement>(null);

  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteId, setDeleteId] = useState<number | null>(null);
  const [convertOpen, setConvertOpen] = useState(false);
  const [convertId, setConvertId] = useState<number | null>(null);

  const [printQuote, setPrintQuote] = useState<Quote | null>(null);
  const printWinRef = useRef<Window | null>(null);
  const [downloadingId, setDownloadingId] = useState<number | null>(null);
  const [products, setProducts] = useState<ProductOption[]>([]);
  const [productModalOpen, setProductModalOpen] = useState(false);
  const [itemSearchQuery, setItemSearchQuery] = useState("");
  const [catFilter, setCatFilter] = useState<string>("all");

  /**
   * Abre la ventana de impresión ANTES del fetch (gesto de usuario) para
   * evitar que el popup blocker la bloquee; luego escribe el contenido.
   */
  const handlePrintClick = async (e: React.MouseEvent, quoteId: number) => {
    e.stopPropagation();
    // 1. Abrir ventana inmediatamente mientras estamos en el gesto del usuario
    const win = window.open("", "_blank", "width=900,height=1100");
    if (!win) return;
    win.document.write(`<html><body style="font-family:Arial,sans-serif;display:flex;align-items:center;justify-content:center;height:100vh;margin:0;background:#f8fafc"><div style="text-align:center;color:#64748b"><div style="font-size:32px;margin-bottom:12px">&#128247;</div><div style="font-size:14px">Preparando cotización...</div></div></body></html>`);
    printWinRef.current = win;
    // 2. Fetch en background
    try {
      const full: Quote = await apiFetch(`/quotes/${quoteId}`);
      setPrintQuote(full);           // muestra el modal de vista previa
      printQuoteWindow(full, win);   // escribe HTML en la ventana ya abierta
    } catch {
      win.close();
    }
  };

  const handleDownloadClick = async (quoteId: number) => {
    if (downloadingId) return;
    setDownloadingId(quoteId);
    try {
      const full: Quote = await apiFetch(`/quotes/${quoteId}`);
      await downloadQuotePdf(full, () => {}, () => {});
      toast({ title: "PDF descargado", description: `cotizacion-${full.quoteNumber}.pdf` });
    } catch (err: any) {
      toast({ title: "Error al descargar", description: err.message, variant: "destructive" });
    } finally {
      setDownloadingId(null);
    }
  };


  const [itemSearch, setItemSearch] = useState<Record<number, string>>({});
  const [itemDropOpen, setItemDropOpen] = useState<Record<number, boolean>>({});
  const [highlightedItemIndex, setHighlightedItemIndex] = useState<Record<number, number>>({});

  useEffect(() => {
    async function loadProducts() {
      try {
        const [perf, sub, combos, cust] = await Promise.all([
          apiFetch("/perfumery"),
          apiFetch("/sublimation"),
          apiFetch("/combos"),
          apiFetch("/custom-inventory").catch(() => []),
        ]);
        const perfOpts: ProductOption[] = (Array.isArray(perf) ? perf : []).map((p: any) => ({
          id: p.id,
          label: `${p.brand} ${p.name} ${p.ml}ml`,
          price: Number(p.salePrice ?? 0),
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
          type: "combo" as const,
          code: c.code ?? null,
          stock: 999,
          comboItems: c.items,
          fixedPrice: c.fixedPrice != null ? Number(c.fixedPrice) : null,
          brand: "C&G Combo",
        }));
        const customOpts: ProductOption[] = (Array.isArray(cust) ? cust : []).map((c: any) => ({
          id: c.id,
          label: c.name,
          price: Number(c.salePrice ?? 0),
          type: "sublimacion" as const,
          code: c.code ?? null,
          stock: Number(c.stock ?? 0),
          brand: c.brand || "Personalizado",
          subType: c.categoryName || "Otros",
        }));
        setProducts([...perfOpts, ...subOpts, ...comboOpts, ...customOpts]);
      } catch { /* products unavailable */ }
    }
    loadProducts();
  }, []);
  
  // ── Keyboard Shortcuts ─────────────────────────────────────────────────
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (view === "list") return;

      switch (e.key) {
        case "F2":
          e.preventDefault();
          const lastIdx = form.items.length - 1;
          const searchInput = document.getElementById(`product-search-input-${lastIdx}`);
          searchInput?.focus();
          break;
        case "F3":
          e.preventDefault();
          setProductModalOpen(true);
          break;
        case "F4":
          e.preventDefault();
          handleSubmit();
          break;
        case "F7":
        case "F9":
          e.preventDefault();
          const nameInput = document.getElementById("client-search-input");
          const rtnInput = document.getElementById("client-rtn-input");
          if (e.key === "F9" && document.activeElement === nameInput) {
            rtnInput?.focus();
          } else {
            nameInput?.focus();
          }
          break;
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [view, form.items.length, form.clientName, form.clientRtn, productModalOpen]);


  const loadQuotes = async () => {
    try {
      setLoading(true);
      const data = await apiFetch("/quotes");
      setQuotes(Array.isArray(data) ? data : []);
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadQuotes(); }, []);

  const filtered = quotes
    .filter(q => statusFilter === "all" || q.status === statusFilter)
    .filter(q =>
      !searchQuery ||
      q.clientName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      q.quoteNumber.toLowerCase().includes(searchQuery.toLowerCase())
    )
    .sort((a, b) => {
      // Urgentes (pendiente >48h) flotan al tope
      const nowMs = Date.now();
      const isA_Urgent = a.status === "pendiente" && (nowMs - new Date(a.createdAt).getTime() > 48 * 3600 * 1000);
      const isB_Urgent = b.status === "pendiente" && (nowMs - new Date(b.createdAt).getTime() > 48 * 3600 * 1000);
      if (isA_Urgent && !isB_Urgent) return -1;
      if (!isA_Urgent && isB_Urgent) return 1;
      // El backend ya retorna por id DESC (más reciente primero), conservar ese orden
      return b.id - a.id;
    });

  const counts = {
    all:        quotes.length,
    pendiente:  quotes.filter(q => q.status === "pendiente").length,
    aceptada:   quotes.filter(q => q.status === "aceptada").length,
    rechazada:  quotes.filter(q => q.status === "rechazada").length,
    convertida: quotes.filter(q => q.status === "convertida").length,
  };

  useEffect(() => {
    if (editingId) {
      async function loadEditingQuote() {
        try {
          const full: Quote = await apiFetch(`/quotes/${editingId}`);
          setForm({
            clientId:         String(full.clientId ?? ""),
            clientName:       full.clientName,
            clientPhone:      full.clientPhone ?? "",
            clientEmail:      full.clientEmail ?? "",
            clientAddress:    full.clientAddress ?? "",
            clientCity:       full.clientCity ?? "",
            clientDepartment: full.clientDepartment ?? "",
            clientRtn:        full.clientRtn ?? "",
            paymentMethod:    (full.paymentMethod as QuoteForm["paymentMethod"]) ?? "efectivo",
            discount:         full.discount,
            tax:              full.tax,
            notes:            full.notes ?? "",
            issueDate:              full.issueDate,
            validUntil:             full.validUntil ?? "",
            scheduledPurchaseDate:  full.scheduledPurchaseDate ?? "",
            items:            full.items?.map(it => ({
              description: it.description,
              quantity:    it.quantity,
              unitPrice:   it.unitPrice,
            })) ?? [],
          });
          setShowAddress(!!(full.clientAddress || full.clientCity || full.clientDepartment));
          setClientSearch(full.clientName);
          setItemSearch({});
          setItemDropOpen({});
        } catch (e: any) {
          toast({ title: "Error", description: e.message, variant: "destructive" });
          setLocation("/cotizaciones");
        }
      }
      loadEditingQuote();
    }
  }, [editingId]);

  const openCreate = () => {
    setForm(defaultForm());
    setShowAddress(false);
    setClientSearch("");
    setItemSearch({});
    setItemDropOpen({});
    setLocation("/cotizaciones/nueva");
  };

  const openEdit = (q: Quote) => {
    setLocation(`/cotizaciones/editar/${q.id}`);
  };

  useEffect(() => {
    (window as any).__openNewQuote = openCreate;
    return () => {
      delete (window as any).__openNewQuote;
    };
  }, []);


  const selectClient = (client: Client) => {
    setForm(f => ({
      ...f,
      clientId:         String(client.id),
      clientName:       client.name,
      clientPhone:      client.phone      ?? "",
      clientEmail:      client.email      ?? "",
      clientAddress:    client.address    ?? "",
      clientCity:       client.city       ?? "",
      clientDepartment: client.department ?? "",
    }));
    setClientSearch(client.name);
    setClientDropOpen(false);
  };

  const selectProduct = (itemIndex: number, product: ProductOption, initialQuantity?: number) => {
    setForm(f => {
      const items = [...f.items];
      const quantityPrefix = initialQuantity ?? (items[itemIndex]?.quantity || 1);
      
      if (product.type === "combo" && product.comboItems) {
        const expandedItems = product.comboItems.map((ci: any) => ({
          description: ci.productName,
          quantity: ci.quantity * quantityPrefix,
          unitPrice: product.fixedPrice != null
            ? product.fixedPrice / product.comboItems!.length
            : (ci.unitPrice ?? 0),
          productId: ci.productId,
          productType: ci.productType,
        }));
        const newItems = [...items.slice(0, itemIndex), ...expandedItems, ...items.slice(itemIndex + 1)];
        return { ...f, items: newItems };
      }

      items[itemIndex] = {
        ...(items[itemIndex] || {}),
        description: product.label,
        quantity:    quantityPrefix,
        unitPrice:   product.price,
        productId:   product.id,
        productType: product.type,
      };
      return { ...f, items };
    });
    setItemDropOpen(s => ({ ...s, [itemIndex]: false }));
    setItemSearch(s => ({ ...s, [itemIndex]: "" }));
  };

  const handleCodeSearch = async (itemIndex: number, inputValue: string) => {
    let trimmed = inputValue.trim();
    if (!trimmed) return;

    let quantityPrefix = 1;
    if (trimmed.includes("*")) {
      const parts = trimmed.split("*");
      const q = Number(parts[0]);
      if (!isNaN(q) && q > 0) {
        quantityPrefix = q;
        trimmed = parts.slice(1).join("*").trim();
      }
    }

    // 1. Exact product code match
    const found = products.find(p => p.code && p.code.toLowerCase() === trimmed.toLowerCase())
      ?? products.find(p => p.id === Number(trimmed));
    if (found) {
      selectProduct(itemIndex, found, quantityPrefix);
      return;
    }

    // 2. Combo code match → expand into multiple items
    try {
      const combo = await apiFetch(`/combos/${encodeURIComponent(trimmed.toUpperCase())}`);
      if (combo && Array.isArray(combo.items) && combo.items.length > 0) {
        setForm(f => {
          const before   = f.items.slice(0, itemIndex);
          const after    = f.items.slice(itemIndex + 1);
          const expanded: ItemForm[] = combo.items.map((ci: any) => ({
            description: ci.productName,
            quantity:    ci.quantity,
            unitPrice:   combo.fixedPrice != null
              ? Number(combo.fixedPrice) / combo.items.length
              : Number(ci.unitPrice),
            productId:   ci.productId,
            productType: ci.productType,
          }));
          return { ...f, items: [...before, ...expanded, ...after] };
        });
        setItemSearch(s => ({ ...s, [itemIndex]: "" }));
        toast({ title: `Combo "${combo.name}" expandido`, description: `${combo.items.length} productos agregados` });
      }
    } catch { /* not a combo */ }
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

  const getQuoteItemQty = (p: ProductOption) => {
    const idx = form.items.findIndex(it => it.productId === p.id && it.productType === p.type);
    return idx !== -1 ? form.items[idx].quantity : 0;
  };

  const handleUpdateQuoteItemQty = (p: ProductOption, newQty: number) => {
    setForm(f => {
      let items = [...f.items];
      const idx = items.findIndex(it => it.productId === p.id && it.productType === p.type);
      
      if (idx !== -1) {
        if (newQty <= 0) {
          items = items.filter((_, i) => i !== idx);
        } else {
          items[idx] = { ...items[idx], quantity: newQty };
        }
      } else if (newQty > 0) {
        const newItem: ItemForm = {
          description: p.label,
          quantity: newQty,
          unitPrice: p.price,
          productId: p.id,
          productType: p.type,
        };
        const emptyIdx = items.findIndex(it => !it.description.trim());
        if (emptyIdx !== -1) {
          items[emptyIdx] = newItem;
        } else {
          items.push(newItem);
        }
      }
      
      if (items.length === 0 || items[items.length - 1].description !== "") {
        items.push({ description: "", quantity: 1, unitPrice: 0 });
      }
      return { ...f, items };
    });
  };

  const subtotal = form.items.reduce((s, it) => s + it.quantity * it.unitPrice, 0);
  const total    = subtotal - form.discount + form.tax;

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
        clientId:         form.clientId ? Number(form.clientId) : undefined,
        clientName:       form.clientName,
        clientPhone:      form.clientPhone       || undefined,
        clientEmail:      form.clientEmail       || undefined,
        clientAddress:    form.clientAddress     || undefined,
        clientCity:       form.clientCity        || undefined,
        clientDepartment: form.clientDepartment  || undefined,
        clientRtn:        form.clientRtn         || undefined,
        paymentMethod:    form.paymentMethod,
        discount:         form.discount,
        tax:              form.tax,
        notes:            form.notes             || null,
        issueDate:              form.issueDate,
        validUntil:             form.validUntil              || null,
        scheduledPurchaseDate:  form.scheduledPurchaseDate   || null,
        items: form.items.map(it => ({
          description: it.description,
          quantity:    it.quantity,
          unitPrice:   it.unitPrice,
          productId:   it.productId,
          productType: it.productType,
        })),
      };

      if (editingId) {
        await apiFetch(`/quotes/${editingId}`, { method: "PATCH", body: JSON.stringify(body) });
        toast({ title: "Cotización actualizada" });
      } else {
        await apiFetch("/quotes", { method: "POST", body: JSON.stringify(body) });
        toast({ title: "Cotización creada" });
      }
      setView("list");
      setForm(defaultForm());
      setEditingId(null);
      loadQuotes();
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    } finally {
      setSubmitting(false);
    }
  };

  const handleStatusChange = async (id: number, status: Quote["status"]) => {
    try {
      await apiFetch(`/quotes/${id}`, { method: "PATCH", body: JSON.stringify({ status }) });
      toast({ title: `Cotización marcada como ${STATUS_CONFIG[status].label}` });
      loadQuotes();
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    }
  };

  const handleWhatsApp = async (q: Quote) => {
    const msg = `Hola ${q.clientName}, ¿pudiste revisar la cotización que te enviamos de C&G Electronics? Quedo atento.`;
    let phone = q.clientPhone || "";
    phone = phone.replace(/\D/g, "");
    if (phone.length === 8 && (phone.startsWith("9") || phone.startsWith("3"))) phone = "504" + phone;
    const url = `https://wa.me/${phone}?text=${encodeURIComponent(msg)}`;
    window.open(url, "_blank");

    const newCount = (q.followUpCount || 0) + 1;
    try {
      await apiFetch(`/quotes/${q.id}`, { method: "PATCH", body: JSON.stringify({ followUpCount: newCount }) });
      loadQuotes();
    } catch (e) {}
  };

  const handleDelete = async () => {
    if (!deleteId) return;
    try {
      await apiFetch(`/quotes/${deleteId}`, { method: "DELETE" });
      toast({ title: "Cotización eliminada" });
      setDeleteOpen(false);
      setDeleteId(null);
      if (view === "form") setView("list");
      loadQuotes();
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    }
  };

  const handleConvert = async () => {
    if (!convertId) return;
    try {
      await apiFetch(`/quotes/${convertId}/convert`, { method: "POST" });
      toast({ title: "Cotización convertida a factura" });
      setConvertOpen(false);
      setConvertId(null);
      navigate("/facturas");
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    }
  };

  const handleAcceptAndInvoice = async (id: number) => {
    try {
      await apiFetch(`/quotes/${id}`, { method: "PATCH", body: JSON.stringify({ status: "aceptada" }) });
      toast({ title: "Cotización aceptada. Redirigiendo a facturación..." });
      const q = quotes.find(q => q.id === id);
      if (q) localStorage.setItem("facturaDraft", JSON.stringify({ ...q, status: "aceptada" }));
      navigate("/facturas");
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    }
  };

  const editingQuote = editingId ? quotes.find(q => q.id === editingId) : null;

  // ─── LIST VIEW ───────────────────────────────────────────────────────────────
  if (view === "list") {
    return (
      <div className="space-y-5 animate-in fade-in duration-200" {...(isMobile ? pullHandlers : {})}>
        {isMobile && isPulling && (
          <div className="flex justify-center py-2 animate-in fade-in">
            <div className="h-5 w-5 border-2 border-primary border-t-transparent rounded-full animate-spin" />
          </div>
        )}
        {/* Top bar */}
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <ClipboardList className="h-5 w-5 sm:h-6 sm:w-6 text-foreground flex-shrink-0" />
            <h1 className="text-2xl font-bold text-foreground">Cotizaciones</h1>
          </div>
          <Button onClick={openCreate} className="gap-2 bg-blue-600 hover:bg-blue-700 text-white font-semibold flex-shrink-0 h-11">
            <Plus className="h-4 w-4" />
            <span className="hidden sm:inline">Nueva Cotización</span>
          </Button>
        </div>

        {/* Filter bar */}
        <div className="space-y-2 sm:space-y-0 sm:flex sm:flex-wrap sm:items-center sm:gap-3">
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

          {/* Status filters — scrollable on mobile */}
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1 sm:pb-0 no-scrollbar">
            {(["all", "pendiente", "aceptada", "rechazada", "convertida"] as const).map(s => {
              const labels: Record<string, string> = {
                all: "Todas", pendiente: "Pendiente",
                aceptada: "Aceptada", rechazada: "Rechazada", convertida: "Convertida",
              };
              const count = counts[s];
              const active = statusFilter === s;
              return (
                <button
                  key={s}
                  onClick={() => setStatusFilter(s)}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-all border whitespace-nowrap flex-shrink-0 ${
                    active
                      ? "bg-blue-600 text-white border-blue-600 shadow-sm"
                      : "bg-background text-muted-foreground border-border hover:border-blue-300 hover:text-foreground"
                  }`}
                >
                  {labels[s]}
                  <span className={`text-xs px-1.5 py-0.5 rounded-full font-semibold ${
                    active ? "bg-white/20 text-white" : "bg-muted text-muted-foreground"
                  }`}>
                    {count}
                  </span>
                </button>
              );
            })}
          </div>

          <span className="text-sm text-muted-foreground sm:ml-auto">
            {filtered.length} {filtered.length === 1 ? "cotización" : "cotizaciones"}
          </span>
        </div>

        {/* Table */}
        {loading ? (
          <div className="space-y-2">
            {[1, 2, 3, 4, 5].map(i => <Skeleton key={i} className="h-12 w-full rounded-lg" />)}
          </div>
        ) : filtered.length === 0 ? (
          <div className="bg-card rounded-xl border py-20 text-center">
            <div className="w-14 h-14 bg-muted rounded-xl flex items-center justify-center mx-auto mb-3">
              <ClipboardList className="h-7 w-7 text-muted-foreground" />
            </div>
            <p className="text-foreground font-medium">
              {searchQuery || statusFilter !== "all" ? "Sin resultados" : "No hay cotizaciones"}
            </p>
            <p className="text-muted-foreground text-sm mt-1">
              {searchQuery || statusFilter !== "all"
                ? "Prueba con otros filtros"
                : "Crea tu primera cotización con el botón de arriba"}
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
                    <th className="text-left px-4 py-3 font-semibold text-muted-foreground hidden md:table-cell">Fecha</th>
                    <th className="text-left px-4 py-3 font-semibold text-muted-foreground hidden lg:table-cell">Válida hasta</th>
                    <th className="text-left px-4 py-3 font-semibold text-muted-foreground">Estado</th>
                    <th className="text-right px-4 py-3 font-semibold text-muted-foreground">Total</th>
                    <th className="w-28 px-2 py-3 text-right font-semibold text-muted-foreground">Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((q, idx) => (
                    <tr
                      key={q.id}
                      className={`hover:bg-muted/50 transition-colors border-b last:border-b-0 ${idx % 2 === 0 ? "" : "bg-muted/20"}`}
                    >
                      <td className="px-4 py-3 font-mono font-semibold text-foreground cursor-pointer" onClick={() => openEdit(q)}>
                        <div className="flex items-center gap-2">
                          {q.quoteNumber}
                          {q.status === "pendiente" && (Date.now() - new Date(q.createdAt).getTime() > 48 * 3600 * 1000) && (
                            <span title="Prioridad: +48 hrs pendiente">
                              <AlertTriangle className="h-4 w-4 text-red-500" />
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3 font-medium text-foreground max-w-[180px] truncate cursor-pointer" onClick={() => openEdit(q)}>{q.clientName}</td>
                      <td className="px-4 py-3 text-muted-foreground hidden md:table-cell cursor-pointer" onClick={() => openEdit(q)}>{q.issueDate}</td>
                      <td className="px-4 py-3 text-muted-foreground hidden lg:table-cell cursor-pointer" onClick={() => openEdit(q)}>
                        {q.validUntil ?? <span className="text-muted-foreground/50">—</span>}
                      </td>
                      <td className="px-4 py-3 cursor-pointer" onClick={() => openEdit(q)}>
                        <StatusBadge status={q.status} />
                      </td>
                      <td className="px-4 py-3 text-right font-bold text-foreground cursor-pointer" onClick={() => openEdit(q)}>
                        {formatCurrency(q.total)}
                      </td>
                      <td className="px-2 py-3 text-right">
                        <div className="flex items-center justify-end gap-1">
                          {q.status === "pendiente" && q.clientPhone && (
                            <button
                              title="Seguimiento WhatsApp"
                              onClick={e => { e.stopPropagation(); handleWhatsApp(q); }}
                              className="p-1.5 rounded-lg text-muted-foreground hover:text-green-600 hover:bg-green-50 transition-colors relative"
                            >
                              <MessageCircle className="h-4 w-4" />
                              {q.followUpCount && q.followUpCount > 0 ? (
                                <span className="absolute -top-1.5 -right-1.5 bg-green-100 text-green-700 text-[9px] font-bold px-1.5 rounded-full">{q.followUpCount}</span>
                              ) : null}
                            </button>
                          )}
                          <button
                            title="Imprimir Cotización"
                            onClick={e => handlePrintClick(e, q.id)}
                            className="p-1.5 rounded-lg text-muted-foreground hover:text-blue-600 hover:bg-blue-50 transition-colors"
                          >
                            <Printer className="h-4 w-4" />
                          </button>
                          {q.status !== "convertida" && q.status !== "rechazada" && (
                            <button
                              title="Convertir a Factura"
                              onClick={e => { e.stopPropagation(); setConvertId(q.id); setConvertOpen(true); }}
                              className="p-1.5 rounded-lg text-muted-foreground hover:text-purple-600 hover:bg-purple-50 dark:hover:bg-purple-900/20 transition-colors"
                            >
                              <FileText className="h-4 w-4" />
                            </button>
                          )}
                          <button
                            title="Eliminar"
                            onClick={e => { e.stopPropagation(); setDeleteId(q.id); setDeleteOpen(true); }}
                            className="p-1.5 rounded-lg text-muted-foreground hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
                          >
                            <Trash2 className="h-4 w-4" />
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
              {filtered.map(q => (
                <div key={q.id} className="bg-card border border-border rounded-xl overflow-hidden">

                  {/* Card header — tap to open */}
                  <div className="px-4 pt-4 pb-3 cursor-pointer" onClick={() => openEdit(q)}>
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-mono font-bold text-foreground">{q.quoteNumber}</span>
                          {q.status === "pendiente" && (Date.now() - new Date(q.createdAt).getTime() > 48 * 3600 * 1000) && (
                            <span title="Prioridad: +48 hrs pendiente">
                              <AlertTriangle className="h-4 w-4 text-red-500" />
                            </span>
                          )}
                          <StatusBadge status={q.status} />
                        </div>
                        <p className="font-semibold text-foreground mt-1 truncate">{q.clientName}</p>
                        <div className="flex items-center gap-3 mt-0.5">
                          <span className="text-xs text-muted-foreground">{q.issueDate}</span>
                          {q.validUntil && (
                            <span className="text-xs text-muted-foreground">Válida: {q.validUntil}</span>
                          )}
                        </div>
                      </div>
                      <div className="text-right flex-shrink-0">
                        <p className="text-xl font-bold text-foreground">{formatCurrency(q.total)}</p>
                        {(Number(q.discount) > 0 || Number(q.tax) > 0) && (
                          <p className="text-xs text-muted-foreground mt-0.5">
                            Sub: {formatCurrency(q.subtotal)}
                          </p>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Action bar */}
                  <div className="flex border-t border-border/60 divide-x divide-border/60">
                    <button
                      className="flex-1 flex items-center justify-center gap-1.5 py-3 text-sm font-semibold text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-colors"
                      onClick={() => openEdit(q)}
                    >
                      Abrir
                    </button>
                    {q.status === "pendiente" && q.clientPhone && (
                      <button
                        title="Seguimiento WhatsApp"
                        className="flex-1 flex items-center justify-center py-3 text-muted-foreground hover:text-green-600 hover:bg-green-50 dark:hover:bg-green-900/20 transition-colors relative"
                        onClick={e => { e.stopPropagation(); handleWhatsApp(q); }}
                      >
                        <MessageCircle className="h-5 w-5" />
                        {q.followUpCount && q.followUpCount > 0 ? (
                          <span className="absolute top-2 right-[25%] bg-green-100 text-green-700 text-[10px] font-bold px-1.5 rounded-full">{q.followUpCount}</span>
                        ) : null}
                      </button>
                    )}
                    {/* Download PDF — avoids print dialog on mobile */}
                    <button
                      title="Descargar PDF"
                      disabled={downloadingId === q.id}
                      className="flex-1 flex items-center justify-center py-3 text-muted-foreground hover:text-green-600 hover:bg-green-50 dark:hover:bg-green-900/20 transition-colors disabled:opacity-50"
                      onClick={() => handleDownloadClick(q.id)}
                    >
                      {downloadingId === q.id
                        ? <span className="h-5 w-5 border-2 border-current border-t-transparent rounded-full animate-spin" />
                        : <Download className="h-5 w-5" />
                      }
                    </button>
                    {q.status !== "convertida" && q.status !== "rechazada" && (
                      <button
                        title="Convertir a Factura"
                        className="flex-1 flex items-center justify-center py-3 text-muted-foreground hover:text-purple-600 hover:bg-purple-50 dark:hover:bg-purple-900/20 transition-colors"
                        onClick={e => { e.stopPropagation(); setConvertId(q.id); setConvertOpen(true); }}
                      >
                        <FileText className="h-5 w-5" />
                      </button>
                    )}
                    <button
                      title="Eliminar"
                      className="flex-1 flex items-center justify-center py-3 text-muted-foreground hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
                      onClick={e => { e.stopPropagation(); setDeleteId(q.id); setDeleteOpen(true); }}
                    >
                      <Trash2 className="h-5 w-5" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </>
        )}

        {/* Print Modal — vista previa */}
        {printQuote && (
          <QuotePrintModal
            quote={printQuote}
            onPrint={() => printQuoteWindow(printQuote)}
            onClose={() => setPrintQuote(null)}
            onDownload={() => handleDownloadClick(printQuote.id)}
            downloading={downloadingId === printQuote.id}
          />
        )}

        {/* Delete AlertDialog */}
        <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>¿Eliminar esta cotización?</AlertDialogTitle>
              <AlertDialogDescription>Esta acción no se puede deshacer.</AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancelar</AlertDialogCancel>
              <AlertDialogAction onClick={handleDelete} className="bg-red-600 hover:bg-red-700 font-bold">
                Eliminar
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        {/* Convert AlertDialog */}
        <AlertDialog open={convertOpen} onOpenChange={setConvertOpen}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Convertir a Factura</AlertDialogTitle>
              <AlertDialogDescription>
                Se creará una nueva factura con los datos de esta cotización y la cotización quedará marcada como "Convertida".
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancelar</AlertDialogCancel>
              <AlertDialogAction onClick={handleConvert} className="bg-purple-600 hover:bg-purple-700 font-bold">
                Convertir
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    );
  }

  // ─── FORM VIEW ────────────────────────────────────────────────────────────────
  const currentStatus = editingQuote?.status ?? "pendiente";

  const renderProductCatalogModal = () => (
    <Dialog open={productModalOpen} onOpenChange={setProductModalOpen}>
      <DialogContent className="w-full h-[100dvh] sm:h-[80vh] max-w-full sm:max-w-5xl lg:max-w-6xl sm:max-h-[85vh] p-0 overflow-hidden border-none sm:border sm:border-white/10 shadow-2xl bg-slate-950 text-slate-100 flex flex-col animate-in fade-in duration-200 sm:!zoom-in-100 sm:!slide-in-from-top-[50%] sm:!slide-in-from-left-[50%]">
        <div className="p-4 sm:p-6 border-b border-white/5 bg-slate-900/50 shrink-0">
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
          {/* Categorías */}
          <div className="flex items-center gap-1.5 overflow-x-auto pt-4 no-scrollbar">
             {(["all", "perfumeria", "combo", "maquinaria", "consumible"] as const).map(c => {
                const labels = {
                  all: "Todos",
                  perfumeria: "Perfumería",
                  combo: "Combos",
                  maquinaria: "Maquinaria",
                  consumible: "Consumibles"
                };
                const active = catFilter === c;
                return (
                  <button
                    key={c}
                    type="button"
                    onClick={() => setCatFilter(c)}
                    className={`px-4 py-2 rounded-full text-[10px] font-black uppercase tracking-widest transition-all whitespace-nowrap border ${active ? "bg-blue-600 text-white border-blue-500 shadow-[0_0_15px_rgba(37,99,235,0.4)]" : "bg-slate-900 text-slate-500 border-white/5 hover:text-slate-300"}`}
                  >
                    {labels[c]}
                  </button>
                );
              })}
          </div>
        </div>
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 bg-slate-950 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4">
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
              .map(p => isMobile ? (
                <div
                  key={`${p.type}-${p.id}`}
                  className="flex items-center justify-between p-3.5 bg-slate-900/60 border border-white/5 rounded-2xl gap-3"
                >
                  <div className="flex items-center gap-3 min-w-0 flex-1">
                    <div className="h-10 w-10 rounded-xl bg-slate-800 flex items-center justify-center text-slate-500 shrink-0">
                      <Package className="h-5 w-5" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        {p.brand && <span className="text-[8px] font-black uppercase text-blue-400 tracking-widest">{p.brand}</span>}
                        {p.ml && <span className="text-[8px] font-bold text-slate-500 bg-white/5 px-1 rounded">{p.ml}ml</span>}
                        {p.stock !== null && p.stock <= 0 && <span className="text-[8px] font-bold text-red-400 bg-red-500/10 px-1 rounded">Agotado</span>}
                      </div>
                      <p className="font-bold text-xs text-white truncate max-w-[150px] leading-tight">
                        {p.type === "combo" ? `COMBO: ${p.label}` : p.label}
                      </p>
                      <div className="flex items-center gap-2 mt-0.5">
                        <span className="text-[9px] font-mono text-slate-500">#{p.code || p.id}</span>
                        <span className="text-[9.5px] font-mono font-bold text-blue-400">{formatCurrency(p.price)}</span>
                      </div>
                    </div>
                  </div>
                  
                  <div className="shrink-0">
                    {p.type === "combo" ? (
                      <Button
                        type="button"
                        size="sm"
                        className="h-8 px-3 text-[10px] font-bold uppercase bg-blue-600 hover:bg-blue-700 text-white cursor-pointer active:scale-95"
                        onClick={() => {
                          const emptyIdx = form.items.findIndex(it => !it.description.trim());
                          const targetIdx = emptyIdx === -1 ? form.items.length : emptyIdx;
                          selectProduct(targetIdx, p);
                          toast({ title: "Combo añadido", description: p.label });
                        }}
                      >
                        + Combo
                      </Button>
                    ) : (() => {
                      const qty = getQuoteItemQty(p);
                      if (qty === 0) {
                        return (
                          <Button
                            type="button"
                            size="sm"
                            className="h-8 px-3 text-[10px] font-bold uppercase bg-blue-600 hover:bg-blue-700 text-white cursor-pointer active:scale-95"
                            onClick={() => handleUpdateQuoteItemQty(p, 1)}
                          >
                            + Añadir
                          </Button>
                        );
                      }
                      return (
                        <div className="flex items-center bg-slate-800 rounded-lg border border-white/10 h-8 px-0.5">
                          <button
                            type="button"
                            onClick={() => handleUpdateQuoteItemQty(p, qty - 1)}
                            className="h-7 w-7 flex items-center justify-center text-slate-400 hover:text-white font-black text-xs active:scale-75"
                          >
                            -
                          </button>
                          <input
                            type="number"
                            pattern="[0-9]*"
                            inputMode="numeric"
                            min="0"
                            value={qty === 0 ? "" : qty}
                            onChange={e => {
                              const val = parseInt(e.target.value, 10);
                              handleUpdateQuoteItemQty(p, isNaN(val) ? 0 : val);
                            }}
                            onBlur={e => {
                              if (qty < 0) {
                                handleUpdateQuoteItemQty(p, 0);
                              }
                            }}
                            className="w-10 text-center text-xs font-mono font-bold bg-transparent border-none p-0 focus:outline-none focus:ring-0 text-white [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                          />
                          <button
                            type="button"
                            onClick={() => handleUpdateQuoteItemQty(p, qty + 1)}
                            className="h-7 w-7 flex items-center justify-center text-slate-400 hover:text-white font-black text-xs active:scale-75"
                          >
                            +
                          </button>
                        </div>
                      );
                    })()}
                  </div>
                </div>
              ) : (
                <button
                  key={`${p.type}-${p.id}`}
                  type="button"
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
        <div className="p-4 sm:p-6 bg-slate-900/50 border-t border-white/5 flex justify-between items-center shrink-0">
           <div className="text-[10px] font-bold text-slate-500 uppercase tracking-widest flex items-center gap-4">
              <span className="flex items-center gap-1.5"><kbd className="bg-slate-800 px-1.5 py-0.5 rounded text-slate-300">↑↓</kbd> Navegar</span>
              <span className="flex items-center gap-1.5"><kbd className="bg-slate-800 px-1.5 py-0.5 rounded text-slate-300">ENTER</kbd> Seleccionar</span>
           </div>
           <Button variant="ghost" className="font-black uppercase tracking-widest text-[10px] text-slate-400 hover:text-white hover:bg-white/5" onClick={() => setProductModalOpen(false)}>Cerrar [ESC]</Button>
        </div>
      </DialogContent>
    </Dialog>
  );

  if (isMobile) {
    return (
      <div {...swipeHandlers} className="flex flex-col min-h-[calc(100vh-4rem)] bg-background animate-in fade-in duration-200">
        {/* Header */}
        <header className="flex items-center justify-between border-b pb-3 mb-4 sticky top-0 bg-background z-20 pt-1">
          <Button variant="ghost" size="sm" className="h-9 gap-1 px-0 text-muted-foreground font-semibold cursor-pointer" onClick={() => { setLocation("/cotizaciones"); setForm(defaultForm()); }}>
            <ArrowLeft className="h-4 w-4" /> Volver
          </Button>
          <div className="text-center flex-1">
            <h1 className="font-bold text-sm uppercase">{editingId ? (editingQuote?.quoteNumber ?? "Cotización") : "Nueva Cotización"}</h1>
            <p className="text-[8px] font-black text-muted-foreground tracking-widest uppercase">Móvil</p>
          </div>
          {editingId && editingQuote && (
            <StatusBadge status={editingQuote.status} />
          )}
        </header>

        {/* Selected Client Card */}
        <div className="bg-blue-600/10 border border-blue-500/20 rounded-xl p-3.5 flex justify-between items-center mb-4">
          <div className="min-w-0">
            <span className="text-[8px] font-black text-blue-500 uppercase tracking-widest block mb-0.5">Cliente</span>
            <span className="text-sm font-bold text-foreground truncate block">{form.clientName || "Consumidor Final"}</span>
            {form.clientPhone && <span className="text-[10px] text-muted-foreground font-medium block mt-0.5">{form.clientPhone}</span>}
          </div>
          <div className="relative" ref={clientRef}>
            <Button variant="outline" size="sm" className="h-8 text-[10px] font-bold uppercase shrink-0 border-blue-500/30 text-blue-600 cursor-pointer" onClick={() => setClientDropOpen(v => !v)}>
              Cambiar
            </Button>
            {clientDropOpen && (
              <div className="absolute right-0 top-10 z-50 w-64 bg-card border rounded-lg shadow-xl max-h-48 overflow-y-auto p-1">
                <Input 
                  className="h-8 text-xs mb-1" 
                  placeholder="Filtrar clientes..." 
                  value={clientSearch}
                  onChange={e => setClientSearch(e.target.value)}
                />
                {(Array.isArray(clients) ? clients : [])
                  .filter(c => !clientSearch || c.name.toLowerCase().includes(clientSearch.toLowerCase()))
                  .map(c => (
                    <button key={c.id} className="w-full text-left px-2 py-1.5 hover:bg-muted text-xs rounded truncate block" onClick={() => selectClient(c)}>
                      {c.name}
                    </button>
                  ))
                }
              </div>
            )}
          </div>
        </div>

        {/* Summary Banner */}
        <div className="bg-slate-950 dark:bg-card border text-white p-4 rounded-xl shadow-md flex justify-between items-center mb-4">
          <div className="space-y-0.5">
            <span className="text-[8px] font-black uppercase tracking-[0.2em] text-slate-400">Total Cotizado</span>
            <div className="text-2xl font-black font-mono tracking-tight tabular-nums">{formatCurrency(total)}</div>
          </div>
          <div className="text-right text-[10px] text-slate-400 font-medium">
            <div>Items: {form.items.length}</div>
            <div>Subtotal: {formatCurrency(subtotal)}</div>
          </div>
        </div>

        {/* Form fields scrollable */}
        <div className="flex-1 space-y-4 pb-32">
          <div className="bg-card border rounded-xl p-4 space-y-4">
            <h3 className="font-bold text-xs uppercase text-muted-foreground border-b pb-2">Información del Cliente</h3>
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label className="text-[9px] font-black uppercase text-slate-500">Nombre</Label>
                  <Input className="h-9 text-xs" value={form.clientName} onChange={e => setForm(f => ({ ...f, clientName: e.target.value }))} />
                </div>
                <div className="space-y-1">
                  <Label className="text-[9px] font-black uppercase text-slate-500">Teléfono</Label>
                  <Input type="tel" inputMode="tel" className="h-9 text-xs" value={form.clientPhone} onChange={e => setForm(f => ({ ...f, clientPhone: e.target.value }))} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label className="text-[9px] font-black uppercase text-slate-500">RTN</Label>
                  <Input className="h-9 text-xs" value={form.clientRtn} onChange={e => setForm(f => ({ ...f, clientRtn: e.target.value }))} />
                </div>
                <div className="space-y-1">
                  <Label className="text-[9px] font-black uppercase text-slate-500">Email</Label>
                  <Input className="h-9 text-xs" value={form.clientEmail} onChange={e => setForm(f => ({ ...f, clientEmail: e.target.value }))} />
                </div>
              </div>
            </div>
          </div>

          <div className="bg-card border rounded-xl p-4 space-y-4">
            <h3 className="font-bold text-xs uppercase text-muted-foreground border-b pb-2">Fechas &amp; Valores</h3>
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label className="text-[9px] font-black uppercase text-slate-500">Emisión</Label>
                  <Input type="date" className="h-9 font-bold text-xs" value={form.issueDate} onChange={e => setForm(f => ({ ...f, issueDate: e.target.value }))} />
                </div>
                <div className="space-y-1">
                  <Label className="text-[9px] font-black uppercase text-slate-500">Validez</Label>
                  <Input type="date" className="h-9 font-bold text-xs" value={form.validUntil} onChange={e => setForm(f => ({ ...f, validUntil: e.target.value }))} />
                </div>
              </div>
              <div className="space-y-1">
                <Label className="text-[9px] font-black uppercase text-slate-500">Compra Programada</Label>
                <Input type="date" className="h-9 font-bold text-xs" value={form.scheduledPurchaseDate} onChange={e => setForm(f => ({ ...f, scheduledPurchaseDate: e.target.value }))} />
              </div>
              <div className="grid grid-cols-2 gap-3 pt-2">
                <div className="space-y-1">
                  <Label className="text-[9px] font-black uppercase text-slate-500">Descuento</Label>
                  <Input type="number" inputMode="decimal" className="h-9 font-bold text-xs text-right" value={form.discount} onChange={e => setForm(f => ({ ...f, discount: Number(e.target.value) }))} />
                </div>
                <div className="space-y-1">
                  <Label className="text-[9px] font-black uppercase text-slate-500">ISV (15%)</Label>
                  <Input type="number" inputMode="decimal" className="h-9 font-bold text-xs text-right" value={form.tax} onChange={e => setForm(f => ({ ...f, tax: Number(e.target.value) }))} />
                </div>
              </div>
            </div>
          </div>

          <div className="bg-card border rounded-xl p-4 space-y-4">
            <div className="flex justify-between items-center border-b pb-2">
              <h3 className="font-bold text-xs uppercase text-muted-foreground">Líneas de Cotización</h3>
              <Button variant="outline" size="sm" className="h-8 text-[9px] font-bold uppercase cursor-pointer" onClick={() => setProductModalOpen(true)}>
                <Package className="h-3 w-3 mr-1" /> Catálogo
              </Button>
            </div>
            <div className="space-y-4 divide-y">
              {form.items.map((it, i) => (
                <div key={i} className="pt-3 first:pt-0 space-y-2">
                  <div className="flex justify-between items-center">
                    <span className="text-[10px] font-black font-mono text-muted-foreground/60">Línea #{i + 1}</span>
                    <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive shrink-0 cursor-pointer" onClick={() => removeItem(i)}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                  <div className="relative">
                    <Input 
                      className="h-9 text-xs font-semibold" 
                      placeholder="Buscar producto..." 
                      value={itemSearch[i] || ""} 
                      onChange={e => {
                        setItemSearch(s => ({ ...s, [i]: e.target.value }));
                        setItemDropOpen(s => ({ ...s, [i]: true }));
                      }}
                    />
                    {itemDropOpen[i] && (
                      <div className="absolute left-0 right-0 top-10 z-50 bg-card border rounded-lg shadow-xl max-h-48 overflow-y-auto p-1">
                        {products
                          .filter(p => {
                            if (!itemSearch[i]) return true;
                            const q = itemSearch[i].toLowerCase();
                            return (
                              p.label.toLowerCase().includes(q) ||
                              p.code?.toLowerCase().includes(q) ||
                              p.brand?.toLowerCase().includes(q) ||
                              p.type.toLowerCase().includes(q)
                            );
                          })
                          .map(p => (
                            <button key={p.id} className="w-full text-left px-2 py-1.5 hover:bg-muted text-xs rounded truncate block" onClick={() => selectProduct(i, p)}>
                              {p.label} - {formatCurrency(p.price)} (Stock: {p.stock})
                            </button>
                          ))
                        }
                      </div>
                    )}
                  </div>
                  <div className="flex gap-2">
                    <div className="flex-1">
                      <Label className="text-[8px] font-black uppercase text-slate-500">Cantidad</Label>
                      <Input type="number" inputMode="decimal" className="h-9 font-mono font-bold text-xs text-center" value={it.quantity} onChange={e => updateItem(i, "quantity", Number(e.target.value))} />
                    </div>
                    <div className="flex-1">
                      <Label className="text-[8px] font-black uppercase text-slate-500">Precio Unitario</Label>
                      <Input type="number" inputMode="decimal" className="h-9 font-mono font-bold text-xs text-right" value={it.unitPrice} onChange={e => updateItem(i, "unitPrice", Number(e.target.value))} />
                    </div>
                    <div className="flex-1 flex flex-col justify-end items-end pb-1.5 font-black font-mono text-xs text-primary">
                      {formatCurrency(it.quantity * it.unitPrice)}
                    </div>
                  </div>
                </div>
              ))}
            </div>
            <div className="grid grid-cols-2 gap-2 mt-2">
              <Button variant="outline" size="sm" className="w-full h-9.5 gap-1.5 border-dashed border-primary/30 text-primary uppercase font-bold text-[10px] cursor-pointer" onClick={addItem}>
                <Plus className="h-3.5 w-3.5" /> Añadir Fila
              </Button>
              <Button variant="outline" size="sm" className="w-full h-9.5 gap-1.5 border-dashed border-blue-500/30 text-blue-500 hover:bg-blue-500/5 uppercase font-bold text-[10px] cursor-pointer" onClick={() => setProductModalOpen(true)}>
                <Package className="h-3.5 w-3.5" /> + Catálogo
              </Button>
            </div>
          </div>
        </div>

        {/* Bottom Actions Floating Bar */}
        <div className="fixed bottom-0 left-0 right-0 bg-background border-t p-4 z-30 grid grid-cols-2 gap-2 shadow-[0_-4px_12px_rgba(0,0,0,0.05)] safe-area-bottom">
          <Button variant="outline" className="h-11 text-xs font-bold uppercase cursor-pointer" onClick={() => { setLocation("/cotizaciones"); setForm(defaultForm()); }}>
            Cancelar
          </Button>
          <Button className="h-11 bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs uppercase shadow-md cursor-pointer" onClick={handleSubmit} disabled={submitting}>
            {submitting ? "Guardando..." : "Guardar Cotización"}
          </Button>
        </div>
        {renderProductCatalogModal()}
      </div>
    );
  }

  return (
    <div className="animate-in fade-in duration-200 space-y-6 pb-16">
      {/* Form header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Button
            variant="ghost"
            size="sm"
            className="gap-1.5 text-muted-foreground hover:text-foreground"
            onClick={() => { setView("list"); setEditingId(null); setForm(defaultForm()); }}
          >
            <ArrowLeft className="h-4 w-4" /> Cotizaciones
          </Button>
          <Separator orientation="vertical" className="h-5" />
          <span className="font-bold text-foreground text-lg">
            {editingId ? (editingQuote?.quoteNumber ?? "Editar Cotización") : "Nueva Cotización"}
          </span>
          {editingId && editingQuote && (
            <StatusBadge status={editingQuote.status} />
          )}
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <Button
            variant="outline"
            className="gap-1.5 font-semibold text-blue-600 border-blue-300 hover:bg-blue-50"
            onClick={() => setProductModalOpen(true)}
          >
            <Package className="h-4 w-4" /> Productos [F3]
          </Button>
          <Button variant="outline" className="font-semibold" onClick={handleSubmit} disabled={submitting}>
            {submitting ? "Guardando..." : "Guardar"}
          </Button>

          {editingId && editingQuote && (
            <Button
              variant="outline"
              className="gap-1.5 font-semibold text-blue-600 border-blue-300 hover:bg-blue-50"
              onClick={e => handlePrintClick(e as unknown as React.MouseEvent, editingId)}
            >
              <Printer className="h-4 w-4" /> Imprimir
            </Button>
          )}

          {editingId && editingQuote && currentStatus === "pendiente" && (
            <>
              <Button
                className="bg-emerald-600 hover:bg-emerald-700 text-white font-semibold flex-shrink-0"
                onClick={() => handleAcceptAndInvoice(editingId)}
              >
                <CheckCircle className="h-4 w-4 mr-1.5" /> Aceptada (Facturar)
              </Button>
              <Button
                variant="outline"
                className="border-red-300 text-red-600 hover:bg-red-50 font-semibold flex-shrink-0"
                onClick={() => handleStatusChange(editingId, "rechazada")}
              >
                <XCircle className="h-4 w-4 mr-1.5" /> Rechazada
              </Button>
            </>
          )}

          {editingId && editingQuote && currentStatus !== "convertida" && currentStatus !== "rechazada" && (
            <Button
              variant="outline"
              className="border-purple-300 text-purple-600 hover:bg-purple-50 font-semibold"
              onClick={() => { setConvertId(editingId); setConvertOpen(true); }}
            >
              <FileText className="h-4 w-4 mr-1.5" /> Convertir a Factura
            </Button>
          )}

          {editingId && (
            <Button
              variant="ghost"
              size="icon"
              className="text-muted-foreground hover:text-red-600 hover:bg-red-50"
              onClick={() => { setDeleteId(editingId); setDeleteOpen(true); }}
              title="Eliminar cotización"
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          )}
        </div>
      </div>

      {/* Two-column layout */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left column */}
        <div className="lg:col-span-2 space-y-6">

          {/* Información del Cliente */}
          <section className="bg-card rounded-xl border p-5 space-y-4">
            <h2 className="font-bold text-foreground text-sm uppercase tracking-wide">Información del Cliente</h2>

            <div className="relative" ref={clientRef}>
              <Label className="text-xs text-muted-foreground font-medium">Buscar cliente existente</Label>
              <div className="relative mt-1">
                <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  id="client-search-input"
                  className="pl-9 bg-background"
                  placeholder="Nombre del cliente..."
                  value={clientSearch}
                  onChange={e => {
                    setClientSearch(e.target.value);
                    setClientDropOpen(true);
                    setHighlightedClientIndex(0);
                    setForm(f => ({ ...f, clientName: e.target.value, clientId: "" }));
                  }}
                  onKeyDown={e => {
                    const matches = (clients ?? [])
                      .filter((c: Client) => c.name.toLowerCase().includes(clientSearch.toLowerCase()))
                      .slice(0, 8);
                    
                    if (clientDropOpen && matches.length > 0) {
                      if (e.key === "ArrowDown") {
                        e.preventDefault();
                        setHighlightedClientIndex(prev => Math.min(prev + 1, matches.length - 1));
                      } else if (e.key === "ArrowUp") {
                        e.preventDefault();
                        setHighlightedClientIndex(prev => Math.max(prev - 1, 0));
                      } else if (e.key === "Enter" || e.key === "Tab") {
                        e.preventDefault();
                        selectClient(matches[highlightedClientIndex]);
                      }
                    }
                  }}
                  onFocus={() => {
                    setClientDropOpen(true);
                    setHighlightedClientIndex(0);
                  }}
                  onBlur={() => setTimeout(() => setClientDropOpen(false), 150)}
                />
              </div>
              {clientDropOpen && clientSearch.trim().length > 0 && (
                <div className="absolute z-50 w-full mt-1 bg-card border border-border rounded-xl shadow-lg max-h-52 overflow-y-auto">
                  {(clients ?? [])
                    .filter((c: Client) => c.name.toLowerCase().includes(clientSearch.toLowerCase()))
                    .slice(0, 8)
                    .map((c: Client, idx: number) => (
                      <button
                        key={c.id}
                        type="button"
                        className={`w-full text-left px-4 py-2.5 text-sm transition-colors first:rounded-t-xl last:rounded-b-xl ${
                          idx === highlightedClientIndex ? "bg-blue-600 text-white" : "hover:bg-muted text-foreground"
                        }`}
                        onMouseDown={() => selectClient(c)}
                        onMouseEnter={() => setHighlightedClientIndex(idx)}
                      >
                        <span className={`font-medium ${idx === highlightedClientIndex ? "text-white" : "text-foreground"}`}>{c.name}</span>
                        {c.phone && <span className={`ml-2 text-xs ${idx === highlightedClientIndex ? "text-blue-100" : "text-muted-foreground"}`}>{c.phone}</span>}
                      </button>
                    ))}
                  {(clients ?? []).filter((c: Client) => c.name.toLowerCase().includes(clientSearch.toLowerCase())).length === 0 && (
                    <p className="px-4 py-3 text-sm text-muted-foreground text-center">Sin coincidencias</p>
                  )}
                </div>
              )}
            </div>

            <div>
              <Label className="text-xs text-muted-foreground font-medium">Nombre *</Label>
              <Input
                className="mt-1 bg-background"
                value={form.clientName}
                onChange={e => setForm(f => ({ ...f, clientName: e.target.value }))}
                placeholder="Nombre completo o empresa"
              />
            </div>

            <div>
              <Label className="text-xs text-muted-foreground font-medium">Teléfono</Label>
              <Input
                className="mt-1 bg-background"
                value={form.clientPhone}
                onChange={e => setForm(f => ({ ...f, clientPhone: e.target.value }))}
                placeholder="+504..."
              />
            </div>

            <div>
              <Label className="text-xs text-muted-foreground font-medium">RTN</Label>
              <Input
                id="client-rtn-input"
                className="mt-1 bg-background"
                value={form.clientRtn}
                onChange={e => setForm(f => ({ ...f, clientRtn: e.target.value.replace(/\D/g,"").slice(0,14) }))}
                placeholder="RTN de la empresa"
              />
            </div>

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

          {/* Ítems */}
          <section className="bg-card rounded-xl border p-5 space-y-4">
            <h2 className="font-bold text-foreground text-sm uppercase tracking-wide">Ítems</h2>

            {form.items.map((item, i) => {
              const filteredProducts = products.filter(p => {
                if (!itemSearch[i]) return true;
                const q = itemSearch[i].toLowerCase();
                return (
                  p.label.toLowerCase().includes(q) ||
                  p.code?.toLowerCase().includes(q) ||
                  p.brand?.toLowerCase().includes(q) ||
                  p.type.toLowerCase().includes(q)
                );
              }).slice(0, 8);

              return (
                <div key={i} className="relative border border-border rounded-lg p-4 space-y-3 bg-background">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-muted-foreground uppercase">Ítem {i + 1}</span>
                    {form.items.length > 1 && (
                      <button
                        type="button"
                        onClick={() => removeItem(i)}
                        className="text-destructive hover:text-destructive/70 transition-colors"
                      >
                        <X className="h-4 w-4" />
                      </button>
                    )}
                  </div>

                  <div className="relative">
                    <Label className="text-xs text-muted-foreground font-medium">Descripción *</Label>
                    <div className="relative mt-1">
                      <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                      <Input
                        id={`product-search-input-${i}`}
                        className="pl-9 bg-card"
                        placeholder="Buscar producto o escribir descripción..."
                        value={itemSearch[i] !== undefined ? itemSearch[i] : item.description}
                        onChange={e => {
                          const val = e.target.value;
                          setItemSearch(s => ({ ...s, [i]: val }));
                          setItemDropOpen(s => ({ ...s, [i]: true }));
                          setHighlightedItemIndex(s => ({ ...s, [i]: 0 }));
                          updateItem(i, "description", val);
                        }}
                        onKeyDown={e => {
                          const filtered = products.filter(p => {
                            if (!itemSearch[i]) return true;
                            const q = itemSearch[i].toLowerCase();
                            return (
                              p.label.toLowerCase().includes(q) ||
                              p.code?.toLowerCase().includes(q) ||
                              p.brand?.toLowerCase().includes(q) ||
                              p.type.toLowerCase().includes(q)
                            );
                          }).slice(0, 8);

                          if (itemDropOpen[i] && filtered.length > 0) {
                            const currentIdx = highlightedItemIndex[i] || 0;
                            if (e.key === "ArrowDown") {
                              e.preventDefault();
                              setHighlightedItemIndex(s => ({ ...s, [i]: Math.min(currentIdx + 1, filtered.length - 1) }));
                            } else if (e.key === "ArrowUp") {
                              e.preventDefault();
                              setHighlightedItemIndex(s => ({ ...s, [i]: Math.max(currentIdx - 1, 0) }));
                            } else if (e.key === "Enter" || e.key === "Tab") {
                              e.preventDefault();
                              selectProduct(i, filtered[currentIdx]);
                            }
                          } else if (e.key === "Enter") {
                            e.preventDefault();
                            handleCodeSearch(i, (itemSearch[i] ?? item.description));
                          }
                        }}
                        onFocus={() => {
                          setItemDropOpen(s => ({ ...s, [i]: true }));
                          setHighlightedItemIndex(s => ({ ...s, [i]: 0 }));
                        }}
                        onBlur={() => setTimeout(() => setItemDropOpen(s => ({ ...s, [i]: false })), 150)}
                      />
                    </div>
                    {itemDropOpen[i] && filteredProducts.length > 0 && (
                      <div className="absolute z-50 w-full mt-1 bg-card border border-border rounded-xl shadow-lg max-h-48 overflow-y-auto">
                        {filteredProducts.map((p, idx) => (
                          <button
                            key={`${p.type}-${p.id}`}
                            type="button"
                            className={`w-full text-left px-4 py-2.5 text-sm transition-colors flex items-center justify-between first:rounded-t-xl last:rounded-b-xl ${
                              idx === (highlightedItemIndex[i] || 0) ? "bg-blue-600 text-white" : "hover:bg-muted text-foreground"
                            }`}
                            onMouseDown={() => selectProduct(i, p)}
                            onMouseEnter={() => setHighlightedItemIndex(s => ({ ...s, [i]: idx }))}
                          >
                            <div className="flex items-center gap-2 truncate">
                              <span className={`text-[10px] px-1.5 py-0.5 rounded font-bold shrink-0 ${
                                idx === (highlightedItemIndex[i] || 0) 
                                  ? "bg-white/20 text-white" 
                                  : (p.type === "perfumeria" 
                                      ? "bg-purple-100 text-purple-700" 
                                      : p.type === "combo"
                                        ? "bg-amber-100 text-amber-700 border border-amber-300"
                                        : "bg-cyan-100 text-cyan-700")
                              }`}>
                                {p.type === "perfumeria" ? "Perf." : p.type === "combo" ? "Combo" : "Sub."}
                              </span>
                              <span className="truncate font-medium">{p.label}</span>
                            </div>
                            <span className={`text-xs font-bold shrink-0 ml-2 ${idx === (highlightedItemIndex[i] || 0) ? "text-white" : "text-foreground"}`}>
                              {formatCurrency(p.price)}
                            </span>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>

                  <div className="grid grid-cols-3 gap-3">
                    <div>
                      <Label className="text-xs text-muted-foreground font-medium">Cantidad *</Label>
                      <Input
                        type="number"
                        min={1}
                        className="mt-1 bg-card"
                        value={item.quantity}
                        onChange={e => updateItem(i, "quantity", Number(e.target.value))}
                      />
                    </div>
                    <div>
                      <Label className="text-xs text-muted-foreground font-medium">Precio Unitario *</Label>
                      <Input
                        type="number"
                        min={0}
                        step="0.01"
                        className="mt-1 bg-card"
                        value={item.unitPrice || ""}
                        onChange={e => updateItem(i, "unitPrice", Number(e.target.value))}
                      />
                    </div>
                    <div>
                      <Label className="text-xs text-muted-foreground font-medium">Subtotal</Label>
                      <div className="mt-1 px-3 py-2 bg-muted rounded-md text-sm font-semibold text-foreground">
                        {formatCurrency(item.quantity * item.unitPrice)}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}

            <div className="flex gap-3">
              <Button type="button" variant="outline" onClick={addItem} className="flex-1 gap-2 border-dashed">
                <Plus className="h-4 w-4" /> Agregar Ítem
              </Button>
              <Button type="button" variant="outline" onClick={() => setProductModalOpen(true)} className="flex-1 gap-2 border-dashed border-blue-300 text-blue-600 hover:bg-blue-50">
                <Package className="h-4 w-4" /> + Catálogo
              </Button>
            </div>
          </section>

          {/* Notas */}
          <section className="bg-blue-50 dark:bg-blue-950/20 p-5 rounded-2xl border border-blue-100 dark:border-blue-900/50 space-y-4 shadow-sm">
            <h2 className="text-[10px] text-blue-600/70 font-black uppercase tracking-widest">Resumen de Cotización</h2>
            <div className="space-y-1.5">
              <div className="flex justify-between text-[10px] text-blue-600/70 font-black uppercase tracking-widest">
                <span>Subtotal</span>
                <span>{formatCurrency(subtotal)}</span>
              </div>
              <div className="flex items-center justify-between group">
                <Label className="text-[10px] text-red-600/70 font-black uppercase tracking-widest">Descuento</Label>
                <Input
                  type="number" min={0} step="0.01"
                  className="h-6 py-0 px-2 border-transparent hover:border-blue-200 focus:border-blue-400 bg-transparent text-right w-28 shadow-none text-sm text-red-600 font-black"
                  value={form.discount || ""}
                  onChange={e => setForm(f => ({ ...f, discount: Number(e.target.value) }))}
                />
              </div>
              <div className="flex items-center justify-between group">
                <Label className="text-[10px] text-blue-600/70 font-black uppercase tracking-widest">Impuesto (ISV)</Label>
                <Input
                  type="number" min={0} step="0.01"
                  className="h-6 py-0 px-2 border-transparent hover:border-blue-200 focus:border-blue-400 bg-transparent text-right w-28 shadow-none text-sm font-black text-blue-800"
                  value={form.tax || ""}
                  onChange={e => setForm(f => ({ ...f, tax: Number(e.target.value) }))}
                />
              </div>
            </div>
            
            <div className="pt-4 border-t-2 border-blue-200/30 flex flex-col items-end">
              <span className="text-[10px] font-black text-blue-600/40 uppercase tracking-[0.3em]">Total Neto</span>
              <span className="text-5xl font-black text-blue-600 tracking-tighter leading-none py-1">{formatCurrency(total)}</span>
            </div>
            
            <div className="grid grid-cols-1 gap-3 pt-2">
               <Button 
                 id="btn-save-quote"
                 onClick={handleSubmit}
                 disabled={submitting}
                 className="bg-blue-600 hover:bg-blue-700 text-white font-black h-12 shadow-lg shadow-blue-600/20 uppercase tracking-wider text-xs w-full"
               >
                 {submitting ? "Guardando..." : "Guardar Cotización (F4)"}
               </Button>
            </div>
          </section>
        </div>

        {/* Right column */}
        <div className="space-y-6 lg:sticky lg:top-6 lg:self-start">

          {/* Fechas */}
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
              <Label className="text-xs text-muted-foreground font-medium">Válida hasta</Label>
              <Input
                type="date"
                className="mt-1 bg-background"
                value={form.validUntil}
                onChange={e => setForm(f => ({ ...f, validUntil: e.target.value }))}
              />
            </div>
            <div>
              <Label className="text-xs font-medium flex items-center gap-1.5">
                <span className="inline-block w-2 h-2 rounded-full bg-yellow-400"></span>
                Fecha programada de compra
              </Label>
              <Input
                type="date"
                className="mt-1 bg-background border-yellow-300 focus-visible:ring-yellow-400"
                value={form.scheduledPurchaseDate}
                onChange={e => setForm(f => ({ ...f, scheduledPurchaseDate: e.target.value }))}
              />
              <p className="text-xs text-muted-foreground mt-1">Aparece resaltada en el calendario del dashboard</p>
            </div>
          </section>

          {/* Resumen */}
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
                className="w-28 text-right bg-background h-8 text-sm"
                value={form.discount || ""}
                onChange={e => setForm(f => ({ ...f, discount: Number(e.target.value) }))}
              />
            </div>
            <div className="flex items-center justify-between gap-4">
              <Label className="text-sm text-muted-foreground shrink-0">ISV (15%)</Label>
              <Input
                type="number"
                min={0}
                step="0.01"
                className="w-28 text-right bg-background h-8 text-sm"
                value={form.tax || ""}
                onChange={e => setForm(f => ({ ...f, tax: Number(e.target.value) }))}
              />
            </div>
            <div className="border-t pt-3 flex justify-between items-center">
              <span className="font-bold text-foreground">Total</span>
              <span className="text-xl font-bold text-foreground">{formatCurrency(total)}</span>
            </div>
          </section>

          {/* Método de pago */}
          <section className="bg-card rounded-xl border p-5 space-y-4">
            <h2 className="font-bold text-foreground text-sm uppercase tracking-wide">Método de Pago</h2>
            <Select
              value={form.paymentMethod}
              onValueChange={v => setForm(f => ({ ...f, paymentMethod: v as QuoteForm["paymentMethod"] }))}
            >
              <SelectTrigger className="bg-background">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="efectivo">Efectivo</SelectItem>
                <SelectItem value="tarjeta">Tarjeta</SelectItem>
                <SelectItem value="transferencia">Transferencia</SelectItem>
                <SelectItem value="cheque">Cheque</SelectItem>
              </SelectContent>
            </Select>
          </section>
        </div>
      </div>

      {/* Delete AlertDialog */}
      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar esta cotización?</AlertDialogTitle>
            <AlertDialogDescription>Esta acción no se puede deshacer.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-red-600 hover:bg-red-700 font-bold">
              Eliminar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Print Modal — disponible tanto en list como en form view */}
      {printQuote && (
        <QuotePrintModal
          quote={printQuote}
          onPrint={() => printQuoteWindow(printQuote)}
          onClose={() => setPrintQuote(null)}
          onDownload={() => handleDownloadClick(printQuote.id)}
          downloading={downloadingId === printQuote.id}
        />
      )}

      {/* Convert AlertDialog */}
      <AlertDialog open={convertOpen} onOpenChange={setConvertOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Convertir a Factura</AlertDialogTitle>
            <AlertDialogDescription>
              Se creará una nueva factura con los datos de esta cotización y la cotización quedará marcada como "Convertida".
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleConvert} className="bg-purple-600 hover:bg-purple-700 font-bold">
              Convertir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {renderProductCatalogModal()}
    </div>
  );
}
