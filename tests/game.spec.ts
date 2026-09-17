import { expect, test, type Page } from '@playwright/test';

async function gridPoint(page: Page, x: number, y: number) {
  const canvas = page.getByTestId('game-canvas');
  await canvas.scrollIntoViewIfNeeded();
  const box = (await canvas.boundingBox())!;
  const zoom = Math.min(box.width / (22 * 64), box.height / (16 * 64));
  return { x: box.x + box.width / 2 + (x - 10) * 64 * zoom, y: box.y + box.height / 2 + (y - 7) * 64 * zoom };
}
async function tapGrid(page: Page, x: number, y: number, touch: boolean) {
  const p = await gridPoint(page, x, y);
  if (touch) await page.touchscreen.tap(p.x, p.y); else await page.mouse.click(p.x, p.y);
}
async function setGate(page: Page, x: number, y: number, role: string, touch: boolean) {
  await page.getByTestId('tool-junction').click(); await tapGrid(page, x, y, touch);
  await page.getByTestId('gateway-role').selectOption(role); await page.getByTestId('apply-gateway').click();
}
async function frames(page: Page, count: number) {
  await page.evaluate(n => new Promise<void>(resolve => {
    const frame = () => { if (--n <= 0) resolve(); else requestAnimationFrame(frame); };
    requestAnimationFrame(frame);
  }), count);
}

test('warehouse trucks deliver freight and restore zone edits', async ({ page, isMobile }, testInfo) => {
  test.setTimeout(75000);
  const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
  await page.goto('/'); await expect(page.getByTestId('game-canvas')).toBeVisible();
  await page.getByTestId('reset').click(); await page.getByTestId('confirm-reset').click();
  await page.getByTestId('tool-build').click(); await tapGrid(page, 7, 7, isMobile); await tapGrid(page, 10, 7, isMobile);
  await page.getByTestId('tool-zone').click(); await tapGrid(page, 7, 7, isMobile);
  await page.getByTestId('zone-kind').selectOption('warehouse'); await page.getByTestId('zone-capacity').selectOption('1');
  await expect(page.getByTestId('zone-kind').locator('option')).toHaveCount(5);
  await expect(page.getByTestId('zone-capacity-label')).toContainText('Truck fleet size');
  await expect(page.getByTestId('zone-demand')).toBeDisabled();
  await page.getByTestId('apply-zone').click(); await expect(page.getByTestId('zone-status')).toContainText('Warehouse');
  await tapGrid(page, 10, 7, isMobile); await page.getByTestId('zone-kind').selectOption('industrial');
  await expect(page.getByTestId('zone-demand')).toBeEnabled();
  await page.getByTestId('zone-demand').selectOption('3'); await page.getByTestId('apply-zone').click();
  await page.getByTestId('undo').click(); await expect(page.getByTestId('remove-zone')).toBeDisabled();
  await page.getByTestId('redo').click(); await expect(page.getByTestId('zone-kind')).toHaveValue('industrial');
  await page.getByTestId('save').click();
  await page.getByTestId('speed-4').click(); await page.getByTestId('run').click();
  await expect(page.getByTestId('zone-status')).toContainText('12 / 12 units', { timeout: 10000 });
  await expect(page.getByTestId('freight-summary')).toContainText(/\b[1-9]\d* deliveries/, { timeout: 30000 });
  await page.getByTestId('run').click();
  await expect(page.getByTestId('zone-summary')).toContainText('0 round trips');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: testInfo.outputPath('freight-delivery.png'), fullPage: true });
  await page.getByTestId('load').click(); await page.getByTestId('tool-zone').click(); await tapGrid(page, 10, 7, isMobile);
  await expect(page.getByTestId('zone-kind')).toHaveValue('industrial');
  await expect(page.getByTestId('zone-demand')).toHaveValue('3');
  await expect(page.getByTestId('freight-summary')).toContainText('0 deliveries');
  await tapGrid(page, 7, 7, isMobile); await expect(page.getByTestId('zone-kind')).toHaveValue('warehouse');
  await expect(page.getByTestId('zone-capacity')).toHaveValue('1');
  expect(errors).toEqual([]);
});

