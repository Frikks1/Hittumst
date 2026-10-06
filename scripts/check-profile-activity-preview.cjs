const { chromium } = require(process.env.PLAYWRIGHT_PACKAGE);
const assert = require('node:assert/strict');
const fs = require('node:fs');

// Run against a development-only demo export. With bypassAuth=false, set
// MOBILE_PREVIEW_VERIFY_LOCATION=true to check the real location gate first.
// All actions below use synthetic demo members, never a connected account.
(async () => {
  const browser = await chromium.launch({ headless: true });
  const origin = process.env.MOBILE_PREVIEW_URL || 'http://127.0.0.1:8811';
  const errors = [];
  fs.mkdirSync('tmp/ux-preview', { recursive: true });
  const settleImages = async page => {
    await page.evaluate(() => document.fonts.ready);
    await page.waitForFunction(() => [...document.images].every(image => image.complete && image.naturalWidth > 0), null, { timeout: 15000 });
  };
  try {
    for (const [width, locale, textScale] of [[390, 'en', 1], [360, 'is', 1.3], [768, 'en', 1]]) {
      const page = await browser.newPage({ viewport: { width, height: 844 }, reducedMotion: 'reduce', geolocation: { latitude: 64.1466, longitude: -21.9426, accuracy: 10 }, permissions: ['geolocation'] });
      page.on('pageerror', error => errors.push(error.message));
      await page.addInitScript(({ locale, textScale }) => {
        localStorage.setItem('rummal.preferences.v1', JSON.stringify({ locale, themeMode: 'dark' }));
        localStorage.setItem('rummal.appearance.v1', JSON.stringify({ darkPreset: 'charcoal', accent: 'amber', textScale, discoveryLayout: 'dense', reducedMotion: true }));
      }, { locale, textScale });
      if (process.env.MOBILE_PREVIEW_VERIFY_LOCATION === 'true') {
        await page.goto(origin + '/location-gate');
        await page.getByRole('button', { name: locale === 'en' ? 'Verify again' : 'Staðfesta aftur', exact: true }).click();
      } else await page.goto(origin + '/discover');
      await page.getByRole('button', { name: /Bjarni, 31/ }).waitFor();
      await settleImages(page);
      await page.screenshot({ path: `tmp/ux-preview/discover-${width}-${locale}.png` });
      await page.getByRole('button', { name: /Bjarni, 31/ }).click();
      const tap = page.getByRole('button', { name: locale === 'en' ? 'Tap' : 'Senda snertingu', exact: true });
      await tap.waitFor();
      const bounds = await tap.boundingBox();
      assert(bounds && bounds.y >= 0 && bounds.y + bounds.height <= 844, 'Tap stays visible in the action footer');
      await tap.click();
      const sent = page.getByRole('button', { name: locale === 'en' ? 'Tap sent' : 'Snerting send', exact: true });
      await sent.waitFor();
      assert(await sent.isDisabled(), 'Successful tap prevents accidental repeat sends');
      await settleImages(page);
      await page.screenshot({ path: `tmp/ux-preview/profile-${width}-${locale}.png` });
      await page.getByRole('button', { name: locale === 'en' ? 'Back' : 'Til baka', exact: true }).first().click();
      await page.getByRole('button', { name: locale === 'en' ? /Interest/ : /Áhugi/ }).click();
      await page.getByRole('tab', { name: /^(Views|Skoðanir) \d/ }).waitFor();
      await settleImages(page);
      await page.screenshot({ path: `tmp/ux-preview/views-${width}-${locale}.png` });
      await page.getByRole('tab', { name: /^(Taps|Snertingar) \d/ }).click();
      await page.getByRole('button', { name: locale === 'en' ? 'List view' : 'Listasýn', exact: true }).click();
      await settleImages(page);
      await page.screenshot({ path: `tmp/ux-preview/taps-list-${width}-${locale}.png` });
      // Client navigation keeps the synthetic service instance, including blocked members.
      await page.getByRole('button', { name: locale === 'en' ? 'Back' : 'Til baka', exact: true }).first().click();
      await page.getByRole('tab', { name: /Meetups|Hittumst/ }).click();
      await page.getByRole('button', { name: locale === 'en' ? 'New meetup' : 'Nýr hittingur', exact: true }).waitFor();
      await page.getByRole('button', { name: /^Kvöldkaffi í miðbænum/ }).waitFor();
      await settleImages(page);
      await page.screenshot({ path: `tmp/ux-preview/meetups-${width}-${locale}.png` });
      await page.getByRole('button', { name: locale === 'en' ? 'New meetup' : 'Nýr hittingur', exact: true }).click();
      await page.screenshot({ path: `tmp/ux-preview/create-${width}-${locale}.png` });
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1);
      assert(!overflow, 'No horizontal document overflow');
      await page.close();
    }
    assert.equal(errors.length, 0, errors.join('\n'));
    console.log('PASS: discovery, profile taps, views/taps grid and list, meetups/create at 390px, 360px with larger Icelandic text, and 768px. No runtime errors.');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
