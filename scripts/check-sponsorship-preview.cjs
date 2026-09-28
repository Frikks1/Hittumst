const { chromium } = require(process.env.PLAYWRIGHT_PACKAGE);
const assert = require('node:assert/strict');
const fs = require('node:fs');
(async () => {
 const browser = await chromium.launch({ headless: true, timeout: 15000 });
 const page = await browser.newPage({ viewport: { width: 390, height: 844 }, reducedMotion: 'reduce' });
 const errors = [];
 const screenshots = [];
 const startedAt = new Date().toISOString();
 page.on('pageerror', error => errors.push(error.message));
 const visible = locator => locator.filter({ visible: true });
 const button = name => visible(page.getByRole('button', { name, exact: true }));
 const text = value => visible(page.getByText(value, { exact: true }));
 async function shot(name) { const path = `tmp/sponsorship-${name}.png`; await page.screenshot({ path, fullPage: true }); screenshots.push(path); }
 async function checkText(value) { await text(value).first().waitFor({ timeout: 30000 }); }
 try {
  fs.mkdirSync('tmp', { recursive: true });
  await page.addInitScript(() => localStorage.setItem('rummal.preferences.v1', JSON.stringify({ locale: 'en', themeMode: 'light' })));
  await page.goto('http://127.0.0.1:8810/hittingar', { waitUntil: 'domcontentloaded' });
  await button('Upgrade to sponsor').first().waitFor({ timeout: 30000 });
  await checkText('0 kr · Reward pool'); await shot('list-free');
  await page.getByRole('tab', { name: /Map/ }).click();
  await page.getByRole('button').filter({ hasText: 'Kvöldkaffi í miðbænum' }).first().click();
  await checkText('0 kr · Reward pool'); await shot('map-preview');
  await button('Upgrade to sponsor').first().click();
  assert.match(await page.locator('body').innerText(), /1 × 500 kr sponsorship credit per month/);
  await shot('membership-en');
  await button('Try in demo').last().click();
  await checkText('Plebba Kóngur · Current');
  await button('Wallet').click();
  await page.getByRole('checkbox', { name: 'Kvöldkaffi í miðbænum', exact: true }).waitFor();
  await checkText('Sponsorship credit: 1,000 kr');
  await page.getByRole('textbox', { name: 'Amount', exact: true }).fill('1100');
  await button('Add test funds').click();
  await checkText('1,100 kr · Cash wallet');
  await page.getByRole('checkbox', { name: 'Kvöldkaffi í miðbænum', exact: true }).click();
  await page.getByRole('checkbox', { name: 'Cash / earnings', exact: true }).click();
  await page.getByRole('textbox', { name: 'Amount added to pool (ISK)', exact: true }).fill('1000');
  await button('Review full quote').click();
  await checkText('Service fee: 100 kr · Processing: 0 kr');
  await checkText('Total charged to cash wallet: 1,100 kr');
  await shot('cash-quote');
  await button('Confirm sponsorship').click();
  await checkText('1,000 kr · Reward pool');
  await checkText('0 kr · Cash wallet');
  await shot('funded-wallet');
  await button('Reverse before start').click();
  await checkText('0 kr · Reward pool'); await checkText('1,100 kr · Cash wallet');
  await button('Back').first().click();
  await button('Back').first().click();
  await button('New meetup').click();
  await page.getByRole('checkbox', { name: 'Online', exact: true }).click();
  await page.getByRole('textbox', { name: 'Meeting URL', exact: true }).fill('https://example.com/meetup');
  await button('Continue').click();
  await page.getByRole('textbox', { name: 'Title', exact: true }).fill('Sponsored community meetup');
  await page.getByRole('textbox', { name: 'Description', exact: true }).fill('A welcoming community conversation with a funded attendance reward.');
  await button('Continue').click();
  const start = new Date(Date.now() + 86400000 * 3);
  await page.getByRole('textbox', { name: 'Start date', exact: true }).fill(start.toISOString().slice(0, 10));
  await page.getByRole('textbox', { name: 'Start time', exact: true }).fill('18:00');
  await button('Continue').click();
  await page.getByRole('switch', { name: 'Rules attestation', exact: true }).check();
  await page.getByRole('switch', { name: 'Sponsor your own meetup', exact: true }).check();
  await button('Review full quote').click();
  await checkText('Added to pool: 500 kr');
  await checkText('Total charged to cash wallet: 0 kr');
  await shot('create-review');
  await button('Back').last().click();
  await page.getByRole('textbox', { name: 'Start time', exact: true }).fill('19:00');
  await button('Continue').click();
  assert.equal(await button('Publish and sponsor').isDisabled(), true, 'Changing the schedule requires a new quote');
  await button('Review full quote').click();
  await checkText('Added to pool: 500 kr');
  await button('Publish and sponsor').click();
  await checkText('500 kr · Reward pool');
  await text('Sponsored community meetup').first().waitFor();
  await shot('published-detail');
  await button('Manage meetup').click();
  await checkText('500 kr · Reward pool'); await shot('manage');
  page.once('dialog', dialog => dialog.accept());
  await button('Cancel meetup').click();
  await page.getByRole('checkbox', { name: 'Previous', exact: true }).click();
  await checkText('500 kr · Refunded'); await shot('my-history');
  await button('Back').first().click(); await button('Back').first().click();
  await page.getByRole('tab', { name: /Settings/ }).click();
  await page.getByRole('checkbox', { name: 'Íslenska', exact: true }).click();
  await text('Áskrift og fríðindi').click();
  await checkText('Plebba Kóngur · Núverandi'); await shot('membership-is');
  await button('Veski').click(); await checkText('Styrktarinneign: 1,000 kr');
  await shot('wallet-is');
  assert.equal(errors.length, 0, errors.join('\n'));
  const exportRoot = 'apps/mobile/dist-sponsorship-preview';
  const bundle = fs.readFileSync(`${exportRoot}/index.html`, 'utf8').match(/_expo\/static\/js\/web\/entry-[^"\s]+\.js/)?.[0];
  fs.mkdirSync('artifacts/verification', { recursive: true });
  fs.writeFileSync('artifacts/verification/sponsorship-browser.json', JSON.stringify({
   scope: 'synthetic-demo-sponsorship-web', startedAt, completedAt: new Date().toISOString(), passed: true,
   viewport: { width: 390, height: 844 }, browser: `Chromium ${browser.version()}`, realPaymentsEnabled: false,
   checks: ['English and Icelandic membership and wallet', 'Free-member upgrade entry point', 'Zero-funded pools in list and map previews', '1000 ISK cash contribution with 100 ISK service fee and no pool deduction', 'Pre-start reversal restores the full cash charge', '500 ISK credit-funded atomic self-publication', 'Schedule edit invalidates the previous quote', 'Funded pool on published details and management', 'Cancellation keeps 500 ISK refunded history in My Hittingar', 'Cancellation restores sponsorship credit', 'No browser runtime errors'].map(name => ({ name, passed: true })),
   screenshots, pageErrors: errors, exportBundle: bundle ? { path: `${exportRoot}/${bundle}`, sha256: require('node:crypto').createHash('sha256').update(fs.readFileSync(`${exportRoot}/${bundle}`)).digest('hex') } : null,
  }, null, 2) + '\n');
  console.log('PASS: 390×844 English free/paid membership, visible pools, 1,000+100 cash quote, contribution/reversal, 500-credit self-publication, map/manage/My Hittingar pool visibility, cancellation/refund history, Icelandic membership/wallet, and no browser runtime errors.');
 } catch (error) {
  console.error((await page.locator('body').innerText()).slice(0,12000));
  await shot('qa-error'); throw error;
 } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
