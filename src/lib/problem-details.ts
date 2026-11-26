import { NextResponse } from "next/server";
import { z } from "zod";

export const ProblemIssueSchema = z.object({
  path: z.string(),
  message: z.string(),
});

export const ProblemDetailsSchema = z.object({
  type: z.string(),
  title: z.string(),
  status: z.number().int().min(400).max(599),
  detail: z.string(),
  instance: z.string(),
  requestId: z.string().min(1),
  errors: z.array(ProblemIssueSchema).optional(),
});

export type ProblemDetails = z.infer<typeof ProblemDetailsSchema>;

export interface ProblemResponseInput {
  status: number;
  title: string;
  detail: string;
  requestId: string;
  instance?: string;
  type?: string;
  errors?: Array<{ path: string; message: string }> | undefined;
}

export function problemResponse(
  input: ProblemResponseInput,
): NextResponse<ProblemDetails> {
  const body: ProblemDetails = {
    type: input.type ?? `https://httpstatuses.com/${input.status}`,
    title: input.title,
    status: input.status,
    detail: input.detail,
    instance: input.instance ?? "/api",
    requestId: input.requestId,
    ...(input.errors && input.errors.length > 0
      ? { errors: input.errors }
      : {}),
  };

  return NextResponse.json(body, {
    status: input.status,
    headers: {
      "Content-Type": "application/problem+json; charset=utf-8",
      "x-request-id": input.requestId,
    },
  });
}

export function jsonWithRequestId<T>(
  data: T,
  requestId: string,
  status = 200,
): NextResponse<T> {
  return NextResponse.json(data, {
    status,
    headers: {
      "x-request-id": requestId,
    },
  });
}
