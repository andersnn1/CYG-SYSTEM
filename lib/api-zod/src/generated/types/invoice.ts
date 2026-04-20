import { z } from "zod/v4";

export const InvoiceItemSchema = z.object({
  id: z.number(),
  invoiceId: z.number(),
  description: z.string(),
  quantity: z.number(),
  unitPrice: z.number(),
  total: z.number(),
});

export const InvoiceSchema = z.object({
  id: z.number(),
  invoiceNumber: z.string(),
  clientId: z.number().nullable().optional(),
  clientName: z.string(),
  clientPhone: z.string().nullable().optional(),
  clientEmail: z.string().nullable().optional(),
  clientAddress: z.string().nullable().optional(),
  clientCity: z.string().nullable().optional(),
  clientDepartment: z.string().nullable().optional(),
  status: z.enum(["pendiente", "pagada", "cancelada"]),
  subtotal: z.number(),
  discount: z.number(),
  tax: z.number(),
  total: z.number(),
  notes: z.string().nullable().optional(),
  clientRtn: z.string().nullable().optional(),
  paymentMethod: z.string().nullable().optional(),
  transferReference: z.string().nullable().optional(),
  issueDate: z.string(),
  dueDate: z.string().nullable().optional(),
  numeroGuia: z.string().nullable().optional(),
  transportista: z.string().nullable().optional(),
  fotoGuiaPath: z.string().nullable().optional(),
  estadoEntrega: z.string(),
  items: z.array(InvoiceItemSchema).optional(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export const CreateInvoiceItemBody = z.object({
  description: z.string().min(1),
  quantity: z.number().int().positive(),
  unitPrice: z.number().positive(),
  productId: z.number().int().positive().optional(),
  productType: z.enum(["perfumeria", "sublimacion", "combo"]).optional(),
});

export const CreateInvoiceBody = z.object({
  clientId: z.number().int().positive().optional(),
  clientName: z.string().min(1),
  clientPhone: z.string().optional(),
  clientEmail: z.string().optional(),
  clientAddress: z.string().optional(),
  clientCity: z.string().optional(),
  clientDepartment: z.string().optional(),
  discount: z.number().min(0).default(0),
  tax: z.number().min(0).default(0),
  notes: z.string().optional(),
  clientRtn: z.string().max(14).optional(),
  paymentMethod: z.enum(["efectivo", "tarjeta", "transferencia", "cheque"]).default("efectivo"),
  transferReference: z.string().optional(),
  issueDate: z.string(),
  dueDate: z.string().optional(),
  numeroGuia: z.string().optional(),
  transportista: z.string().optional(),
  fotoGuiaPath: z.string().optional(),
  estadoEntrega: z.string().default("Pendiente"),
  // ── Cálculo de Utilidad Real (Panel Interno) ─────────────────────────────
  baseCost: z.number().min(0).optional(),
  internalExpenses: z.number().min(0).default(0),
  internalExpensesNote: z.string().optional(),
  taxes: z.number().min(0).default(0),
  partnerPayout: z.number().optional(),
  ownerPayout: z.number().optional(),
  items: z.array(CreateInvoiceItemBody).min(1),
});

export const UpdateInvoiceBody = z.object({
  status: z.enum(["pendiente", "pagada", "cancelada"]).optional(),
  clientName: z.string().min(1).optional(),
  clientPhone: z.string().optional(),
  clientEmail: z.string().optional(),
  clientAddress: z.string().optional(),
  clientCity: z.string().optional(),
  clientDepartment: z.string().optional(),
  discount: z.number().min(0).optional(),
  tax: z.number().min(0).optional(),
  notes: z.string().optional(),
  clientRtn: z.string().max(14).optional(),
  paymentMethod: z.enum(["efectivo", "tarjeta", "transferencia", "cheque"]).optional(),
  transferReference: z.string().optional(),
  issueDate: z.string().optional(),
  dueDate: z.string().optional(),
  numeroGuia: z.string().optional(),
  transportista: z.string().optional(),
  fotoGuiaPath: z.string().optional(),
  estadoEntrega: z.string().optional(),
  // ── Cálculo de Utilidad Real (Panel Interno) ─────────────────────────────
  baseCost: z.number().min(0).optional(),
  internalExpenses: z.number().min(0).optional(),
  internalExpensesNote: z.string().optional(),
  taxes: z.number().min(0).optional(),
  partnerPayout: z.number().optional(),
  ownerPayout: z.number().optional(),
  items: z.array(CreateInvoiceItemBody).min(1).optional(),
});

export const GetInvoiceParams = z.object({ id: z.coerce.number().int().positive() });
export const DeleteInvoiceParams = z.object({ id: z.coerce.number().int().positive() });

export type Invoice = z.infer<typeof InvoiceSchema>;
export type InvoiceItem = z.infer<typeof InvoiceItemSchema>;
export type CreateInvoiceBody = z.infer<typeof CreateInvoiceBody>;
export type UpdateInvoiceBody = z.infer<typeof UpdateInvoiceBody>;