test('visitors enter, park at a zone and leave through a city exit', async ({ page, isMobile }, testInfo) => {
  test.setTimeout(75000);
  const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
  await page.goto('/'); await expect(page.getByTestId('game-canvas')).toBeVisible();
  await page.getByTestId('reset').click(); await page.getByTestId('confirm-reset').click();
  await page.getByTestId('tool-build').click(); await tapGrid(page, 7, 7, isMobile); await tapGrid(page, 11, 7, isMobile);
  await page.getByTestId('tool-build').click(); await tapGrid(page, 9, 5, isMobile); await tapGrid(page, 9, 7, isMobile);
  await setGate(page, 7, 7, 'entry', isMobile); await setGate(page, 11, 7, 'exit', isMobile);
  await page.getByTestId('tool-zone').click(); await tapGrid(page, 9, 5, isMobile);
  await page.getByTestId('zone-kind').selectOption('retail'); await page.getByTestId('zone-capacity').selectOption('1');
  await page.getByTestId('apply-zone').click(); await expect(page.getByTestId('zone-status')).toContainText('Connected');
  await page.getByTestId('tool-junction').click(); await tapGrid(page, 9, 7, isMobile);
  await page.getByTestId('green').fill('4'); await page.getByTestId('signal').click();
  await page.getByTestId('tool-zone').click(); await tapGrid(page, 9, 5, isMobile);
  await page.getByTestId('speed-4').click(); await page.getByTestId('run').click();
  await expect(page.getByTestId('zone-summary')).toContainText(/\b[1-9]\d* external visits/, { timeout: 30000 });
  await page.getByTestId('run').click();
  await expect(page.getByTestId('zone-summary')).toContainText('0 round trips');
  await page.screenshot({ path: testInfo.outputPath('external-visitors.png'), fullPage: true });
  expect(errors).toEqual([]);
});

