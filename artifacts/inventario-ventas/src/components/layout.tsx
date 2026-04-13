import { Link, useLocation } from "wouter";
import {
  LayoutDashboard,
  Droplets,
  Printer,
  Users,
  ShoppingCart,
  FileText,
  Receipt,
  Moon,
  Sun,
  Wallet,
  ClipboardList,
  Package
} from "lucide-react";
import { useTheme } from "next-themes";
import { Button } from "@/components/ui/button";

const NAV_ITEMS = [
  { href: "/", label: "Dashboard", icon: LayoutDashboard },
  { href: "/perfumeria", label: "Perfumería", icon: Droplets },
  { href: "/sublimacion", label: "Sublimación", icon: Printer },
  { href: "/clientes", label: "Clientes", icon: Users },
  { href: "/ventas", label: "Ventas", icon: ShoppingCart },
  { href: "/reportes", label: "Reportes", icon: FileText },
  { href: "/facturas", label: "Facturas", icon: Receipt },
  { href: "/cotizaciones", label: "Cotizaciones", icon: ClipboardList },
  { href: "/gastos", label: "Gastos", icon: Wallet },
  { href: "/combos", label: "Combos", icon: Package },
];

export function Layout({ children }: { children: React.ReactNode }) {
  const [location] = useLocation();
  const { theme, setTheme } = useTheme();

  return (
    <div className="min-h-screen bg-background flex flex-col md:flex-row">
      <aside className="w-full md:w-64 bg-sidebar border-b md:border-r border-sidebar-border print-hide flex-shrink-0 flex flex-col">
        <div className="p-6 flex items-center justify-between md:justify-center border-b border-sidebar-border">
          <h1 className="text-xl font-bold text-sidebar-primary tracking-tight">InventoSys</h1>
          <Button 
            variant="ghost" 
            size="icon" 
            className="md:hidden"
            onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
          >
            {theme === 'dark' ? <Sun className="h-5 w-5" /> : <Moon className="h-5 w-5" />}
          </Button>
        </div>
        <nav className="flex-1 p-4 space-y-2 overflow-y-auto flex flex-row md:flex-col gap-2 md:gap-0 overflow-x-auto md:overflow-visible">
          {NAV_ITEMS.map((item) => {
            const isActive = location === item.href || (item.href !== "/" && location.startsWith(item.href));
            return (
              <Link key={item.href} href={item.href} className="flex-shrink-0">
                <div
                  className={`flex items-center gap-3 px-4 py-3 rounded-xl transition-colors cursor-pointer ${
                    isActive 
                      ? "bg-sidebar-primary text-sidebar-primary-foreground font-medium" 
                      : "text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
                  }`}
                >
                  <item.icon className="h-5 w-5" />
                  <span className="hidden md:inline">{item.label}</span>
                </div>
              </Link>
            );
          })}
        </nav>
        <div className="p-4 border-t border-sidebar-border hidden md:block">
          <Button 
            variant="outline" 
            className="w-full justify-start gap-3"
            onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
          >
            {theme === 'dark' ? <Sun className="h-5 w-5" /> : <Moon className="h-5 w-5" />}
            {theme === 'dark' ? 'Modo Claro' : 'Modo Oscuro'}
          </Button>
        </div>
      </aside>
      <main className="flex-1 overflow-y-auto print-content">
        <div className="p-4 md:p-8 max-w-7xl mx-auto">
          {children}
        </div>
      </main>
    </div>
  );
}
