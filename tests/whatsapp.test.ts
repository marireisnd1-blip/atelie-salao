import { createHmac } from "node:crypto";
import { describe, it, expect } from "vitest";
import {
  verifySignature,
  parseMessages,
  readLimitedBody,
} from "../src/lib/whatsapp";
const payload = {
  object: "whatsapp_business_account",
  entry: [
    {
      changes: [
        {
          value: {
            metadata: { phone_number_id: "123" },
            contacts: [
              { wa_id: "5511999999999", profile: { name: "Cliente" } },
            ],
            messages: [
              {
                id: "wamid.1",
                from: "5511999999999",
                timestamp: "1792098000",
                type: "text",
                text: { body: "Quero marcar" },
              },
            ],
          },
        },
      ],
    },
  ],
};
describe("Webhook oficial", () => {
  it("valida HMAC do corpo original e rejeita alteração, segredo incorreto e assinatura ausente", () => {
    const raw = JSON.stringify(payload);
    const signature =
      "sha256=" + createHmac("sha256", "test-secret").update(raw).digest("hex");
    expect(verifySignature(raw, signature, "test-secret")).toBe(true);
    expect(verifySignature(raw + " ", signature, "test-secret")).toBe(false);
    expect(verifySignature(raw, signature, "other-secret")).toBe(false);
    expect(verifySignature(raw, null, "test-secret")).toBe(false);
    expect(verifySignature(raw, "sha256=00", "test-secret")).toBe(false);
  });
  it("usa o telefone do envelope, ignora outro número comercial e não confia no texto como identidade", () => {
    const data = structuredClone(payload);
    data.entry[0].changes[0].value.messages[0].text.body =
      "Meu número é 5511888888888";
    expect(parseMessages(data, "123")[0].phone).toBe("5511999999999");
    expect(parseMessages(data, "456")).toHaveLength(0);
  });
  it("encaminha mídias para humano sem baixar arquivos arbitrários", () => {
    const data = structuredClone(payload);
    data.entry[0].changes[0].value.messages[0].type = "audio";
    expect(parseMessages(data, "123")[0]).toMatchObject({
      unsupported: true,
      body: "[Mídia recebida: audio]",
    });
  });
  it("aceita eventos de status sem tratar como mensagens", () => {
    expect(
      parseMessages(
        {
          object: "whatsapp_business_account",
          entry: [
            {
              changes: [
                {
                  value: { metadata: { phone_number_id: "123" }, statuses: [] },
                },
              ],
            },
          ],
        },
        "123",
      ),
    ).toEqual([]);
  });
  it("limita o corpo pelo tamanho real, mesmo sem Content-Length", async () => {
    await expect(
      readLimitedBody(
        new Request("https://example.com", { method: "POST", body: "12345" }),
        4,
      ),
    ).rejects.toThrow("body_too_large");
    await expect(
      readLimitedBody(
        new Request("https://example.com", { method: "POST", body: "1234" }),
        4,
      ),
    ).resolves.toBe("1234");
  });
});
