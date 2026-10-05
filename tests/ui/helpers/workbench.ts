import type { Page } from '@playwright/test';

export async function clickWorkbenchAction(page: Page, id: string) {
  const action = page.getByTestId(id);
  const parent = await action.evaluate(element => {
    const details = element.closest('details');
    return details && !details.open ? details.dataset.testid : null;
  });
  if (parent) await page.getByTestId(parent).locator('summary').click();
  await action.click();
}
