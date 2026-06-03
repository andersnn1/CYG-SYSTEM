import { Router, type IRouter } from "express";
import { eq, desc } from "drizzle-orm";
import { db, combosTable, comboItemsTable, perfumeryTable, sublimationTable } from "@workspace/db";
import { z } from "zod";

const router: IRouter = Router();

function mapCombo(
  combo: typeof combosTable.$inferSelect,
  items?: (typeof comboItemsTable.$inferSelect & { costPrice?: number })[],
  totalCost: number = 0
) {
  return {
    ...combo,
    fixedPrice: combo.fixedPrice !== null ? Number(combo.fixedPrice) : null,
    totalCost,
    createdAt: combo.createdAt.toISOString(),
    updatedAt: combo.updatedAt.toISOString(),
    items: items?.map(i => ({
      ...i,
      unitPrice: Number(i.unitPrice),
      costPrice: i.costPrice ? Number(i.costPrice) : 0,
    })),
  };
}

const ComboItemBody = z.object({
  productId:   z.number().int().positive(),
  productType: z.enum(["perfumeria", "sublimacion"]),
  productName: z.string().min(1),
  quantity:    z.number().int().positive(),
  unitPrice:   z.number().min(0),
});

const CreateComboBody = z.object({
  code:        z.string().min(1),
  name:        z.string().min(1),
  description: z.string().optional(),
  fixedPrice:  z.number().min(0).optional(),
  active:      z.boolean().optional(),
  items:       z.array(ComboItemBody).min(1),
});

const UpdateComboBody = z.object({
  code:        z.string().min(1).optional(),
  name:        z.string().min(1).optional(),
  description: z.string().optional().nullable(),
  fixedPrice:  z.number().min(0).optional().nullable(),
  active:      z.boolean().optional(),
  items:       z.array(ComboItemBody).optional(),
});

// GET /combos
router.get("/combos", async (req, res): Promise<void> => {
  const combos = await db.select().from(combosTable).orderBy(desc(combosTable.createdAt));
  const withItems = await Promise.all(
    combos.map(async combo => {
      const items = await db.select().from(comboItemsTable).where(eq(comboItemsTable.comboId, combo.id));
      let totalCost = 0;
      const itemsWithCost = await Promise.all(items.map(async item => {
        let costPrice = 0;
        if (item.productType === "perfumeria") {
          const [p] = await db.select().from(perfumeryTable).where(eq(perfumeryTable.id, item.productId));
          costPrice = Number(p?.costPrice ?? 0);
        } else {
          const [s] = await db.select().from(sublimationTable).where(eq(sublimationTable.id, item.productId));
          costPrice = Number(s?.costPrice ?? 0);
        }
        totalCost += costPrice * item.quantity;
        return { ...item, costPrice };
      }));
      return mapCombo(combo, itemsWithCost, totalCost);
    }),
  );
  res.json(withItems);
});

// GET /combos/:code  — buscar por código (para expansión en facturas)
router.get("/combos/:code", async (req, res): Promise<void> => {
  const { code } = req.params;
  const [combo] = await db.select().from(combosTable).where(eq(combosTable.code, code));
  if (!combo) { res.status(404).json({ error: "Combo no encontrado" }); return; }
  if (!combo.active) { res.status(404).json({ error: "Combo inactivo" }); return; }
  
  const items = await db.select().from(comboItemsTable).where(eq(comboItemsTable.comboId, combo.id));
  let totalCost = 0;
  const itemsWithCost = await Promise.all(items.map(async item => {
    let costPrice = 0;
    if (item.productType === "perfumeria") {
      const [p] = await db.select().from(perfumeryTable).where(eq(perfumeryTable.id, item.productId));
      costPrice = Number(p?.costPrice ?? 0);
    } else {
      const [s] = await db.select().from(sublimationTable).where(eq(sublimationTable.id, item.productId));
      costPrice = Number(s?.costPrice ?? 0);
    }
    totalCost += costPrice * item.quantity;
    return { ...item, costPrice };
  }));
  
  res.json(mapCombo(combo, itemsWithCost, totalCost));
});

// POST /combos
router.post("/combos", async (req, res): Promise<void> => {
  const parsed = CreateComboBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }

  const { items, ...comboData } = parsed.data;

  const [combo] = await db.insert(combosTable).values({
    code:        comboData.code,
    name:        comboData.name,
    description: comboData.description ?? null,
    fixedPrice:  comboData.fixedPrice != null ? String(comboData.fixedPrice) : null,
    active:      comboData.active ?? true,
  }).returning();

  const insertedItems = await db.insert(comboItemsTable).values(
    items.map(item => ({
      comboId:     combo.id,
      productId:   item.productId,
      productType: item.productType,
      productName: item.productName,
      quantity:    item.quantity,
      unitPrice:   String(item.unitPrice),
    })),
  ).returning();

  res.status(201).json(mapCombo(combo, insertedItems));
});

// PUT /combos/:id
router.put("/combos/:id", async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }

  const parsed = UpdateComboBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }

  const [existing] = await db.select().from(combosTable).where(eq(combosTable.id, id));
  if (!existing) { res.status(404).json({ error: "Combo no encontrado" }); return; }

  const { items, ...updateData } = parsed.data;

  const [updated] = await db.update(combosTable).set({
    ...(updateData.code        !== undefined && { code:        updateData.code }),
    ...(updateData.name        !== undefined && { name:        updateData.name }),
    ...(updateData.description !== undefined && { description: updateData.description ?? null }),
    ...(updateData.fixedPrice  !== undefined && { fixedPrice:  updateData.fixedPrice != null ? String(updateData.fixedPrice) : null }),
    ...(updateData.active      !== undefined && { active:      updateData.active }),
  }).where(eq(combosTable.id, id)).returning();

  if (items) {
    await db.delete(comboItemsTable).where(eq(comboItemsTable.comboId, id));
    await db.insert(comboItemsTable).values(
      items.map(item => ({
        comboId:     id,
        productId:   item.productId,
        productType: item.productType,
        productName: item.productName,
        quantity:    item.quantity,
        unitPrice:   String(item.unitPrice),
      })),
    );
  }

  const updatedItems = await db.select().from(comboItemsTable).where(eq(comboItemsTable.comboId, id));
  res.json(mapCombo(updated, updatedItems));
});

// DELETE /combos/:id
router.delete("/combos/:id", async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }

  await db.delete(comboItemsTable).where(eq(comboItemsTable.comboId, id));
  const [combo] = await db.delete(combosTable).where(eq(combosTable.id, id)).returning();
  if (!combo) { res.status(404).json({ error: "Combo no encontrado" }); return; }

  res.sendStatus(204);
});

export default router;
