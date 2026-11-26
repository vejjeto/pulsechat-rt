import { getRequestId } from "@/lib/logger";
import { getPulseChatOpenApiSpec } from "@/lib/openapi";

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export async function GET(request: Request): Promise<Response> {
  const requestId = getRequestId(request);
  const spec = getPulseChatOpenApiSpec() as {
    info: { title: string; version: string; description: string };
    paths: Record<
      string,
      Record<string, { summary?: string; tags?: string[] }>
    >;
  };

  const rows = Object.entries(spec.paths)
    .flatMap(([path, methods]) =>
      Object.entries(methods).map(([method, op]) => {
        const upper = method.toUpperCase();
        const badgeColor =
          upper === "POST"
            ? "background:#065f46;color:#6ee7b7;border-color:#059669"
            : "background:#1e3a8a;color:#93c5fd;border-color:#2563eb";
        return `<li class="card">
          <div class="row">
            <span class="method" style="${badgeColor}">${escapeHtml(upper)}</span>
            <code class="path">${escapeHtml(path)}</code>
            <span class="tag">${escapeHtml(op.tags?.[0] ?? "API")}</span>
          </div>
          <p class="summary">${escapeHtml(op.summary ?? "")}</p>
        </li>`;
      }),
    )
    .join("\n");

  const html = `<!doctype html>
<html lang="es" class="dark">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${escapeHtml(spec.info.title)}</title>
  <style>
    body{margin:0;background:#09090b;color:#f4f4f5;font-family:Inter,system-ui,sans-serif;padding:2rem 1rem}
    .wrap{max-width:860px;margin:0 auto}
    header{display:flex;flex-wrap:wrap;align-items:center;justify-content:space-between;gap:1rem;border-bottom:1px solid #27272a;padding-bottom:1rem;margin-bottom:1.5rem}
    h1{margin:0;font-size:1.5rem}
    .badges{display:flex;gap:.5rem;align-items:center}
    .pill{font-family:monospace;font-size:.75rem;padding:.25rem .6rem;border-radius:9999px;border:1px solid #10b98166;background:#10b9811a;color:#6ee7b7}
    .link{font-family:monospace;font-size:.75rem;color:#93c5fd;text-decoration:none;border:1px solid #27272a;padding:.35rem .7rem;border-radius:.5rem}
    .desc{color:#a1a1aa;margin:0 0 1.5rem;line-height:1.5}
    ul{list-style:none;padding:0;margin:0;display:grid;gap:.75rem}
    .card{background:#18181b;border:1px solid #27272a;border-radius:.75rem;padding:1rem}
    .row{display:flex;align-items:center;gap:.75rem;flex-wrap:wrap}
    .method{font-family:monospace;font-size:.75rem;font-weight:700;padding:.2rem .5rem;border-radius:.375rem;border:1px solid}
    .path{font-family:monospace;font-size:.9rem;color:#fafafa}
    .tag{margin-left:auto;font-family:monospace;font-size:.7rem;color:#a1a1aa}
    .summary{margin:.5rem 0 0;color:#d4d4d8;font-size:.875rem}
    pre{background:#18181b;border:1px solid #27272a;border-radius:.75rem;padding:1rem;overflow:auto;font-size:.75rem;color:#d4d4d8;margin-top:1.5rem}
  </style>
</head>
<body>
  <div class="wrap">
    <header>
      <h1>${escapeHtml(spec.info.title)}</h1>
      <div class="badges">
        <span class="pill">OpenAPI 3.1.0</span>
        <span class="pill">v${escapeHtml(spec.info.version)}</span>
        <a class="link" href="/api/openapi.json">/api/openapi.json</a>
      </div>
    </header>
    <p class="desc">${escapeHtml(spec.info.description)}</p>
    <ul>${rows}</ul>
    <pre>${escapeHtml(JSON.stringify(spec, null, 2))}</pre>
  </div>
</body>
</html>`;

  return new Response(html, {
    status: 200,
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "x-request-id": requestId,
    },
  });
}
