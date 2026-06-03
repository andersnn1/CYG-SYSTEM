import { Switch, Route, Router as WouterRouter } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ThemeProvider } from "next-themes";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Layout } from "@/components/layout";
import NotFound from "@/pages/not-found";

import Dashboard from "@/pages/dashboard";
import Inventario from "@/pages/inventario";
import Perfumeria from "@/pages/perfumeria";
import Sublimacion from "@/pages/sublimacion";
import Clientes from "@/pages/clientes";
import Ventas from "@/pages/ventas";
import Reportes from "@/pages/reportes";
import Facturas from "@/pages/facturas";
import Gastos from "@/pages/gastos";
import Cotizaciones from "@/pages/cotizaciones";
import Combos from "@/pages/combos";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: false,
      refetchOnWindowFocus: false,
    },
  },
});

function Router() {
  return (
    <Layout>
      <Switch>
        <Route path="/" component={Dashboard} />
        <Route path="/inventario" component={Inventario} />
        <Route path="/perfumeria" component={Perfumeria} />
        <Route path="/sublimacion" component={Sublimacion} />
        <Route path="/clientes" component={Clientes} />
        <Route path="/ventas" component={Ventas} />
        <Route path="/reportes" component={Reportes} />
        <Route path="/facturas" component={Facturas} />
        <Route path="/gastos" component={Gastos} />
        <Route path="/cotizaciones" component={Cotizaciones} />
        <Route path="/combos" component={Combos} />
        <Route component={NotFound} />
      </Switch>
    </Layout>
  );
}

function App() {
  return (
    <ThemeProvider attribute="class" defaultTheme="light" enableSystem={false}>
      <QueryClientProvider client={queryClient}>
        <TooltipProvider>
          <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
            <Router />
          </WouterRouter>
          <Toaster />
        </TooltipProvider>
      </QueryClientProvider>
    </ThemeProvider>
  );
}

export default App;
