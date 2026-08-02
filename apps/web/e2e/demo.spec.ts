import { expect, test } from '@playwright/test';

test.describe('landing page', () => {
  test('states what is real and what is simulated', async ({ page }) => {
    await page.goto('/');

    await expect(page.getByRole('heading', { level: 1 })).toContainText('voice agent');
    await expect(page.getByText('What is real and what is simulated')).toBeVisible();
    // Honesty about the phone path must be on the page, not only in the docs.
    await expect(page.getByText(/number not provisioned/i)).toBeVisible();

    await page.getByRole('link', { name: /start a live call/i }).click();
    await expect(page).toHaveURL(/\/demo$/);
  });
});

test.describe('demo console in text mode', () => {
  test('runs a full qualification turn and fills the requirements panel', async ({ page }) => {
    await page.goto('/demo');

    const callButton = page.getByRole('button', { name: /start call/i });
    await expect(callButton).toBeVisible();

    await callButton.click();

    // The greeting proves the socket opened, the session started and the
    // orchestrator produced its first turn.
    await expect(page.getByText(/Main Priya bol rahi hoon/i)).toBeVisible({ timeout: 20_000 });
    await expect(page.getByRole('button', { name: /hang up/i })).toBeVisible();

    // Provider badges must report what is actually running.
    await expect(page.getByText(/LLM MockLLM/)).toBeVisible();

    const input = page.getByRole('textbox', { name: /type a message to the agent/i });
    await input.fill('Mujhe 2 BHK chahiye Hinjewadi mein, ghar kharidna hai');
    await page.getByRole('button', { name: /send/i }).click();

    await expect(page.getByText('Mujhe 2 BHK chahiye Hinjewadi mein, ghar kharidna hai')).toBeVisible();

    // The slot panel is the thing that proves comprehension.
    const requirements = page.locator('li', { hasText: 'Configuration' }).first();
    await expect(requirements).toContainText('2BHK', { timeout: 20_000 });

    const intent = page.locator('li', { hasText: 'Intent' }).first();
    await expect(intent).toContainText('Buy');

    // Tool trace records the grounded write.
    await expect(page.getByText(/set .*configuration/i)).toBeVisible();

    await input.fill('Budget 75 lakh tak hai');
    await page.getByRole('button', { name: /send/i }).click();

    const budget = page.locator('li', { hasText: 'Budget' }).first();
    await expect(budget).toContainText('₹75 L', { timeout: 20_000 });

    // A mid-call revision must overwrite, not append.
    await input.fill('Actually 3 BHK dekh lijiye, budget 1.2 crore kar sakte hain');
    await page.getByRole('button', { name: /send/i }).click();

    await expect(requirements).toContainText('3BHK', { timeout: 20_000 });
    await expect(budget).toContainText('₹1.2 Cr');

    await page.getByRole('button', { name: /hang up/i }).click();
    await expect(page.getByRole('button', { name: /start call/i })).toBeVisible();
  });

  test('language selector is available before the call starts', async ({ page }) => {
    await page.goto('/demo');
    const selector = page.getByLabel('Language mode');
    await expect(selector).toBeVisible();
    await selector.selectOption('hi');
    await expect(selector).toHaveValue('hi');
  });
});

test.describe('dashboard', () => {
  test('lists seeded leads and opens a call detail', async ({ page }) => {
    await page.goto('/leads');
    await expect(page.getByRole('heading', { name: 'Leads' })).toBeVisible();

    const firstLead = page.locator('tbody tr').first();
    await expect(firstLead).toBeVisible({ timeout: 20_000 });
    await firstLead.locator('a').first().click();

    await expect(page.getByRole('heading', { name: 'Transcript' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Narrative summary' })).toBeVisible();
    // Both languages are produced for every summary.
    await expect(page.getByText('हिन्दी')).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Qualification' })).toBeVisible();
  });
});
