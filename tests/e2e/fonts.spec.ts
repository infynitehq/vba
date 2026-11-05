import { test, expect } from '@playwright/test';

test('the app and isolated player load the same local font weights', async ({
  page,
}) => {
  await page.goto('/');
  await page.evaluate(() => {
    const iframe = document.createElement('iframe');
    iframe.title = 'Player font test';
    iframe.src = './player.html';
    document.body.append(iframe);
  });
  const player = page
    .getByTitle('Player font test')
    .contentFrame()
    .locator('body');
  await expect(player).toHaveCSS('font-family', '"Ioskeley Mono", monospace');

  for (const body of [page.locator('body'), player]) {
    const fonts = await body.evaluate(async (element) => {
      const document = element.ownerDocument;
      return Promise.all(
        [400, 500, 600, 700].map(async (weight) => {
          const faces = await document.fonts.load(
            `${weight} 14px "Ioskeley Mono"`,
          );
          return faces.map((face) => ({
            weight: face.weight,
            status: face.status,
          }));
        }),
      );
    });
    expect(fonts).toEqual(
      [400, 500, 600, 700].map((weight) => [
        { weight: String(weight), status: 'loaded' },
      ]),
    );
  }
});