test('creates zones, completes internal round trips and restores zone edits', async ({ page, isMobile }, testInfo) => {
  test.setTimeout(75000);
  const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
  await page.goto('/'); await expect(page.getByTestId('game-canvas')).toBeVisible();
  await page.getByTestId('reset').click(); await page.getByTestId('confirm-reset').click();
  await page.getByTestId('tool-build').click();
  await tapGrid(page, 7, 7, isMobile); await tapGrid(page, 9, 7, isMobile);
  await page.getByTestId('tool-zone').click(); await tapGrid(page, 7, 7, isMobile);
  await page.getByTestId('zone-capacity').selectOption('1'); await page.getByTestId('apply-zone').click();
  await expect(page.getByTestId('zone-status')).toContainText('No reachable');
  await tapGrid(page, 9, 7, isMobile);
  await page.getByTestId('zone-kind').selectOption('retail');
  await page.getByTestId('zone-capacity').selectOption('1'); await page.getByTestId('apply-zone').click();
  await expect(page.getByTestId('zone-status')).toContainText('Connected');
  await page.getByTestId('undo').click(); await expect(page.getByTestId('remove-zone')).toBeDisabled();
  await page.getByTestId('redo').click(); await expect(page.getByTestId('zone-kind')).toHaveValue('retail');
  await page.getByTestId('save').click();
  await page.getByTestId('speed-4').click(); await page.getByTestId('run').click();
  await expect(page.getByTestId('gateway-count')).toHaveText('0 entries · 0 exits');
  await expect(page.getByTestId('zone-summary')).toContainText(/\b[1-9]\d* round trips/, { timeout: 25000 });
  await page.getByTestId('run').click();
  await page.screenshot({ path: testInfo.outputPath('zone-trips.png'), fullPage: true });
  await page.getByTestId('load').click(); await page.getByTestId('tool-zone').click(); await tapGrid(page, 9, 7, isMobile);
  await expect(page.getByTestId('zone-kind')).toHaveValue('retail');
  await expect(page.getByTestId('zone-capacity')).toHaveValue('1');
  await page.getByTestId('remove-zone').click(); await expect(page.getByTestId('remove-zone')).toBeDisabled();
  await page.getByTestId('undo').click(); await expect(page.getByTestId('zone-kind')).toHaveValue('retail');
  expect(errors).toEqual([]);
});
test('load, build, simulate, edit, save and restore a city', async ({ page, isMobile }, testInfo) => {
  test.setTimeout(45000);
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('/');
  await expect(page.getByTestId('game-canvas')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Traffic Flow Manager' })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.getByTestId('reset').click(); await page.getByTestId('confirm-reset').click();
  await expect(page.getByTestId('road-count')).toHaveText('0 segments');
  await page.getByTestId('tool-build').click();
  await tapGrid(page, 6, 7, isMobile); await tapGrid(page, 14, 7, isMobile);
  await expect(page.getByTestId('road-count')).toHaveText('8 segments');
  await page.getByTestId('lanes').selectOption('2');
  await page.getByTestId('direction').selectOption('one');
  await page.getByTestId('apply-road').click();
  await expect(page.getByTestId('message')).toContainText('Road updated');
  await page.getByTestId('run').click(); await expect(page.getByTestId('message')).toContainText('No reachable entry-to-exit route');
  await page.getByTestId('run').click();
  await setGate(page, 6, 7, 'entry', isMobile); await setGate(page, 14, 7, 'exit', isMobile);
  await page.getByTestId('speed-2').click(); await expect(page.getByTestId('speed-2')).toHaveAttribute('aria-pressed', 'true');
  await page.getByTestId('speed-4').click(); await expect(page.getByTestId('speed-4')).toHaveAttribute('aria-pressed', 'true');
  await page.getByTestId('run').click(); await expect(page.getByTestId('state')).toHaveText('RUNNING');
  await expect.poll(async () => Number(await page.getByTestId('metric-count').textContent())).toBeGreaterThan(0);
  await expect(page.getByTestId('time')).not.toHaveText('00:00');
  await page.getByTestId('run').click(); await expect(page.getByTestId('state')).toHaveText('PAUSED');
  await frames(page, 20); const paused = await page.getByTestId('time').textContent();
  await frames(page, 30); await expect(page.getByTestId('time')).toHaveText(paused!);
  await page.getByTestId('save').click(); await expect(page.getByTestId('message')).toContainText('City saved');
  await page.getByTestId('reset').click(); await page.getByTestId('confirm-reset').click();
  await expect(page.getByTestId('road-count')).toHaveText('0 segments');
  await page.reload(); await expect(page.getByTestId('game-canvas')).toBeVisible();
  await page.getByTestId('load').click(); await expect(page.getByTestId('road-count')).toHaveText('8 segments');
  await expect(page.getByTestId('speed-4')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByTestId('lanes')).toHaveValue('2');
  await expect(page.getByTestId('direction')).toHaveValue('one');
  await page.getByTestId('tool-erase').click(); await tapGrid(page, 6.5, 7, isMobile);
  await expect(page.getByTestId('road-count')).toHaveText('7 segments');
  await page.getByTestId('demo').click();
  await page.screenshot({ path: testInfo.outputPath('city.png'), fullPage: true });
  expect(errors).toEqual([]);
});

test('cancels unfinished construction using a touch-accessible button', async ({ page, isMobile }) => {
  await page.goto('/'); await expect(page.getByTestId('game-canvas')).toBeVisible();
  const roads = await page.getByTestId('road-count').textContent();
  await page.getByTestId('tool-build').click(); await tapGrid(page, 8, 5, isMobile);
  await expect(page.getByTestId('cancel-build')).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.getByTestId('cancel-build').click();
  await expect(page.getByTestId('cancel-build')).toBeHidden();
  await expect(page.getByTestId('road-count')).toHaveText(roads!);
  await expect(page.getByTestId('tool-build')).toHaveAttribute('aria-pressed', 'true');
  await tapGrid(page, 9, 6, isMobile);
  await expect(page.getByTestId('message')).toContainText('Start placed');
  await page.getByTestId('cancel-build').click();
});

test('invalid building and junction signals keep zoom controls accessible', async ({ page, isMobile }) => {
  await page.goto('/'); await expect(page.getByTestId('game-canvas')).toBeVisible();
  await page.getByTestId('tool-build').click();
  await tapGrid(page, 8, 5, isMobile); await tapGrid(page, 9, 6, isMobile);
  await expect(page.getByTestId('message')).toContainText('horizontal or vertical');
  await page.getByTestId('tool-select').click(); await tapGrid(page, 6, 4, isMobile);
  await expect(page.getByTestId('selection')).toHaveText('Node 6,4');
  await page.getByTestId('remove-signal').click(); await expect(page.getByTestId('message')).toContainText('Signal removed');
  await page.getByTestId('green').fill('12'); await page.getByTestId('signal').click();
  await expect(page.getByTestId('message')).toContainText('Signal timing updated');
  await page.getByRole('button', { name: 'Zoom in', exact: true }).click();
  await page.getByRole('button', { name: 'Zoom out', exact: true }).click();
});

test('pan, pinch and fit preserve map selection', async ({ page, isMobile }) => {
  await page.goto('/'); await expect(page.getByTestId('game-canvas')).toBeVisible();
  await page.getByTestId('tool-pan').click();
  const point = await gridPoint(page, 10, 7);
  const beforeGesture = await page.getByTestId('game-canvas').screenshot();
  if (isMobile) {
    const session = await page.context().newCDPSession(page);
    await session.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: point.x, y: point.y, id: 0 }] });
    await session.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: point.x + 35, y: point.y + 25, id: 0 }] });
    await session.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await session.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: point.x - 25, y: point.y, id: 0 }, { x: point.x + 25, y: point.y, id: 1 }] });
    await session.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: point.x - 55, y: point.y, id: 0 }, { x: point.x + 55, y: point.y, id: 1 }] });
    await session.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  } else {
    await page.mouse.move(point.x, point.y); await page.mouse.down(); await page.mouse.move(point.x + 60, point.y + 35); await page.mouse.up();
    await page.mouse.wheel(0, -100);
  }
  await frames(page, 2);
  expect(await page.getByTestId('game-canvas').screenshot()).not.toEqual(beforeGesture);
  await page.getByRole('button', { name: 'Fit map' }).click();
  await frames(page, 2);
  await page.getByTestId('tool-select').click(); await tapGrid(page, 14, 7, isMobile);
  await expect(page.getByTestId('selection')).toHaveText('Node 14,7');
});

