const { chromium } = require(
  process.env.PLAYWRIGHT_PACKAGE ||
    'C:/Users/frikk/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright',
);
const assert = require('node:assert/strict');
const fs = require('node:fs');

// This script is restricted to a visibly marked, local synthetic demo export.
// It never opens or mutates a connected account or remote project.
(async () => {
  const origin = process.env.MOBILE_PREVIEW_URL || 'http://127.0.0.1:8828';
  const parsed = new URL(origin);
  assert(
    ['127.0.0.1', 'localhost'].includes(parsed.hostname),
    'Only a local synthetic export may be tested',
  );
  const output = 'tmp/strax-preview';
  fs.mkdirSync(output, { recursive: true });
  const browser = await chromium.launch({ headless: true });
  const errors = [];
  const scenarios = [];
  try {
    for (const [width, locale, textScale] of [
      [390, 'en', 1],
      [360, 'is', 1.3],
      [1280, 'en', 1],
    ]) {
      const context = await browser.newContext({
        viewport: { width, height: 900 },
        reducedMotion: 'reduce',
      });
      const page = await context.newPage();
      page.setDefaultTimeout(15_000);
      page.on('pageerror', (error) => errors.push({ width, locale, message: error.message }));
      page.on('dialog', (dialog) => dialog.accept());
      await page.addInitScript(
        ({ locale, textScale }) => {
          localStorage.setItem(
            'rummal.preferences.v1',
            JSON.stringify({ locale, themeMode: 'dark' }),
          );
          localStorage.setItem(
            'rummal.appearance.v1',
            JSON.stringify({
              darkPreset: 'charcoal',
              accent: 'amber',
              textScale,
              discoveryLayout: 'dense',
              reducedMotion: true,
            }),
          );
        },
        { locale, textScale },
      );
      const en = locale === 'en';
      const c = (english, icelandic) => (en ? english : icelandic);
      const button = (name) => page.getByRole('button', { name, exact: typeof name === 'string' });
      const field = (name) => page.getByRole('textbox', { name, exact: true });
      const back = () => button(c('Back', 'Til baka')).first().click();
      const primarySection = () =>
        page.getByRole('tab', { name: new RegExp(`${c('Meetups', 'Hittingar')}$`) });
      const secondarySection = () => page.getByRole('tab', { name: /Strax$/ });
      const screenshot = async (name) => {
        await page.evaluate(() => document.fonts.ready);
        const overflow = await page.evaluate(
          () => document.documentElement.scrollWidth > innerWidth + 1,
        );
        assert.equal(overflow, false, `${name} ${width}/${locale}: no horizontal page overflow`);
        await page.screenshot({ path: `${output}/${name}-${width}-${locale}.png`, fullPage: true });
      };
      const mainMeetups = async () => {
        if (width >= 980)
          await page.getByRole('link', { name: c('Meetups', 'Hittingar'), exact: true }).click();
        else await page.getByRole('tab', { name: 'Hittumst', exact: false }).click();
        await primarySection().waitFor();
      };

      // Create a synthetic group through the normal UI, then retain that in-memory
      // demo state throughout client navigation. There are initially no friends.
      await page.goto(`${origin}/groups`);
      await field(c('Group name', 'Heiti hóps')).waitFor();
      assert.match(
        await page.locator('body').innerText(),
        /Demo mode|Sýnihamur/,
        'Synthetic demo is visibly marked before any mutation',
      );
      await field(c('Group name', 'Heiti hóps')).fill('Strax demo crew');
      await button(c('Create', 'Búa til')).click();
      await page.waitForURL(/\/groups\/[^/?]+/);
      const groupPath = new URL(page.url()).pathname;
      await back();
      await field(c('Group name', 'Heiti hóps')).waitFor();
      await back();
      await button(/^Bjarni, 31/).waitFor();
      await button(en ? /^\d+ Strax happening now$/ : /^\d+ Strax í boði núna$/).waitFor();
      const bubble = button(/^Strax: Kaffi og spjall núna\?/);
      await bubble.waitFor();
      assert.equal(
        await bubble.locator('button, [role="button"]').count(),
        0,
        'Grid bubble has its own sibling press target',
      );
      await screenshot('nearby');
      await button(/^Bjarni, 31/).click();
      await button(c('Send message', 'Senda skilaboð')).waitFor();
      assert.match(page.url(), /\/profile\/p-bjarni/, 'Tile body opens the profile');
      await back();
      await bubble.waitFor();
      await bubble.click();
      await button(c('Join', 'Taka þátt')).waitFor();
      assert.match(page.url(), /\/hittingar\/strax\//, 'Small bubble opens Strax directly');
      await screenshot('open-detail');
      await back();
      await button(en ? /^\d+ Strax happening now$/ : /^\d+ Strax í boði núna$/).click();
      await button(c('Create Strax', 'Búa til Strax')).waitFor();
      await button(/^Strax: Kaffi og spjall núna\?\./).waitFor();
      await screenshot('counter-shortcut');

      await mainMeetups();
      assert.equal(
        await primarySection().getAttribute('aria-selected'),
        'true',
        'Main navigation prioritizes Hittingar and exposes selection to assistive technology',
      );
      assert.equal(await secondarySection().getAttribute('aria-selected'), 'false');
      await page.getByRole('tab', { name: c('List', 'Listi'), exact: true }).waitFor();
      await screenshot('hittingar-default');
      await secondarySection().click();
      await button(c('Create Strax', 'Búa til Strax')).waitFor();
      await button(/^Strax: Kaffi og spjall núna\?\./).waitFor();
      await screenshot('strax-list');
      await button(/^Strax: Vantar einn í leikjapartý\./).click();
      await field(
        c('Short note to the host (optional)', 'Stutt skilaboð til höfundar (valfrjálst)'),
      ).waitFor();
      const apply = button(c('Apply to join', 'Sækja um þátttöku'));
      assert(await apply.isDisabled(), 'Rules acknowledgement is required');
      await page
        .getByRole('checkbox', {
          name: c(
            'I have read the rules and meet the requirements.',
            'Ég hef lesið reglur og uppfylli skilyrðin.',
          ),
          exact: true,
        })
        .click();
      assert.equal(
        await field(
          c('Short note to the host (optional)', 'Stutt skilaboð til höfundar (valfrjálst)'),
        ).inputValue(),
        '',
        'Application introduction stays optional',
      );
      assert.equal(await apply.isDisabled(), false);
      await apply.click();
      await button(c('Withdraw application', 'Draga umsókn til baka')).waitFor();
      await screenshot('application-pending');
      await button(c('Withdraw application', 'Draga umsókn til baka')).click();
      await apply.waitFor();
      await back();
      await button(/^Strax: Kaffi og spjall núna\?\./).click();
      await button(c('Join', 'Taka þátt')).click();
      await button(c('Leave', 'Hætta við þátttöku')).waitFor();
      await screenshot('joined');
      await button(c('Leave', 'Hætta við þátttöku')).click();
      await button(c('Join', 'Taka þátt')).waitFor();

      // Change the device wall clock after the server/monotonic anchor. The demo
      // service retains its original clock, which models an unaffected server.
      await page.evaluate(() => {
        const realNow = Date.now;
        globalThis.__straxRealNow = realNow;
        Date.now = () => realNow() + 365 * 24 * 60 * 60 * 1000;
      });
      await page.waitForTimeout(1_100);
      assert(
        await button(c('Join', 'Taka þátt')).isVisible(),
        'Device clock jumps do not prematurely expire an anchored activity',
      );
      assert.equal(
        await page
          .getByText(c('This Strax has expired', 'Þetta Strax er útrunnið'), { exact: true })
          .count(),
        0,
      );
      await page.evaluate(() => {
        Date.now = globalThis.__straxRealNow;
        delete globalThis.__straxRealNow;
      });
      await back();
      await button(/^Strax: Einn drykkur eftir vinnu\./).click();
      await page
        .getByText(
          en
            ? /^1 participants? · All places taken$/
            : /^1 (þátttakandi|þátttakendur) · Öll pláss tekin$/,
        )
        .waitFor();
      assert.equal(
        await button(c('Apply to join', 'Sækja um þátttöku')).count(),
        0,
        'Full activities cannot take new applications',
      );
      await back();

      await button(c('Create Strax', 'Búa til Strax')).click();
      await field(c('Activity name *', 'Heiti athafnar *')).waitFor();
      assert.equal(
        await page
          .getByRole('checkbox', {
            name: c('I approve applications', 'Ég samþykki umsóknir'),
            exact: true,
          })
          .getAttribute('aria-checked'),
        'true',
      );
      assert(
        await field(c('Address (optional)', 'Heimilisfang (valfrjálst)')).isVisible(),
        'Street address is optional and discoverable',
      );
      await field(c('Activity name *', 'Heiti athafnar *')).fill(
        c('Quick browser game', 'Stutt prufuleikjapartý'),
      );
      await button(
        c('Use “DM me for more info”', 'Nota „Sendu mér skilaboð til að fá nánari upplýsingar“'),
      ).click();
      assert.equal(
        await field(c('Short description *', 'Stutt lýsing *')).inputValue(),
        c('DM me for more info.', 'Sendu mér skilaboð til að fá nánari upplýsingar.'),
      );
      await field(
        c('How many people do you need? (optional)', 'Hversu marga vantar? (valfrjálst)'),
      ).fill('1');
      await screenshot('create-fields');
      await button(
        new RegExp(c('Share with friends and groups', 'Senda til vina og hópa')),
      ).click();
      const allFriends = page.getByRole('checkbox', {
        name: c('All accepted friends', 'Allir samþykktir vinir'),
        exact: true,
      });
      await allFriends.waitFor();
      assert(
        await allFriends.isDisabled(),
        'Empty accepted-friend list cannot pretend to send invitations',
      );
      await page.getByRole('checkbox', { name: 'Strax demo crew', exact: true }).click();
      await screenshot('share-picker');
      await button(c('Publish Strax', 'Birta Strax')).click();
      await page
        .getByText(c('Your Strax is published!', 'Strax er birt!'), { exact: true })
        .waitFor();
      await page.getByText(c('Invitations sent', 'Boð send'), { exact: true }).waitFor();
      await screenshot('published');
      await button(c('View Strax', 'Skoða Strax')).click();
      await button(c('Close Strax', 'Loka Strax')).waitFor();
      const ownPath = new URL(page.url()).pathname;
      await screenshot('host-management');
      await back();
      await button(c('Create Strax', 'Búa til Strax')).waitFor();
      await button(c('Invitations and updates', 'Boð og uppfærslur')).count();
      await page
        .getByRole('checkbox', {
          name: c('Invitations and updates', 'Boð og uppfærslur'),
          exact: true,
        })
        .click();
      await page
        .getByText(
          c('No Strax invitations or updates yet.', 'Engin Strax-boð eða uppfærslur enn.'),
          { exact: true },
        )
        .waitFor();
      await screenshot('notifications-empty');
      await button(c('Create Strax', 'Búa til Strax')).click();
      await page
        .getByText(
          c(
            'You already have an active Strax. View it or close it first.',
            'Þú ert þegar með virkt Strax. Skoðaðu það eða lokaðu því fyrst.',
          ),
          { exact: true },
        )
        .waitFor();
      assert(
        await button(c('Publish Strax', 'Birta Strax')).isDisabled(),
        'One active Strax per host is explicit in the creator',
      );
      await screenshot('already-active');
      await button(c('View Strax', 'Skoða Strax')).click();
      assert.equal(new URL(page.url()).pathname, ownPath);
      await button(c('Close Strax', 'Loka Strax')).click();
      await page
        .getByText(c('The host closed this Strax', 'Höfundur hefur lokað þessu Strax'), {
          exact: true,
        })
        .first()
        .waitFor();
      await screenshot('closed');
      await button(c('Happening now', 'Í boði núna')).click();
      await button(c('Create Strax', 'Búa til Strax')).waitFor();
      assert.equal(
        await button(
          new RegExp(`^Strax: ${c('Quick browser game', 'Stutt prufuleikjapartý')}`),
        ).count(),
        0,
        'Closed listing disappears immediately',
      );

      // Reach the same synthetic group through the regular sidebar on desktop.
      // On mobile, the group route is checked in a separate explicitly marked
      // local context below, since no direct Groups tab exists in the shell.
      if (width >= 980) {
        await page.getByRole('link', { name: 'Groups', exact: true }).click();
        await button('Open group').click();
        const messageCard = button(/^Strax: Quick browser game\./);
        await messageCard.waitFor();
        await screenshot('group-structured-card');
        await messageCard.click();
        assert.equal(
          new URL(page.url()).pathname,
          ownPath,
          'Structured group message navigates to the shared Strax',
        );
      }
      assert.equal(errors.length, 0, JSON.stringify(errors));
      scenarios.push({ width, locale, textScale, groupPath, passed: true });
      await context.close();
    }
    // Simulate returning after four hours. Both the synthetic server clock and
    // foreground timers advance; previously joined members retain a friendly
    // expired detail while all participation controls disappear.
    const expiryContext = await browser.newContext({
      viewport: { width: 390, height: 900 },
      reducedMotion: 'reduce',
    });
    const expiryPage = await expiryContext.newPage();
    expiryPage.on('pageerror', (error) =>
      errors.push({ width: 390, locale: 'en', message: error.message }),
    );
    await expiryPage.clock.install({ time: new Date('2026-10-13T12:00:00Z') });
    await expiryPage.addInitScript(() => {
      localStorage.setItem(
        'rummal.preferences.v1',
        JSON.stringify({ locale: 'en', themeMode: 'dark' }),
      );
      localStorage.setItem('rummal.appearance.v1', JSON.stringify({ reducedMotion: true }));
    });
    await expiryPage.goto(`${origin}/hittingar/strax/81000000-0000-4000-8000-000000000001`);
    await expiryPage.getByRole('button', { name: 'Join', exact: true }).waitFor();
    assert.match(
      await expiryPage.locator('body').innerText(),
      /Demo mode/,
      'Expiry simulation stays inside synthetic demo',
    );
    await expiryPage.getByRole('button', { name: 'Join', exact: true }).click();
    await expiryPage.getByRole('button', { name: 'Leave', exact: true }).waitFor();
    await expiryPage.clock.fastForward(4 * 60 * 60 * 1000 + 1000);
    await expiryPage.clock.runFor(1000);
    await expiryPage.getByText('This Strax has expired', { exact: true }).first().waitFor();
    assert.equal(
      await expiryPage
        .getByRole('button', { name: /^(Join|Leave|Apply to join|Withdraw application)$/ })
        .count(),
      0,
      'Expired activity cannot accept participation actions',
    );
    assert.equal(
      await expiryPage.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1),
      false,
    );
    await expiryPage.screenshot({ path: `${output}/expired-390-en.png`, fullPage: true });
    await expiryPage.getByRole('button', { name: 'Happening now', exact: true }).click();
    await expiryPage.getByText('No Strax happening right now', { exact: true }).waitFor();
    await expiryPage.getByRole('tab', { name: 'Nearby', exact: false }).click();
    await expiryPage.getByRole('button', { name: '0 Strax happening now', exact: true }).waitFor();
    await expiryPage.getByRole('button', { name: /^Bjarni, 31/ }).waitFor();
    assert.equal(
      await expiryPage.getByRole('button', { name: /^Strax:/ }).count(),
      0,
      'Expired grid bubbles disappear',
    );
    await expiryPage.screenshot({ path: `${output}/expired-counter-390-en.png`, fullPage: true });
    await expiryContext.close();
    assert.equal(errors.length, 0, JSON.stringify(errors));
    console.log(
      JSON.stringify({
        passed: true,
        scenarios,
        pageErrors: errors,
        output,
        limitations: [
          'Accepted-friend delivery is covered by service tests; the browser verifies its empty state because the UI has no synthetic recipient switch.',
          'Exact expiry boundary is additionally covered by unit tests; browser checks return-after-four-hours and incorrect-device-clock scenarios.',
        ],
      }),
    );
  } finally {
    await browser.close();
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
