import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import { db, perfumeryTable } from "@workspace/db";
import {
  CreatePerfumeryItemBody,
  UpdatePerfumeryItemBody,
  GetPerfumeryItemParams,
  UpdatePerfumeryItemParams,
  DeletePerfumeryItemParams,
} from "@workspace/api-zod";

const router: IRouter = Router();

function mapItem(item: typeof perfumeryTable.$inferSelect) {
  return {
    ...item,
    costPrice: Number(item.costPrice),
    salePrice: Number(item.salePrice),
    createdAt: item.createdAt.toISOString(),
    updatedAt: item.updatedAt.toISOString(),
  };
}

router.get("/perfumery", async (req, res): Promise<void> => {
  const items = await db.select().from(perfumeryTable).orderBy(perfumeryTable.name);
  res.json(items.map(mapItem));
});

router.post("/perfumery", async (req, res): Promise<void> => {
  const parsed = CreatePerfumeryItemBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const [item] = await db.insert(perfumeryTable).values({
    name: parsed.data.name,
    brand: parsed.data.brand,
    ml: parsed.data.ml,
    stock: parsed.data.stock,
    costPrice: String(parsed.data.costPrice),
    salePrice: String(parsed.data.salePrice),
    description: parsed.data.description ?? null,
    code: parsed.data.code ?? null,
  }).returning();
  res.status(201).json(mapItem(item));
});

router.get("/perfumery/:id", async (req, res): Promise<void> => {
  const params = GetPerfumeryItemParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const [item] = await db.select().from(perfumeryTable).where(eq(perfumeryTable.id, params.data.id));
  if (!item) {
    res.status(404).json({ error: "Item not found" });
    return;
  }
  res.json(mapItem(item));
});

router.patch("/perfumery/:id", async (req, res): Promise<void> => {
  const params = UpdatePerfumeryItemParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const parsed = UpdatePerfumeryItemBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const updateData: Record<string, unknown> = {};
  if (parsed.data.name !== undefined) updateData.name = parsed.data.name;
  if (parsed.data.brand !== undefined) updateData.brand = parsed.data.brand;
  if (parsed.data.ml !== undefined) updateData.ml = parsed.data.ml;
  if (parsed.data.stock !== undefined) updateData.stock = parsed.data.stock;
  if (parsed.data.costPrice !== undefined) updateData.costPrice = String(parsed.data.costPrice);
  if (parsed.data.salePrice !== undefined) updateData.salePrice = String(parsed.data.salePrice);
  if (parsed.data.description !== undefined) updateData.description = parsed.data.description;
  if (parsed.data.code !== undefined) updateData.code = parsed.data.code;

  const [item] = await db.update(perfumeryTable).set(updateData).where(eq(perfumeryTable.id, params.data.id)).returning();
  if (!item) {
    res.status(404).json({ error: "Item not found" });
    return;
  }
  res.json(mapItem(item));
});

router.delete("/perfumery/:id", async (req, res): Promise<void> => {
  const params = DeletePerfumeryItemParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const [item] = await db.delete(perfumeryTable).where(eq(perfumeryTable.id, params.data.id)).returning();
  if (!item) {
    res.status(404).json({ error: "Item not found" });
    return;
  }
  res.sendStatus(204);
});

export default router;