test('production app reloads and runs offline', async ({ page, context }) => {
  await page.goto('/');
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
    if (!navigator.serviceWorker.controller) await new Promise<void>(resolve => navigator.serviceWorker.addEventListener('controllerchange', () => resolve(), { once: true }));
  });
  await context.setOffline(true); await page.reload();
  await expect(page.getByTestId('game-canvas')).toBeVisible();
  await page.getByTestId('run').click();
  await expect.poll(async () => Number(await page.getByTestId('metric-count').textContent())).toBeGreaterThan(0);
  await context.setOffline(false);
});

test('edits a whole section, restores history and uses the contextual inspector', async ({ page, isMobile }, testInfo) => {
  await page.goto('/'); await expect(page.getByTestId('game-canvas')).toBeVisible();
  await tapGrid(page, 3.5, 4, isMobile);
  await expect(page.getByTestId('context-panel')).toBeVisible();
  await expect(page.getByTestId('section-summary')).toContainText('4 segments');
  await expect(page.getByTestId('selection')).toHaveText('Road 2,4 → 6,4');
  await expect(page.getByTestId('signal')).not.toBeVisible();
  if (isMobile) {
    const panel = (await page.getByTestId('context-panel').boundingBox())!;
    const canvas = (await page.getByTestId('game-canvas').boundingBox())!;
    expect(panel.y).toBeGreaterThanOrEqual(canvas.y + canvas.height);
  }
  await page.getByTestId('lanes').selectOption('2');
  await page.getByTestId('direction').selectOption('one'); await page.getByTestId('apply-road').click();
  await expect(page.getByTestId('message')).toContainText('4 segments in this section');
  await page.getByTestId('undo').click(); await expect(page.getByTestId('lanes')).toHaveValue('1');
  await page.getByTestId('redo').click(); await expect(page.getByTestId('lanes')).toHaveValue('2');
  await page.keyboard.press('Control+z'); await expect(page.getByTestId('lanes')).toHaveValue('1');
  await page.keyboard.press('Control+Shift+z'); await expect(page.getByTestId('lanes')).toHaveValue('2');
  await tapGrid(page, 5.5, 4, isMobile); await expect(page.getByTestId('lanes')).toHaveValue('2');
  await expect(page.getByTestId('direction')).toHaveValue('one');
  await page.screenshot({ path: testInfo.outputPath('section-inspector.png'), fullPage: true });
  await tapGrid(page, 6, 4, isMobile);
  await expect(page.getByTestId('lanes')).not.toBeVisible();
  await page.getByTestId('green').fill('12'); await page.getByTestId('signal').click();
  await page.getByTestId('undo').click(); await expect(page.getByTestId('green')).toHaveValue('6');
  await page.getByTestId('redo').click(); await expect(page.getByTestId('green')).toHaveValue('12');
  await page.getByTestId('remove-signal').click(); await expect(page.getByTestId('remove-signal')).toBeDisabled();
  await page.getByTestId('undo').click(); await expect(page.getByTestId('remove-signal')).toBeEnabled();
  await page.getByRole('button', { name: 'Close selected object settings' }).click();
  await expect(page.getByTestId('context-panel')).toBeHidden();
});

