const { chromium } = require(process.env.PLAYWRIGHT_PACKAGE);
const assert = require('node:assert/strict');
const fs = require('node:fs');

// Only use an explicitly marked local synthetic demo export.
(async () => {
  const browser = await chromium.launch({ headless: true });
  const origin = process.env.MOBILE_PREVIEW_URL || 'http://127.0.0.1:8821';
  const output = 'tmp/showcase-preview';
  fs.mkdirSync(output, { recursive: true });
  const errors = [];
  try {
    for (const [width, locale, textScale] of [[390, 'en', 1], [360, 'is', 1.3]]) {
      const context = await browser.newContext({ viewport: { width, height: 844 }, reducedMotion: 'reduce' });
      const page = await context.newPage();
      page.on('pageerror', error => errors.push(error.message));
      await page.addInitScript(({ locale, textScale }) => {
        localStorage.setItem('rummal.preferences.v1', JSON.stringify({ locale, themeMode: 'dark' }));
        localStorage.setItem('rummal.appearance.v1', JSON.stringify({ darkPreset: 'charcoal', accent: 'amber', textScale, discoveryLayout: 'dense', reducedMotion: true }));
      }, { locale, textScale });
      const en = locale === 'en';
      const text = (english, icelandic) => en ? english : icelandic;
      const button = name => page.getByRole('button', { name, exact: true });
      const field = name => page.getByRole('textbox', { name, exact: true });
      const shot = async name => {
        await page.evaluate(() => document.fonts.ready);
        assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1), false, `${name}: no horizontal overflow`);
        await page.screenshot({ path: `${output}/${name}-${width}-${locale}.png`, fullPage: true });
      };
      await page.goto(`${origin}/showcases`);
      await button(text('Create a showcase', 'Búa til sýningarskáp')).first().waitFor();
      await page.getByText('Out and about', { exact: true }).waitFor();
      assert.match(await page.locator('body').innerText(), /Demo mode|Sýnihamur|Sýnishamur/, 'Synthetic demo must be clearly marked');
      await shot('manager');
      await button(text('Create a showcase', 'Búa til sýningarskáp')).click();
      await page.getByRole('checkbox', { name: text('What I love', 'Það sem ég elska'), exact: true }).click();
      await button(text('Create a showcase', 'Búa til sýningarskáp')).last().click();
      await field(text('Title', 'Titill')).waitFor();
      await field(text('Title', 'Titill')).fill(text('My showcase walkthrough', 'Sýningarskápurinn minn'));
      await field(text('Introduction (optional)', 'Inngangur (valfrjálst)')).fill(text('A few things that make me happy.', 'Það sem gleður mig.'));
      await button(text('Add a story', 'Bæta við sögu')).click();
      await field(text('Story title', 'Heiti sögunnar')).fill(text('Coffee and company', 'Kaffi og félagsskapur'));
      await field(text('Tell the story', 'Segðu söguna')).fill(text('A walk, a good coffee, and a long conversation.', 'Göngutúr, gott kaffi og langt samtal.'));
      await button(text('Save draft', 'Vista drög')).click();
      await page.getByText(text('Draft saved.', 'Drög vistuð.'), { exact: true }).waitFor();
      await shot('editor');
      await button(text('Publish', 'Birta')).click();
      const publishConfirm = button(text('Publish for these viewers', 'Birta með þessum áhorfendum'));
      assert.equal(await publishConfirm.getAttribute('aria-disabled'), 'true', 'Publishing requires an explicit audience choice');
      await page.getByRole('checkbox', { name: text('Everyone who can see my profile', 'Allir sem mega sjá prófílinn minn'), exact: true }).click();
      await publishConfirm.click();
      await page.getByText(text('Publication saved. Entries awaiting approval are visible only to you.', 'Birting vistuð. Færslur sem bíða samþykkis eru aðeins sýnilegar þér.'), { exact: true }).waitFor();
      await button(text('Preview', 'Forskoða')).click();
      await page.getByText(text('Coffee and company', 'Kaffi og félagsskapur'), { exact: true }).waitFor();
      await shot('published');
      await button(text('Edit', 'Breyta')).first().click();
      const savedTitle = await field(text('Title', 'Titill')).inputValue();
      assert.equal(savedTitle, text('My showcase walkthrough', 'Sýningarskápurinn minn'));
      // Client navigation preserves synthetic demo state; reload deliberately resets it.
      await page.getByRole('button', { name: /Back|Til baka/, exact: true }).first().click();
      await button(text('Create a showcase', 'Búa til sýningarskáp')).first().waitFor();
      await page.waitForFunction(label => {
        const matches = [...document.querySelectorAll('button[aria-label]')].filter(node => node.getAttribute('aria-label') === label);
        return matches.length > 1 && !matches[matches.length - 1].disabled;
      }, text('Create a showcase', 'Búa til sýningarskáp'));
      await button(text('Approve this publication', 'Samþykkja þessa birtingu')).first().click();
      await page.getByText(text('Response saved.', 'Svar vistað.'), { exact: true }).waitFor();
      await shot('approval');
      await page.getByRole('button', { name: /^My weekend crew,/ }).click();
      await button(text('Edit', 'Breyta')).first().click();
      await field(text('Group name in this story', 'Heiti hóps í þessari sögu')).fill(text('Our hiking crew', 'Gönguhópurinn okkar'));
      await field(text('Minimum age (optional)', 'Lágmarksaldur (valfrjálst)')).fill('25');
      await field(text('Maximum age (optional)', 'Hámarksaldur (valfrjálst)')).fill('60');
      await field(text('Minimum sponsorship contribution (ISK, optional)', 'Lágmarksstyrkur (ISK, valfrjálst)')).fill('5000');
      await page.getByRole('checkbox', { name: 'Sunday walks by the harbour', exact: true }).last().click();
      await button(text('Save draft', 'Vista drög')).click();
      await page.getByText(text('Draft saved.', 'Drög vistuð.'), { exact: true }).waitFor();
      await button(text('Preview', 'Forskoða')).click();
      await page.getByText(text('Our hiking crew', 'Gönguhópurinn okkar'), { exact: true }).waitFor();
      await page.getByText(/5[,.]000 ISK/).waitFor();
      await shot('group-requirements');
      assert.equal(errors.length, 0, errors.join('\n'));
      await context.close();
    }
    console.log(JSON.stringify({ passed: true, locales: ['en', 'is'], widths: [390, 360], scenarios: ['private draft', 'explicit audience', 'publication', 'preview', 'friend approval', 'group name and joining descriptions'], errors }));
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
