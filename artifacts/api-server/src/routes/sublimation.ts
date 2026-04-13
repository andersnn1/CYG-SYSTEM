import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import { db, sublimationTable } from "@workspace/db";
import {
  CreateSublimationItemBody,
  UpdateSublimationItemBody,
  GetSublimationItemParams,
  UpdateSublimationItemParams,
  DeleteSublimationItemParams,
} from "@workspace/api-zod";

const router: IRouter = Router();

function mapItem(item: typeof sublimationTable.$inferSelect) {
  return {
    ...item,
    itemType: item.itemType as "maquinaria" | "consumible",
    costPrice: Number(item.costPrice),
    salePrice: Number(item.salePrice),
    createdAt: item.createdAt.toISOString(),
    updatedAt: item.updatedAt.toISOString(),
  };
}

router.get("/sublimation", async (req, res): Promise<void> => {
  const items = await db.select().from(sublimationTable).orderBy(sublimationTable.name);
  res.json(items.map(mapItem));
});

router.post("/sublimation", async (req, res): Promise<void> => {
  const parsed = CreateSublimationItemBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const [item] = await db.insert(sublimationTable).values({
    name: parsed.data.name,
    category: parsed.data.category,
    itemType: parsed.data.itemType,
    stock: parsed.data.stock ?? null,
    costPrice: String(parsed.data.costPrice),
    salePrice: String(parsed.data.salePrice),
    description: parsed.data.description ?? null,
    code: parsed.data.code ?? null,
  }).returning();
  res.status(201).json(mapItem(item));
});

router.get("/sublimation/:id", async (req, res): Promise<void> => {
  const params = GetSublimationItemParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const [item] = await db.select().from(sublimationTable).where(eq(sublimationTable.id, params.data.id));
  if (!item) {
    res.status(404).json({ error: "Item not found" });
    return;
  }
  res.json(mapItem(item));
});

router.patch("/sublimation/:id", async (req, res): Promise<void> => {
  const params = UpdateSublimationItemParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const parsed = UpdateSublimationItemBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const updateData: Record<string, unknown> = {};
  if (parsed.data.name !== undefined) updateData.name = parsed.data.name;
  if (parsed.data.category !== undefined) updateData.category = parsed.data.category;
  if (parsed.data.itemType !== undefined) updateData.itemType = parsed.data.itemType;
  if (parsed.data.stock !== undefined) updateData.stock = parsed.data.stock;
  if (parsed.data.costPrice !== undefined) updateData.costPrice = String(parsed.data.costPrice);
  if (parsed.data.salePrice !== undefined) updateData.salePrice = String(parsed.data.salePrice);
  if (parsed.data.description !== undefined) updateData.description = parsed.data.description;
  if (parsed.data.code !== undefined) updateData.code = parsed.data.code;

  const [item] = await db.update(sublimationTable).set(updateData).where(eq(sublimationTable.id, params.data.id)).returning();
  if (!item) {
    res.status(404).json({ error: "Item not found" });
    return;
  }
  res.json(mapItem(item));
});

router.delete("/sublimation/:id", async (req, res): Promise<void> => {
  const params = DeleteSublimationItemParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const [item] = await db.delete(sublimationTable).where(eq(sublimationTable.id, params.data.id)).returning();
  if (!item) {
    res.status(404).json({ error: "Item not found" });
    return;
  }
  res.sendStatus(204);
});

export default router;
