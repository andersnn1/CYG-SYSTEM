import { useState } from "react";
import { useQueryClient, useQuery } from "@tanstack/react-query";
import {
  useListClients,
  useCreateClient,
  useUpdateClient,
  useDeleteClient,
  getListClientsQueryKey,
} from "@workspace/api-client-react";
import type { Client, CreateClientBody, UpdateClientBody } from "@workspace/api-client-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Plus, Pencil, Trash2, Users, MapPin, Phone, Mail, X, Clock, CheckCircle, XCircle, FileText } from "lucide-react";
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
  return res.json();
}

const HONDURAS_DEPARTMENTS = [
  "Atlántida", "Choluteca", "Colón", "Comayagua", "Copán", "Cortés",
  "El Paraíso", "Francisco Morazán", "Gracias a Dios", "Intibucá",
  "Islas de la Bahía", "La Paz", "Lempira", "Ocotepeque", "Olancho",
  "Santa Bárbara", "Valle", "Yoro"
];

type FormData = {
  name: string;
  phone: string;
  email: string;
  city: string;
  department: string;
  address: string;
};

const defaultForm: FormData = {
  name: "",
  phone: "",
  email: "",
  city: "",
  department: "",
  address: "",
};

interface Invoice {
  id: number;
  invoiceNumber: string;
  status: "pendiente" | "pagada" | "cancelada";
  total: number;
  issueDate: string;
  clientName: string;
}

const STATUS_CONFIG = {
  pendiente: { label: "Pendiente", icon: Clock,       classes: "bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-900/20 dark:text-amber-300" },
  pagada:    { label: "Pagada",    icon: CheckCircle, classes: "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-900/20 dark:text-emerald-300" },
  cancelada: { label: "Cancelada", icon: XCircle,     classes: "bg-red-50 text-red-700 border-red-200 dark:bg-red-900/20 dark:text-red-300" },
} as const;

