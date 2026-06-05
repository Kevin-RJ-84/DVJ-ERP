import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import {
  EXCEL_DATE_FORMATS,
  buildStoredExcelMappingJson,
  getFieldsForReportType,
  parseStoredExcelMappingJson,
  sanitizeExcelColumnMapping,
  REPORT_TYPES,
  type ReportType,
} from "@/lib/excel-config";
import { extractHeadersFromWorkbook } from "@/lib/excel";
import { requireAuth } from "@/lib/auth-server";
import { requirePermission, ForbiddenError } from "@/lib/rbac";

const reportTypeSchema = z.enum(REPORT_TYPES);

const saveMappingSchema = z.object({
  reportType: reportTypeSchema,
  mapping: z.record(z.string(), z.string()),
  dateFormat: z.enum(EXCEL_DATE_FORMATS).optional(),
});

export async function GET(request: NextRequest) {
  const auth = await requireAuth(request);
  if (!auth) return NextResponse.json({ message: "Unauthorized." }, { status: 401 });
  try {
    await requirePermission(auth.userId, "excel_config.view");
  } catch (e) {
    if (e instanceof ForbiddenError) return e.response;
    throw e;
  }

  const { searchParams } = new URL(request.url);
  const reportTypeResult = reportTypeSchema.safeParse(searchParams.get("reportType"));
  if (!reportTypeResult.success) {
    return NextResponse.json(
      { message: "reportType must be either stock or sales." },
      { status: 400 },
    );
  }

  const reportType = reportTypeResult.data;
  const entry = await db.excel_mappings.findUnique({
    where: { ReportType: reportType },
  });

  const parsed = parseStoredExcelMappingJson(entry?.Mapping, reportType);

  return NextResponse.json({
    reportType,
    mapping: parsed.columns,
    dateFormat: parsed.dateFormat,
    updatedAt: entry?.UpdatedAt ?? null,
    fields: getFieldsForReportType(reportType),
  });
}

export async function POST(request: NextRequest) {
  const auth = await requireAuth(request);
  if (!auth) return NextResponse.json({ message: "Unauthorized." }, { status: 401 });
  try {
    await requirePermission(auth.userId, "excel_config.edit");
  } catch (e) {
    if (e instanceof ForbiddenError) return e.response;
    throw e;
  }

  const contentType = request.headers.get("content-type") ?? "";

  if (contentType.includes("multipart/form-data")) {
    const formData = await request.formData();
    const reportTypeResult = reportTypeSchema.safeParse(formData.get("reportType"));
    if (!reportTypeResult.success) {
      return NextResponse.json(
        { message: "reportType must be either stock or sales." },
        { status: 400 },
      );
    }

    const sampleFile = formData.get("sampleFile");
    if (!(sampleFile instanceof File)) {
      return NextResponse.json(
        { message: "sampleFile is required." },
        { status: 400 },
      );
    }

    const arrayBuffer = await sampleFile.arrayBuffer();
    let headers: string[] = [];
    try {
      headers = await extractHeadersFromWorkbook(Buffer.from(arrayBuffer), {
        filename: sampleFile.name,
      });
    } catch (error) {
      return NextResponse.json(
        {
          message:
            error instanceof Error ? error.message : "Failed to parse sample file.",
        },
        { status: 400 },
      );
    }

    return NextResponse.json({
      reportType: reportTypeResult.data,
      headers,
      fields: getFieldsForReportType(reportTypeResult.data),
    });
  }

  const parsedBody = saveMappingSchema.safeParse(await request.json());
  if (!parsedBody.success) {
    return NextResponse.json(
      { message: "Invalid mapping payload." },
      { status: 400 },
    );
  }

  const reportType = parsedBody.data.reportType;
  const normalizedColumns = sanitizeExcelColumnMapping(parsedBody.data.mapping, reportType);
  const existingEntry = await db.excel_mappings.findUnique({
    where: { ReportType: reportType },
  });
  const previous = parseStoredExcelMappingJson(existingEntry?.Mapping, reportType);
  const dateFormat = parsedBody.data.dateFormat ?? previous.dateFormat;
  const mappingJson = buildStoredExcelMappingJson(normalizedColumns, dateFormat) as Prisma.InputJsonValue;

  const saved = await db.excel_mappings.upsert({
    where: { ReportType: reportType },
    update: {
      Mapping: mappingJson,
      UpdatedAt: new Date(),
    },
    create: {
      ReportType: reportType,
      Mapping: mappingJson,
    },
  });

  return NextResponse.json({
    message: "Mapping saved successfully.",
    reportType,
    mapping: normalizedColumns,
    dateFormat,
    updatedAt: saved.UpdatedAt,
    fields: getFieldsForReportType(reportType),
  });
}
