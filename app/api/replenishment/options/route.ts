import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAuth } from "@/lib/auth-server";
import { requirePermission, ForbiddenError } from "@/lib/rbac";

function compact(values: Array<string | null>) {
  return [...new Set(values.map((value) => value?.trim()).filter(Boolean))] as string[];
}

export async function GET(request: NextRequest) {
  const auth = await requireAuth(request);
  if (!auth) return NextResponse.json({ message: "Unauthorized." }, { status: 401 });
  try {
    await requirePermission(auth.userId, "replenishment.view");
  } catch (e) {
    if (e instanceof ForbiddenError) return e.response;
    throw e;
  }

  const { searchParams } = new URL(request.url);
  const styleQuery = searchParams.get("styleQuery")?.trim();

  if (styleQuery) {
    const styleRows = await db.stock.findMany({
      where: {
        StyleNo: {
          contains: styleQuery,
          mode: "insensitive",
        },
      },
      select: { StyleNo: true },
      distinct: ["StyleNo"],
      take: 12,
      orderBy: { StyleNo: "asc" },
    });

    return NextResponse.json({
      styleSuggestions: compact(styleRows.map((row) => row.StyleNo)),
    });
  }

  const [stoneShapes, metals, metalTypes, productTypes, productStyles] = await Promise.all([
    db.stock.findMany({
      select: { StoneShape: true },
      distinct: ["StoneShape"],
      where: { StoneShape: { not: null } },
      orderBy: { StoneShape: "asc" },
    }),
    db.stock.findMany({
      select: { Metal: true },
      distinct: ["Metal"],
      where: { Metal: { not: null } },
      orderBy: { Metal: "asc" },
    }),
    db.stock.findMany({
      select: { MetalType: true },
      distinct: ["MetalType"],
      where: { MetalType: { not: null } },
      orderBy: { MetalType: "asc" },
    }),
    db.stock.findMany({
      select: { ProductType: true },
      distinct: ["ProductType"],
      where: { ProductType: { not: null } },
      orderBy: { ProductType: "asc" },
    }),
    db.stock.findMany({
      select: { ProductStyle: true },
      distinct: ["ProductStyle"],
      where: { ProductStyle: { not: null } },
      orderBy: { ProductStyle: "asc" },
    }),
  ]);

  return NextResponse.json({
    options: {
      stoneShapes: compact(stoneShapes.map((row) => row.StoneShape)),
      metals: compact(metals.map((row) => row.Metal)),
      metalTypes: compact(metalTypes.map((row) => row.MetalType)),
      productTypes: compact(productTypes.map((row) => row.ProductType)),
      productStyles: compact(productStyles.map((row) => row.ProductStyle)),
    },
  });
}
