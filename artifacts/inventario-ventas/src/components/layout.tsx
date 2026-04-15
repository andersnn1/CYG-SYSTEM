import { useState } from "react";
import { Link, useLocation } from "wouter";
import {
  LayoutDashboard,
  Archive,
  Users,
  ShoppingCart,
  FileText,
  Receipt,
  Moon,
  Sun,
  Wallet,
  ClipboardList,
  Package,
  MoreHorizontal,
  X,
} from "lucide-react";
import { useTheme } from "next-themes";
import { Button } from "@/components/ui/button";

const NAV_ITEMS = [
  { href: "/", label: "Dashboard", icon: LayoutDashboard },
  { href: "/cotizaciones", label: "Cotizaciones", icon: ClipboardList },
  { href: "/ventas", label: "Ventas", icon: ShoppingCart },
  { href: "/facturas", label: "Facturas", icon: Receipt },
  { href: "/clientes", label: "Clientes", icon: Users },
  { href: "/inventario", label: "Inventario", icon: Archive },
  { href: "/reportes", label: "Reportes", icon: FileText },
  { href: "/gastos", label: "Gastos", icon: Wallet },
  { href: "/combos", label: "Combos", icon: Package },
];

const BOTTOM_PRIMARY_HREFS = ["/", "/cotizaciones", "/ventas", "/facturas", "/clientes"];
const primaryNav = NAV_ITEMS.filter(i => BOTTOM_PRIMARY_HREFS.includes(i.href));
const moreNav = NAV_ITEMS.filter(i => !BOTTOM_PRIMARY_HREFS.includes(i.href));

export function Layout({ children }: { children: React.ReactNode }) {
  const [location] = useLocation();
  const { theme, setTheme } = useTheme();
  const [moreOpen, setMoreOpen] = useState(false);

  const isActive = (href: string) =>
    href === "/" ? location === href : location === href || location.startsWith(href);

  const isMoreActive = moreNav.some(i => isActive(i.href));

  return (
    <div className="min-h-screen bg-background flex flex-col md:flex-row">

      {/* ── Desktop Sidebar ──────────────────────────────────────── */}
      <aside className="hidden md:flex w-64 bg-sidebar border-r border-sidebar-border print-hide flex-shrink-0 flex-col">
        <div className="p-6 flex items-center justify-center border-b border-sidebar-border">
          <h1 className="text-xl font-bold text-sidebar-primary tracking-tight">InventoSys</h1>
        </div>
        <nav className="flex-1 p-4 space-y-1 overflow-y-auto">
          {NAV_ITEMS.map((item) => (
            <Link key={item.href} href={item.href}>
              <div
                className={`flex items-center gap-3 px-4 py-3 rounded-xl transition-colors cursor-pointer ${
                  isActive(item.href)
                    ? "bg-sidebar-primary text-sidebar-primary-foreground font-medium"
                    : "text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
                }`}
              >
                <item.icon className="h-5 w-5 flex-shrink-0" />
                <span>{item.label}</span>
              </div>
            </Link>
          ))}
        </nav>
        <div className="p-4 border-t border-sidebar-border">
          <Button
            variant="outline"
            className="w-full justify-start gap-3"
            onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
          >
            {theme === "dark" ? <Sun className="h-5 w-5" /> : <Moon className="h-5 w-5" />}
            {theme === "dark" ? "Modo Claro" : "Modo Oscuro"}
          </Button>
        </div>
      </aside>

      {/* ── Mobile Top Header ────────────────────────────────────── */}
      <header className="md:hidden sticky top-0 z-40 bg-sidebar border-b border-sidebar-border print-hide">
        <div className="flex items-center justify-between px-4 h-14">
          <h1 className="text-lg font-bold text-sidebar-primary tracking-tight">C&amp;G Electronics</h1>
          <Button
            variant="ghost"
            size="icon"
            className="h-10 w-10"
            onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
          >
            {theme === "dark" ? <Sun className="h-5 w-5" /> : <Moon className="h-5 w-5" />}
          </Button>
        </div>
      </header>

      {/* ── Main Content ─────────────────────────────────────────── */}
      <main className="flex-1 overflow-y-auto print-content">
        <div className="p-4 md:p-8 max-w-7xl mx-auto pb-24 md:pb-8">
          {children}
        </div>
      </main>

      {/* ── Mobile Bottom Navigation ─────────────────────────────── */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 z-40 bg-sidebar border-t border-sidebar-border print-hide safe-area-bottom">
        <div className="flex items-stretch h-16">
          {primaryNav.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="flex-1"
              onClick={() => setMoreOpen(false)}
            >
              <div
                className={`flex flex-col items-center justify-center h-full gap-1 transition-colors ${
                  isActive(item.href)
                    ? "text-sidebar-primary bg-sidebar-primary/10 border-t-2 border-sidebar-primary"
                    : "text-sidebar-foreground/70 hover:text-sidebar-foreground hover:bg-sidebar-accent"
                }`}
              >
                <item.icon className="h-5 w-5" />
                <span className="text-[10px] font-medium leading-none">{item.label}</span>
              </div>
            </Link>
          ))}

          <button
            className={`flex-1 flex flex-col items-center justify-center h-full gap-1 transition-colors ${
              isMoreActive || moreOpen
                ? "text-sidebar-primary bg-sidebar-primary/10 border-t-2 border-sidebar-primary"
                : "text-sidebar-foreground/70 hover:text-sidebar-foreground hover:bg-sidebar-accent"
            }`}
            onClick={() => setMoreOpen(v => !v)}
          >
            <MoreHorizontal className="h-5 w-5" />
            <span className="text-[10px] font-medium leading-none">Más</span>
          </button>
        </div>
      </nav>

      {/* ── Mobile "Más" Drawer ──────────────────────────────────── */}
      {moreOpen && (
        <>
          <div
            className="md:hidden fixed inset-0 z-30 bg-black/50"
            onClick={() => setMoreOpen(false)}
          />
          <div className="md:hidden fixed bottom-16 left-0 right-0 z-40 bg-sidebar border-t border-sidebar-border rounded-t-2xl shadow-2xl">
            <div className="p-5">
              <div className="flex items-center justify-between mb-4">
                <span className="text-sm font-semibold text-sidebar-foreground">Más secciones</span>
                <button
                  onClick={() => setMoreOpen(false)}
                  className="text-sidebar-foreground/60 hover:text-sidebar-foreground p-1"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
              <div className="grid grid-cols-5 gap-2">
                {moreNav.map((item) => (
                  <Link key={item.href} href={item.href} onClick={() => setMoreOpen(false)}>
                    <div
                      className={`flex flex-col items-center justify-center p-3 rounded-xl gap-2 transition-colors ${
                        isActive(item.href)
                          ? "bg-sidebar-primary text-sidebar-primary-foreground"
                          : "text-sidebar-foreground hover:bg-sidebar-accent"
                      }`}
                    >
                      <item.icon className="h-5 w-5" />
                      <span className="text-[10px] font-medium leading-none text-center">{item.label}</span>
                    </div>
                  </Link>
                ))}
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
