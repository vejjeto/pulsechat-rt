import { expect, test } from "@playwright/test";

test("landing -> guest sandbox -> /chat, /demo, /api/health & /api/docs with zero console/page errors", async ({
  page,
  request,
}) => {
  const consoleErrors: string[] = [];
  const pageErrors: string[] = [];

  page.on("console", (msg) => {
    if (msg.type() === "error") {
      consoleErrors.push(msg.text());
    }
  });
  page.on("pageerror", (err) => {
    pageErrors.push(err.message);
  });

  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "PulseChat RT" }),
  ).toBeVisible();

  const enterBtn = page.getByRole("button", {
    name: "Entrar como Invitado a Sala Sandbox",
  });
  await expect(enterBtn).toBeVisible();
  await enterBtn.click();

  await page.waitForURL(/\/chat/);
  await expect(page.getByRole("heading", { name: /#sandbox/i })).toBeVisible();

  await page.goto("/demo");
  await expect(page.getByRole("heading", { name: /#sandbox/i })).toBeVisible();

  const healthRes = await request.get("/api/health");
  expect(healthRes.status()).toBe(200);
  const health = (await healthRes.json()) as {
    status: string;
    service: string;
  };
  expect(health.status).toBe("ok");
  expect(health.service).toBe("pulsechat-rt");

  await page.goto("/api/docs");
  await expect(
    page.getByRole("heading", { name: "PulseChat RT API" }),
  ).toBeVisible();
  await expect(page.getByText("OpenAPI 3.1.0", { exact: true })).toBeVisible();

  expect(consoleErrors).toEqual([]);
  expect(pageErrors).toEqual([]);
});
