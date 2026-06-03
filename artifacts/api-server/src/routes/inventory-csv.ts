import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import { db, perfumeryTable, sublimationTable, customInventoryTable, inventoryCategoriesTable } from "@workspace/db";

const router: IRouter = Router();

// ── Helpers ────────────────────────────────────────────────────────────────────

function escapeCsv(val: string | number | null | undefined): string {
  if (val == null) return "";
  const str = String(val);
  if (str.includes(",") || str.includes("\"") || str.includes("\n")) {
    return `"${str.replace(/"/g, "\"\"")}"`;
  }
  return str;
}

function rowToCsv(fields: (string | number | null | undefined)[]): string {
  return fields.map(escapeCsv).join(",");
}

const CSV_HEADERS = [
  "tipo",
  "codigo",
  "nombre",
  "categoria",
  "subcategoria",
  "marca",
  "ml",
  "stock",
  "precio_costo",
  "precio_venta",
  "descripcion",
];

// ── GET /inventory/export-csv ─────────────────────────────────────────────────

router.get("/inventory/export-csv", async (req, res): Promise<void> => {
  try {
    const [perfRows, subRows, cats, custRows] = await Promise.all([
      db.select().from(perfumeryTable),
      db.select().from(sublimationTable),
      db.select().from(inventoryCategoriesTable),
      db.select().from(customInventoryTable),
    ]);

    const catMap = new Map(cats.map(c => [c.id, c.name]));
    const lines: string[] = [CSV_HEADERS.join(",")];

    // Perfumería
    for (const p of perfRows) {
      lines.push(rowToCsv([
        "perfumeria",
        p.code,
        p.name,
        "Perfumería",
        "",          // subcategoria
        p.brand,
        p.ml,
        p.stock,
        Number(p.costPrice).toFixed(2),
        Number(p.salePrice).toFixed(2),
        p.description,
      ]));
    }

    // Sublimación
    for (const s of subRows) {
      lines.push(rowToCsv([
        "sublimacion",
        s.code,
        s.name,
        s.category,
        s.itemType,  // subcategoria = itemType
        "",          // marca
        "",          // ml
        s.stock,
        Number(s.costPrice).toFixed(2),
        Number(s.salePrice).toFixed(2),
        s.description,
      ]));
    }

    // Custom
    for (const c of custRows) {
      lines.push(rowToCsv([
        "custom",
        c.code,
        c.name,
        catMap.get(c.categoryId) ?? String(c.categoryId),
        c.subCategory,
        c.brand,
        "",          // ml
        c.stock,
        Number(c.costPrice).toFixed(2),
        Number(c.salePrice).toFixed(2),
        c.description,
      ]));
    }

    const csv = lines.join("\n");
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="inventario-cyg-${new Date().toISOString().slice(0, 10)}.csv"`);
    res.send("\uFEFF" + csv); // BOM para Excel
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ── POST /inventory/import-csv ────────────────────────────────────────────────
// Body: { rows: Array<Record<string, string>> }
// Supports upsert by code (if code exists → update; if not → insert)

router.post("/inventory/import-csv", async (req, res): Promise<void> => {
  try {
    const { rows } = req.body as { rows: Record<string, string>[] };
    if (!Array.isArray(rows) || rows.length === 0) {
      res.status(400).json({ error: "Se requiere un array de filas en 'rows'" });
      return;
    }

    // Pre-fetch categories for lookup
    const cats = await db.select().from(inventoryCategoriesTable);
    const catByName = new Map(cats.map(c => [c.name.toLowerCase().trim(), c]));

    let inserted = 0, updated = 0, skipped = 0;
    const errors: string[] = [];

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      const lineNum = i + 2; // +2 because row 1 is header

      const tipo      = (row.tipo ?? "").toLowerCase().trim();
      const codigo    = (row.codigo ?? "").trim() || null;
      const nombre    = (row.nombre ?? "").trim();
      const categoria = (row.categoria ?? "").trim();
      const subcategoria = (row.subcategoria ?? "").trim() || null;
      const marca     = (row.marca ?? "").trim() || null;
      const mlRaw     = (row.ml ?? "").trim();
      const stockRaw  = (row.stock ?? "").trim();
      const costoRaw  = (row.precio_costo ?? "").trim();
      const ventaRaw  = (row.precio_venta ?? "").trim();
      const desc      = (row.descripcion ?? "").trim() || null;

      if (!nombre) { errors.push(`Fila ${lineNum}: nombre vacío`); skipped++; continue; }

      const costPrice = parseFloat(costoRaw);
      const salePrice = parseFloat(ventaRaw);
      if (isNaN(costPrice) || isNaN(salePrice)) {
        errors.push(`Fila ${lineNum}: precio_costo o precio_venta inválido`);
        skipped++;
        continue;
      }

      const stock = stockRaw !== "" ? parseInt(stockRaw, 10) : null;
      const ml    = mlRaw    !== "" ? parseInt(mlRaw, 10)    : null;

      // ── Perfumería ────────────────────────────────────────────────────────
      if (tipo === "perfumeria") {
        const brand = marca ?? "Sin marca";
        const mlVal = (ml != null && !isNaN(ml)) ? ml : 100;

        if (codigo) {
          const [existing] = await db.select({ id: perfumeryTable.id })
            .from(perfumeryTable).where(eq(perfumeryTable.code, codigo));
          if (existing) {
            await db.update(perfumeryTable).set({
              name: nombre, brand, ml: mlVal,
              stock: stock ?? 0, costPrice: String(costPrice), salePrice: String(salePrice),
              description: desc,
            }).where(eq(perfumeryTable.id, existing.id));
            updated++;
            continue;
          }
        }
        await db.insert(perfumeryTable).values({
          name: nombre, brand, ml: mlVal, code: codigo,
          stock: stock ?? 0, costPrice: String(costPrice), salePrice: String(salePrice),
          description: desc,
        });
        inserted++;
        continue;
      }

      // ── Sublimación ───────────────────────────────────────────────────────
      if (tipo === "sublimacion") {
        const cat = categoria || "General";
        const itemType = (subcategoria === "maquinaria" || subcategoria === "consumible")
          ? subcategoria : "consumible";

        if (codigo) {
          const [existing] = await db.select({ id: sublimationTable.id })
            .from(sublimationTable).where(eq(sublimationTable.code, codigo));
          if (existing) {
            await db.update(sublimationTable).set({
              name: nombre, category: cat, itemType,
              stock: stock ?? null, costPrice: String(costPrice), salePrice: String(salePrice),
              description: desc,
            }).where(eq(sublimationTable.id, existing.id));
            updated++;
            continue;
          }
        }
        await db.insert(sublimationTable).values({
          name: nombre, category: cat, itemType, code: codigo,
          stock: stock ?? null, costPrice: String(costPrice), salePrice: String(salePrice),
          description: desc,
        });
        inserted++;
        continue;
      }

      // ── Custom ────────────────────────────────────────────────────────────
      if (tipo === "custom") {
        const catEntry = catByName.get(categoria.toLowerCase());
        if (!catEntry) {
          errors.push(`Fila ${lineNum}: categoría "${categoria}" no existe. Créala primero en Inventario.`);
          skipped++;
          continue;
        }

        if (codigo) {
          const [existing] = await db.select({ id: customInventoryTable.id })
            .from(customInventoryTable).where(eq(customInventoryTable.code, codigo));
          if (existing) {
            await db.update(customInventoryTable).set({
              name: nombre, categoryId: catEntry.id, subCategory: subcategoria,
              brand: marca, stock: stock ?? null, costPrice: String(costPrice),
              salePrice: String(salePrice), description: desc,
            }).where(eq(customInventoryTable.id, existing.id));
            updated++;
            continue;
          }
        }
        await db.insert(customInventoryTable).values({
          name: nombre, categoryId: catEntry.id, subCategory: subcategoria,
          brand: marca, code: codigo, stock: stock ?? null,
          costPrice: String(costPrice), salePrice: String(salePrice), description: desc,
        });
        inserted++;
        continue;
      }

      errors.push(`Fila ${lineNum}: tipo "${tipo}" desconocido. Usa: perfumeria, sublimacion, custom`);
      skipped++;
    }

    res.json({ inserted, updated, skipped, errors });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
