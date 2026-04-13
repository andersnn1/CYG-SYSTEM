import { Router, type IRouter } from "express";
import healthRouter from "./health";
import dashboardRouter from "./dashboard";
import perfumeryRouter from "./perfumery";
import sublimationRouter from "./sublimation";
import clientsRouter from "./clients";
import salesRouter from "./sales";
import reportsRouter from "./reports";
import invoicesRouter from "./invoices";
import expensesRouter from "./expenses";
import backupRouter from "./backup";
import quotesRouter from "./quotes";
import combosRouter from "./combos";

const router: IRouter = Router();

router.use(healthRouter);
router.use(dashboardRouter);
router.use(perfumeryRouter);
router.use(sublimationRouter);
router.use(clientsRouter);
router.use(salesRouter);
router.use(reportsRouter);
router.use(invoicesRouter);
router.use(expensesRouter);
router.use(backupRouter);
router.use(quotesRouter);
router.use(combosRouter);

export default router;
