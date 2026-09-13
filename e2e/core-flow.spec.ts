import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { expect, test } from "@playwright/test";
import { generateBilancioPdf } from "../lib/documents/demo-pdf";
import { PASSWORD, USERS, uniqueVat } from "./helpers";

/**
 * Core consultant journey (spec §26):
 * LOGIN → CREATE COMPANY → UPLOAD DOCUMENT → PROCESS DOCUMENT → VIEW FINANCIAL DATA → VIEW ANALYSIS
 * → CREATE FINANCING OPERATION → CREATE TASK → ASK AI COPILOT → GENERATE CLIENT BRIEFING
 */
test("il consulente passa dal login al briefing cliente", async ({ page }, testInfo) => {
  const companyName = `Zeta Componenti ${Date.now()} S.r.l.`;
  const vat = uniqueVat();

  await test.step("login", async () => {
    await page.goto("/login");
    await page.getByLabel("Email").fill(USERS.advisor);
    await page.getByLabel("Password").fill(PASSWORD);
    await page.getByRole("button", { name: "Accedi" }).click();
    await expect(page).toHaveURL(/\/dashboard/);
    await expect(page.getByTestId("attention-headline")).toBeVisible();
  });

  await test.step("crea azienda", async () => {
    await page.goto("/companies");
    await page.getByTestId("new-company").click();
    await page.getByLabel("Ragione sociale *").fill(companyName);
    await page.getByLabel("Partita IVA").fill(vat);
    await page.getByLabel("Sede (città)").fill("Vicenza");
    await page.getByRole("button", { name: "Crea azienda" }).click();
    await expect(page).toHaveURL(/\/companies\/[a-z0-9]+$/);
    await expect(page.getByRole("heading", { name: companyName })).toBeVisible();
  });
  const companyUrl = page.url();

  await test.step("carica e analizza un bilancio", async () => {
    const pdf = await generateBilancioPdf({
      companyName,
      vatNumber: vat,
      city: "Vicenza",
      fiscalYear: 2025,
      current: { revenue: 8_400_000, ebit: 610_000, depreciation: 290_000, netIncome: 350_000, cash: 520_000, financialDebt: 3_300_000, equity: 2_100_000, currentAssets: 3_900_000, currentLiabilities: 3_100_000, inventory: 1_100_000, totalAssets: 8_200_000, interestExpense: 140_000, principalRepayment: 610_000 },
      previous: { revenue: 7_600_000, ebit: 560_000, depreciation: 260_000, netIncome: 320_000, cash: 610_000, financialDebt: 2_900_000, equity: 1_800_000, currentAssets: 3_500_000, currentLiabilities: 2_800_000, inventory: 950_000, totalAssets: 7_400_000, interestExpense: 120_000, principalRepayment: 560_000 },
    });
    const dir = testInfo.outputPath("fixtures");
    await mkdir(dir, { recursive: true });
    const file = path.join(dir, "Bilancio_2025_Zeta.pdf");
    await writeFile(file, pdf);

    await page.getByTestId("open-upload").first().click();
    await page.getByTestId("upload-input").setInputFiles(file);
    await page.getByTestId("upload-and-process").click();
    await expect(page).toHaveURL(/\/documents\/[a-z0-9]+/);
    await expect(page.getByTestId("pipeline-status")).toContainText("Analizzato", { timeout: 90_000 });
    await expect(page.getByTestId("extraction-review")).toBeVisible();
    await page.getByTestId("approve-extraction").click();
    await expect(page.getByTestId("extraction-review")).toContainText("Approvata");
  });

  await test.step("vede i dati finanziari e l'analisi", async () => {
    await page.goto(`${companyUrl}?tab=analysis`);
    await expect(page.getByTestId("kpi-grid")).toBeVisible();
    await expect(page.getByTestId("statements-table")).toContainText("8.400.000");
    await expect(page.getByTestId("ratios-table")).toBeVisible();
    await expect(page.getByTestId("trend-charts")).toBeVisible();
    await page.getByTestId("kpi-grid").getByTestId("ratio-dscr").click();
    await expect(page.getByTestId("ratio-formula")).toContainText("EBITDA / (Oneri finanziari + Quota capitale annua)");
    await page.keyboard.press("Escape");
  });

  await test.step("crea un'operazione finanziaria", async () => {
    await page.goto(`${companyUrl}?tab=financing`);
    await page.getByTestId("new-operation").click();
    await page.getByLabel("Titolo *").fill("Mutuo chirografario impianto fotovoltaico");
    await page.getByLabel("Banca / intermediario *").fill("Banca Demo Berica");
    await page.getByLabel("Importo (€)").fill("900000");
    await page.getByTestId("submit-operation").click();
    await expect(page).toHaveURL(/\/operations\/[a-z0-9]+/);
    await expect(page.getByTestId("checklist")).toContainText("Bilancio ultimo esercizio");
  });

  await test.step("crea un task", async () => {
    await page.getByTestId("new-task").click();
    await page.getByLabel("Titolo *").fill("Richiedere preventivi impianto");
    await page.getByTestId("submit-task").click();
    await expect(page.getByTestId("task-list")).toContainText("Richiedere preventivi impianto");
  });

  await test.step("chiede al copilot", async () => {
    await page.goto(companyUrl);
    await page.getByTestId("open-copilot").click();
    await page.getByTestId("copilot-input").fill("Quali sono le principali criticità finanziarie?");
    await page.getByTestId("copilot-input").press("Enter");
    await expect(page.getByTestId("copilot-answer").last()).toContainText(companyName, { timeout: 60_000 });
    await page.keyboard.press("Escape");
  });

  await test.step("genera il client briefing", async () => {
    await page.goto(`${companyUrl}?tab=briefing`);
    await page.getByTestId("generate-genera-briefing").click();
    await expect(page.getByTestId("briefing-view")).toContainText("Executive summary", { timeout: 60_000 });
    await expect(page.getByTestId("sources-list")).toBeVisible();
  });
});
