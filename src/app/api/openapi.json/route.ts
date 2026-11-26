import { getRequestId } from "@/lib/logger";
import { getPulseChatOpenApiSpec } from "@/lib/openapi";
import { jsonWithRequestId } from "@/lib/problem-details";
import type { NextResponse } from "next/server";

export async function GET(request: Request): Promise<NextResponse> {
  const requestId = getRequestId(request);
  return jsonWithRequestId(getPulseChatOpenApiSpec(), requestId, 200);
}