export default function Clientes() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { data: clients, isLoading } = useListClients();
  const createMutation = useCreateClient();
  const updateMutation = useUpdateClient();
  const deleteMutation = useDeleteClient();

  const [formOpen, setFormOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [editClient, setEditClient] = useState<Client | null>(null);
  const [deleteId, setDeleteId] = useState<number | null>(null);
  const [form, setForm] = useState<FormData>(defaultForm);
  const [selectedClient, setSelectedClient] = useState<Client | null>(null);

  const invalidate = () => queryClient.invalidateQueries({ queryKey: getListClientsQueryKey() });

  const { data: clientInvoices, isLoading: isLoadingInvoices } = useQuery<Invoice[]>({
    queryKey: ["client-invoices", selectedClient?.id],
    queryFn: () => apiFetch(`/invoices?clientId=${selectedClient!.id}`),
    enabled: !!selectedClient,
  });

  const openCreate = () => {
    setEditClient(null);
    setForm(defaultForm);
    setFormOpen(true);
  };

  const openEdit = (client: Client) => {
    setEditClient(client);
    setForm({
      name: client.name,
      phone: client.phone ?? "",
      email: client.email ?? "",
      city: client.city,
      department: client.department,
      address: client.address ?? "",
    });
    setFormOpen(true);
  };

  const openDelete = (id: number) => {
    setDeleteId(id);
    setDeleteOpen(true);
  };

  const handleSubmit = () => {
    const body = {
      name: form.name,
      phone: form.phone || null,
      email: form.email || null,
      city: form.city,
      department: form.department,
      address: form.address || null,
    };

    if (editClient) {
      updateMutation.mutate(
        { id: editClient.id, data: body as UpdateClientBody },
        {
          onSuccess: () => { invalidate(); setFormOpen(false); toast({ title: "Cliente actualizado" }); },
          onError: () => toast({ title: "Error al actualizar", variant: "destructive" }),
        }
      );
    } else {
      createMutation.mutate(
        { data: body as CreateClientBody },
        {
          onSuccess: () => { invalidate(); setFormOpen(false); toast({ title: "Cliente registrado" }); },
          onError: () => toast({ title: "Error al registrar", variant: "destructive" }),
        }
      );
    }
  };

  const handleDelete = () => {
    if (!deleteId) return;
    deleteMutation.mutate(
      { id: deleteId },
      {
        onSuccess: () => {
          invalidate();
          setDeleteOpen(false);
          if (selectedClient?.id === deleteId) setSelectedClient(null);
          toast({ title: "Cliente eliminado" });
        },
        onError: () => toast({ title: "Error al eliminar", variant: "destructive" }),
      }
    );
  };

  const totalComprado = (clientInvoices ?? [])
    .filter(inv => inv.status !== "cancelada")
    .reduce((sum, inv) => sum + inv.total, 0);

  const facturasPendientes = (clientInvoices ?? [])
    .filter(inv => inv.status === "pendiente").length;

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight flex items-center gap-3">
            <Users className="h-8 w-8 text-primary" />
            Clientes
          </h1>
          <p className="text-muted-foreground mt-1">Gestion de clientes en Honduras</p>
        </div>
        <Button onClick={openCreate} className="gap-2">
          <Plus className="h-4 w-4" /> Nuevo Cliente
        </Button>
      </div>

      {isLoading ? (
        <div className="space-y-3">{[1, 2, 3].map(i => <Skeleton key={i} className="h-16 w-full" />)}</div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {clients && clients.length > 0 ? clients.map(client => (
            <Card
              key={client.id}
              className={`hover:shadow-md transition-shadow cursor-pointer ${selectedClient?.id === client.id ? "ring-2 ring-primary" : ""}`}
              onClick={() => setSelectedClient(selectedClient?.id === client.id ? null : client)}
            >
              <CardContent className="p-4">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <h3 className="font-semibold text-base truncate">{client.name}</h3>
                    <div className="mt-2 space-y-1">
                      <div className="flex items-center gap-2 text-sm text-muted-foreground">
                        <MapPin className="h-3.5 w-3.5 flex-shrink-0" />
                        <span>{client.city}, {client.department}</span>
                      </div>
                      {client.phone && (
                        <div className="flex items-center gap-2 text-sm text-muted-foreground">
                          <Phone className="h-3.5 w-3.5 flex-shrink-0" />
                          <span>{client.phone}</span>
                        </div>
                      )}
                      {client.email && (
                        <div className="flex items-center gap-2 text-sm text-muted-foreground">
                          <Mail className="h-3.5 w-3.5 flex-shrink-0" />
                          <span className="truncate">{client.email}</span>
                        </div>
                      )}
                    </div>
                  </div>
                  <div className="flex gap-1 flex-shrink-0" onClick={e => e.stopPropagation()}>
                    <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openEdit(client)}>
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive hover:text-destructive" onClick={() => openDelete(client.id)}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          )) : (
            <div className="col-span-full text-center py-16 text-muted-foreground">
              No hay clientes registrados. Agrega el primero.
            </div>
          )}
        </div>
      )}

      {/* Client History Panel */}
      {selectedClient && (
        <div
          style={{
            position: "fixed",
            top: 0,
            right: 0,
            bottom: 0,
            width: "min(420px, 100vw)",
            zIndex: 50,
            display: "flex",
            flexDirection: "column",
          }}
          className="bg-card border-l border-border shadow-2xl"
        >
          {/* Panel Header */}
          <div className="flex items-start justify-between p-5 border-b border-border">
            <div className="flex-1 min-w-0">
              <h2 className="text-lg font-bold text-foreground truncate">{selectedClient.name}</h2>
              <div className="mt-1 space-y-0.5">
                <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
                  <MapPin className="h-3.5 w-3.5 flex-shrink-0" />
                  <span>{selectedClient.city}, {selectedClient.department}</span>
                </div>
                {selectedClient.phone && (
                  <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
                    <Phone className="h-3.5 w-3.5 flex-shrink-0" />
                    <span>{selectedClient.phone}</span>
                  </div>
                )}
                {selectedClient.email && (
                  <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
                    <Mail className="h-3.5 w-3.5 flex-shrink-0" />
                    <span className="truncate">{selectedClient.email}</span>
                  </div>
                )}
              </div>
            </div>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 text-muted-foreground hover:text-foreground flex-shrink-0 ml-2"
              onClick={() => setSelectedClient(null)}
            >
              <X className="h-4 w-4" />
            </Button>
          </div>

          {/* Summary */}
          {!isLoadingInvoices && clientInvoices && (
            <div className="grid grid-cols-2 gap-3 p-4 border-b border-border">
              <div className="rounded-lg bg-muted p-3 text-center">
                <div className="text-xs text-muted-foreground mb-1">Total comprado</div>
                <div className="font-bold text-sm text-foreground">{formatCurrency(totalComprado)}</div>
              </div>
              <div className="rounded-lg bg-muted p-3 text-center">
                <div className="text-xs text-muted-foreground mb-1">Facturas pendientes</div>
                <div className={`font-bold text-sm ${facturasPendientes > 0 ? "text-amber-600 dark:text-amber-400" : "text-foreground"}`}>
                  {facturasPendientes}
                </div>
              </div>
            </div>
          )}

          {/* Invoices List */}
          <div className="flex-1 overflow-y-auto p-4 space-y-2">
            <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">
              Historial de Facturas
            </h3>

            {isLoadingInvoices ? (
              <div className="space-y-2">
                {[1, 2, 3].map(i => <Skeleton key={i} className="h-14 w-full" />)}
              </div>
            ) : (clientInvoices ?? []).length === 0 ? (
              <div className="text-center py-10 text-muted-foreground">
                <FileText className="h-8 w-8 mx-auto mb-2 opacity-50" />
                <p className="text-sm">Sin facturas registradas</p>
              </div>
            ) : (
              (clientInvoices ?? []).map(inv => {
                const cfg = STATUS_CONFIG[inv.status];
                return (
                  <div key={inv.id} className="flex items-center justify-between p-3 rounded-lg border border-border bg-background hover:bg-muted/50 transition-colors">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-mono font-semibold text-sm text-foreground">{inv.invoiceNumber}</span>
                        <span className={`text-xs font-medium px-1.5 py-0.5 rounded border ${cfg.classes}`}>
                          {cfg.label}
                        </span>
                      </div>
                      <div className="text-xs text-muted-foreground mt-0.5">{inv.issueDate}</div>
                    </div>
                    <div className="font-bold text-sm text-foreground ml-2 flex-shrink-0">
                      {formatCurrency(inv.total)}
                    </div>
                  </div>
                );
              })
            )}
          </div>

          {/* Panel Footer */}
          <div className="p-4 border-t border-border">
            <Button
              variant="outline"
              className="w-full"
              onClick={() => setSelectedClient(null)}
            >
              Cerrar
            </Button>
          </div>
        </div>
      )}

      <Dialog open={formOpen} onOpenChange={setFormOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{editClient ? "Editar Cliente" : "Nuevo Cliente"}</DialogTitle>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-4">
            <div className="col-span-2 space-y-1">
              <Label>Nombre completo</Label>
              <Input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="Juan Perez" />
            </div>
            <div className="space-y-1">
              <Label>Telefono</Label>
              <Input value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })} placeholder="9999-9999" />
            </div>
            <div className="space-y-1">
              <Label>Correo electronico</Label>
              <Input type="email" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} placeholder="correo@email.com" />
            </div>
            <div className="space-y-1">
              <Label>Ciudad</Label>
              <Input value={form.city} onChange={e => setForm({ ...form, city: e.target.value })} placeholder="Tegucigalpa" />
            </div>
            <div className="space-y-1">
              <Label>Departamento</Label>
              <Select value={form.department} onValueChange={(v) => setForm({ ...form, department: v })}>
                <SelectTrigger><SelectValue placeholder="Seleccionar..." /></SelectTrigger>
                <SelectContent>
                  {HONDURAS_DEPARTMENTS.map(dep => (
                    <SelectItem key={dep} value={dep}>{dep}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="col-span-2 space-y-1">
              <Label>Direccion (opcional)</Label>
              <Input value={form.address} onChange={e => setForm({ ...form, address: e.target.value })} placeholder="Col. Kennedy, Bloque A..." />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setFormOpen(false)}>Cancelar</Button>
            <Button onClick={handleSubmit} disabled={createMutation.isPending || updateMutation.isPending}>
              {editClient ? "Guardar Cambios" : "Registrar Cliente"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Eliminar Cliente</AlertDialogTitle>
            <AlertDialogDescription>Esta accion no se puede deshacer.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">Eliminar</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
