import { test, expect } from "@playwright/test";
test("agenda, cadastro, conflito e persistência da demonstração", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/");
  await expect(page.getByText("Modo demonstração.")).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Um lindo dia de trabalho." }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Novo agendamento", exact: true })
    .click();
  await page
    .getByRole("textbox", { name: "Nome da cliente" })
    .fill("Cliente Teste");
  await page
    .getByRole("textbox", { name: "WhatsApp com DDI e DDD" })
    .fill("5511999990000");
  const future = new Date(Date.now() + 2 * 86400000);
  if (future.getDay() === 0) future.setDate(future.getDate() + 1);
  const date = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
  }).format(future);
  await page.getByLabel("Dia", { exact: true }).fill(date);
  await page.getByLabel("Horário de Brasília", { exact: true }).fill("11:00");
  await page.getByRole("button", { name: "Confirmar agendamento" }).click();
  await expect(page.getByRole("status")).toContainText("Alteração salva");
  await page
    .getByRole("button", { name: "Novo agendamento", exact: true })
    .click();
  await page
    .getByRole("textbox", { name: "Nome da cliente" })
    .fill("Outra Cliente");
  await page
    .getByRole("textbox", { name: "WhatsApp com DDI e DDD" })
    .fill("5511999990001");
  await page.getByLabel("Dia", { exact: true }).fill(date);
  await page.getByLabel("Horário de Brasília", { exact: true }).fill("11:15");
  await page.getByRole("button", { name: "Confirmar agendamento" }).click();
  await expect(page.getByRole("dialog").getByRole("alert")).toContainText(
    "já está ocupado",
  );
  await page.getByRole("button", { name: "Fechar", exact: true }).click();
  await page.reload();
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          JSON.parse(
            localStorage.getItem("atelie-demo-v1")!,
          ).data.appointments.filter(
            (a: { client_name: string }) => a.client_name === "Cliente Teste",
          ).length,
      ),
    )
    .toBe(1);
  await page.getByRole("button", { name: "Calendário", exact: true }).click();
  await expect(page.locator(".fc-timegrid")).toBeVisible();
  expect(errors).toEqual([]);
});
test("conversa humana, pausa e cadastro de serviço", async ({ page }) => {
  await page.goto("/");
  await page
    .getByRole("navigation")
    .getByRole("button", { name: /^Conversas/ })
    .click();
  await page
    .getByRole("textbox", { name: "Mensagem para a cliente" })
    .fill("Olá, Marina! Aqui é a equipe.");
  await page.getByRole("button", { name: "Enviar", exact: true }).click();
  await expect(page.getByText("Olá, Marina! Aqui é a equipe.")).toBeVisible();
  await page.getByRole("button", { name: "Retomar IA" }).click();
  await expect(
    page.getByRole("button", { name: "Assumir conversa" }),
  ).toBeVisible();
  await expect(
    page.getByRole("textbox", { name: "Mensagem para a cliente" }),
  ).toBeDisabled();
  await page
    .getByRole("button", { name: "Configurações", exact: true })
    .click();
  await page.getByRole("button", { name: "Pausar assistente" }).click();
  await expect(
    page.getByRole("button", { name: "Ativar assistente" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Serviços", exact: true }).click();
  await page.getByRole("button", { name: "Novo serviço" }).click();
  await page
    .getByRole("textbox", { name: "Nome do serviço" })
    .fill("Pedicure teste");
  await page.getByRole("spinbutton", { name: "Duração (minutos)" }).fill("45");
  await page.getByRole("spinbutton", { name: "Preço (R$)" }).fill("55");
  await page.getByRole("button", { name: "Salvar serviço" }).click();
  await expect(
    page.getByRole("heading", { name: "Pedicure teste" }),
  ).toBeVisible();
});
test("layout em celular e bloqueio dos endpoints em demonstração", async ({
  page,
  request,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await expect(
    page.getByRole("button", { name: "Novo agendamento", exact: true }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  const health = await request.get("/api/health");
  expect(await health.json()).toEqual({ status: "ok", mode: "demo" });
  const webhook = await request.post("/api/webhooks/whatsapp", { data: {} });
  expect(webhook.status()).toBe(503);
  const action = await request.post("/api/dashboard", {
    headers: { Origin: "http://127.0.0.1:3000" },
    data: { action: "toggle_ai", enabled: false },
  });
  expect(action.status()).toBe(403);
});
