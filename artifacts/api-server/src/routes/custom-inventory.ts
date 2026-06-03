import { Router, type IRouter } from "express";
import { eq, asc } from "drizzle-orm";
import { db, customInventoryTable, inventoryCategoriesTable } from "@workspace/db";
import { z } from "zod";

const router: IRouter = Router();

// ── Schemas ────────────────────────────────────────────────────────────────────

const CreateCategoryBody = z.object({
  name: z.string().min(1),
  color: z.string().optional().default("slate"),
  description: z.string().optional().nullable(),
});

const UpdateCategoryBody = CreateCategoryBody.partial();

const CreateItemBody = z.object({
  categoryId: z.number().int().positive(),
  name: z.string().min(1),
  subCategory: z.string().optional().nullable(),
  brand: z.string().optional().nullable(),
  stock: z.number().int().optional().nullable(),
  costPrice: z.number().min(0),
  salePrice: z.number().min(0),
  description: z.string().optional().nullable(),
  code: z.string().optional().nullable(),
});

const UpdateItemBody = CreateItemBody.partial();
const IdParam = z.object({ id: z.coerce.number().int().positive() });

// ── Helpers ────────────────────────────────────────────────────────────────────

function mapItem(item: typeof customInventoryTable.$inferSelect) {
  return {
    ...item,
    costPrice: Number(item.costPrice),
    salePrice: Number(item.salePrice),
    createdAt: item.createdAt.toISOString(),
    updatedAt: item.updatedAt.toISOString(),
  };
}

// ══════════════════════════════════════════════════════════════════════════════
// CATEGORÍAS
// ══════════════════════════════════════════════════════════════════════════════

// GET /inventory-categories
router.get("/inventory-categories", async (req, res): Promise<void> => {
  const rows = await db
    .select()
    .from(inventoryCategoriesTable)
    .orderBy(asc(inventoryCategoriesTable.name));
  res.json(rows);
});

// POST /inventory-categories
router.post("/inventory-categories", async (req, res): Promise<void> => {
  const parsed = CreateCategoryBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }

  const { name, color, description } = parsed.data;
  try {
    const [row] = await db
      .insert(inventoryCategoriesTable)
      .values({ name, color: color ?? "slate", description: description ?? null })
      .returning();
    res.status(201).json(row);
  } catch (e: any) {
    if (e?.code === "23505") { // unique_violation
      res.status(409).json({ error: "Ya existe una categoría con ese nombre" });
    } else {
      throw e;
    }
  }
});

// PATCH /inventory-categories/:id
router.patch("/inventory-categories/:id", async (req, res): Promise<void> => {
  const params = IdParam.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }

  const parsed = UpdateCategoryBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }

  const updateData: Record<string, unknown> = {};
  if (parsed.data.name !== undefined) updateData.name = parsed.data.name;
  if (parsed.data.color !== undefined) updateData.color = parsed.data.color;
  if (parsed.data.description !== undefined) updateData.description = parsed.data.description;

  const [row] = await db
    .update(inventoryCategoriesTable)
    .set(updateData)
    .where(eq(inventoryCategoriesTable.id, params.data.id))
    .returning();
  if (!row) { res.status(404).json({ error: "Categoría no encontrada" }); return; }
  res.json(row);
});

// DELETE /inventory-categories/:id
router.delete("/inventory-categories/:id", async (req, res): Promise<void> => {
  const params = IdParam.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }

  try {
    const [row] = await db
      .delete(inventoryCategoriesTable)
      .where(eq(inventoryCategoriesTable.id, params.data.id))
      .returning();
    if (!row) { res.status(404).json({ error: "Categoría no encontrada" }); return; }
    res.sendStatus(204);
  } catch (e: any) {
    if (e?.code === "23503") { // foreign_key_violation
      res.status(409).json({ error: "No se puede eliminar: la categoría tiene productos asociados" });
    } else {
      throw e;
    }
  }
});

// ══════════════════════════════════════════════════════════════════════════════
// PRODUCTOS
// ══════════════════════════════════════════════════════════════════════════════

// GET /custom-inventory  (todos los productos, enriquecidos con datos de categoría)
router.get("/custom-inventory", async (req, res): Promise<void> => {
  const items = await db
    .select({
      item: customInventoryTable,
      category: inventoryCategoriesTable,
    })
    .from(customInventoryTable)
    .innerJoin(inventoryCategoriesTable, eq(customInventoryTable.categoryId, inventoryCategoriesTable.id))
    .orderBy(asc(inventoryCategoriesTable.name), asc(customInventoryTable.name));

  res.json(
    items.map(({ item, category }) => ({
      ...mapItem(item),
      categoryName: category.name,
      categoryColor: category.color,
    }))
  );
});

// POST /custom-inventory
router.post("/custom-inventory", async (req, res): Promise<void> => {
  const parsed = CreateItemBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }

  const d = parsed.data;

  // Verificar que la categoría existe
  const [cat] = await db.select().from(inventoryCategoriesTable).where(eq(inventoryCategoriesTable.id, d.categoryId));
  if (!cat) { res.status(400).json({ error: "Categoría no encontrada" }); return; }

  const [item] = await db
    .insert(customInventoryTable)
    .values({
      categoryId: d.categoryId,
      name: d.name,
      subCategory: d.subCategory ?? null,
      brand: d.brand ?? null,
      stock: d.stock ?? null,
      costPrice: String(d.costPrice),
      salePrice: String(d.salePrice),
      description: d.description ?? null,
      code: d.code ?? null,
    })
    .returning();
  res.status(201).json({ ...mapItem(item), categoryName: cat.name, categoryColor: cat.color });
});

// PATCH /custom-inventory/:id
router.patch("/custom-inventory/:id", async (req, res): Promise<void> => {
  const params = IdParam.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }

  const parsed = UpdateItemBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }

  const d = parsed.data;
  const updateData: Record<string, unknown> = {};
  if (d.categoryId !== undefined) updateData.categoryId = d.categoryId;
  if (d.name !== undefined) updateData.name = d.name;
  if (d.subCategory !== undefined) updateData.subCategory = d.subCategory;
  if (d.brand !== undefined) updateData.brand = d.brand;
  if (d.stock !== undefined) updateData.stock = d.stock;
  if (d.costPrice !== undefined) updateData.costPrice = String(d.costPrice);
  if (d.salePrice !== undefined) updateData.salePrice = String(d.salePrice);
  if (d.description !== undefined) updateData.description = d.description;
  if (d.code !== undefined) updateData.code = d.code;

  const [item] = await db
    .update(customInventoryTable)
    .set(updateData)
    .where(eq(customInventoryTable.id, params.data.id))
    .returning();
  if (!item) { res.status(404).json({ error: "Producto no encontrado" }); return; }

  const [cat] = await db.select().from(inventoryCategoriesTable).where(eq(inventoryCategoriesTable.id, item.categoryId));
  res.json({ ...mapItem(item), categoryName: cat?.name, categoryColor: cat?.color });
});

// DELETE /custom-inventory/:id
router.delete("/custom-inventory/:id", async (req, res): Promise<void> => {
  const params = IdParam.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }

  const [item] = await db
    .delete(customInventoryTable)
    .where(eq(customInventoryTable.id, params.data.id))
    .returning();
  if (!item) { res.status(404).json({ error: "Producto no encontrado" }); return; }
  res.sendStatus(204);
});

export default router;
