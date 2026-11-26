import { getEnv } from "@/lib/env";
import { z } from "zod";

export const CreateRoomSchema = z.object({
  slug: z.string().trim().min(2).max(48).optional(),
  name: z.string().trim().min(2).max(64),
  description: z.string().trim().max(240).optional(),
  isPublic: z.boolean().optional(),
});

export const HealthResponseSchema = z.object({
  status: z.enum(["ok", "degraded"]),
  service: z.literal("pulsechat-rt"),
  version: z.string().min(1),
  uptimeSec: z.number().int().nonnegative(),
  timestamp: z.string().min(1),
  checks: z.object({
    database: z.object({
      status: z.enum(["up", "down"]),
      latencyMs: z.number().nonnegative(),
    }),
  }),
});

export type HealthResponse = z.infer<typeof HealthResponseSchema>;

export function getPulseChatOpenApiSpec(): Record<string, unknown> {
  const { NEXT_PUBLIC_APP_URL } = getEnv();

  return {
    openapi: "3.1.0",
    info: {
      title: "PulseChat RT API",
      version: "2.0.0",
      description:
        "API REST y observabilidad del servidor unificado Next.js 15 + WebSockets (/ws) con paginación por cursor compuesto y errores RFC 7807.",
    },
    servers: [{ url: NEXT_PUBLIC_APP_URL }],
    tags: [
      {
        name: "Observability",
        description: "Health checks y documentación OpenAPI",
      },
      { name: "Rooms", description: "Gestión de salas públicas" },
      {
        name: "Messages",
        description: "Historial paginado por cursor compuesto",
      },
    ],
    paths: {
      "/api/health": {
        get: {
          tags: ["Observability"],
          summary: "Estado del servicio PulseChat RT y latencia de SQLite",
          responses: {
            "200": {
              description: "Servicio saludable con latencia de base de datos",
            },
            "503": {
              description: "Base de datos no disponible (RFC 7807)",
              content: {
                "application/problem+json": {
                  schema: { $ref: "#/components/schemas/ProblemDetails" },
                },
              },
            },
          },
        },
      },
      "/api/openapi.json": {
        get: {
          tags: ["Observability"],
          summary: "Especificación OpenAPI 3.1.0",
          responses: {
            "200": { description: "Documento JSON OpenAPI 3.1.0" },
          },
        },
      },
      "/api/docs": {
        get: {
          tags: ["Observability"],
          summary: "Documentación interactiva OpenAPI en modo oscuro",
          responses: {
            "200": { description: "Página HTML de documentación" },
          },
        },
      },
      "/api/rooms": {
        get: {
          tags: ["Rooms"],
          summary: "Lista salas públicas ordenadas cronológicamente",
          responses: {
            "200": { description: "Arreglo de salas disponibles" },
          },
        },
        post: {
          tags: ["Rooms"],
          summary: "Crea una nueva sala pública",
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/CreateRoomRequest" },
              },
            },
          },
          responses: {
            "201": { description: "Sala creada" },
            "400": {
              description: "Payload o slug inválido (RFC 7807)",
              content: {
                "application/problem+json": {
                  schema: { $ref: "#/components/schemas/ProblemDetails" },
                },
              },
            },
            "409": {
              description: "La sala ya existe (RFC 7807)",
              content: {
                "application/problem+json": {
                  schema: { $ref: "#/components/schemas/ProblemDetails" },
                },
              },
            },
          },
        },
      },
      "/api/rooms/{slug}/messages": {
        get: {
          tags: ["Messages"],
          summary:
            "Obtiene mensajes paginados hacia atrás por cursor compuesto (?cursor=...&limit=15)",
          parameters: [
            {
              name: "slug",
              in: "path",
              required: true,
              schema: { type: "string" },
            },
            {
              name: "cursor",
              in: "query",
              required: false,
              schema: { type: "string" },
            },
            {
              name: "limit",
              in: "query",
              required: false,
              schema: { type: "integer", minimum: 1, maximum: 50, default: 15 },
            },
          ],
          responses: {
            "200": { description: "CursorPage { items, nextCursor, hasMore }" },
            "400": {
              description: "Cursor inválido (RFC 7807)",
              content: {
                "application/problem+json": {
                  schema: { $ref: "#/components/schemas/ProblemDetails" },
                },
              },
            },
            "404": {
              description: "Sala no encontrada (RFC 7807)",
              content: {
                "application/problem+json": {
                  schema: { $ref: "#/components/schemas/ProblemDetails" },
                },
              },
            },
          },
        },
      },
    },
    components: {
      schemas: {
        CreateRoomRequest: {
          type: "object",
          required: ["name"],
          properties: {
            slug: { type: "string", minLength: 2, maxLength: 48 },
            name: { type: "string", minLength: 2, maxLength: 64 },
            description: { type: "string", maxLength: 240 },
            isPublic: { type: "boolean" },
          },
        },
        ProblemDetails: {
          type: "object",
          required: [
            "type",
            "title",
            "status",
            "detail",
            "instance",
            "requestId",
          ],
          properties: {
            type: { type: "string" },
            title: { type: "string" },
            status: { type: "integer" },
            detail: { type: "string" },
            instance: { type: "string" },
            requestId: { type: "string" },
            errors: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  path: { type: "string" },
                  message: { type: "string" },
                },
              },
            },
          },
        },
      },
    },
  };
}