test('manages multiple gateways, main roads, signs and two-road junctions', async ({ page, isMobile }, testInfo) => {
  test.setTimeout(45000);
  await page.goto('/'); await expect(page.getByTestId('game-canvas')).toBeVisible();
  await expect(page.getByTestId('gateway-count')).toHaveText('4 entries · 4 exits');
  await setGate(page, 2, 4, 'both', isMobile);
  await expect(page.getByTestId('gateway-count')).toHaveText('4 entries · 5 exits');
  await page.getByTestId('undo').click(); await expect(page.getByTestId('gateway-role')).toHaveValue('entry');
  await page.getByTestId('redo').click(); await expect(page.getByTestId('gateway-role')).toHaveValue('both');
  await tapGrid(page, 6, 4, isMobile);
  await expect(page.getByTestId('approach-north')).toBeDisabled();
  await page.getByTestId('remove-signal').click();
  await expect(page.getByTestId('main-count')).toHaveText('2 / 2 main approaches');
  await page.getByTestId('approach-north').selectOption('main');
  await expect(page.getByTestId('apply-priority')).toBeDisabled();
  await page.getByTestId('approach-east').selectOption('yield');
  await page.getByTestId('approach-south').selectOption('stop');
  await page.getByTestId('apply-priority').click();
  await expect(page.getByTestId('message')).toContainText('Junction priority updated');
  await page.getByTestId('save').click(); await page.getByTestId('demo').click(); await page.getByTestId('load').click();
  await expect(page.getByTestId('gateway-count')).toHaveText('4 entries · 5 exits');
  await tapGrid(page, 6, 4, isMobile);
  await expect(page.getByTestId('approach-north')).toHaveValue('main');
  await expect(page.getByTestId('approach-west')).toHaveValue('main');
  await expect(page.getByTestId('approach-south')).toHaveValue('stop');
  await expect(page.getByTestId('approach-east')).toHaveValue('yield');
  await page.screenshot({ path: testInfo.outputPath('junction-management.png'), fullPage: true });
  await tapGrid(page, 6, 5, isMobile);
  await expect(page.getByTestId('selection')).toHaveText('Node 6,5');
  await expect(page.getByTestId('main-count')).toHaveText('2 / 2 main approaches');
  await page.getByTestId('apply-priority').click();
  await page.getByTestId('signal').click(); await page.getByTestId('remove-signal').click();
  await expect(page.getByTestId('approach-north')).toHaveValue('main');
  await expect(page.getByTestId('approach-south')).toHaveValue('main');
});
