'use strict';
// S1: an ordinary visit, with client-side navigation the whole way: the home page, a story, each of the five main links
// (on a phone through the Menu), an analysis from the research hub and the privacy page. Each page view is sent with its
// clean path and the previous page's reading figures, and each page is recorded except the runner search, which never
// is. Then the home page's first screen on the two common iPhone sizes (the plan button and the other two ways to start
// show without scrolling, and that button is the only orange control there), the hero at 200% zoom, and its
// course-and-goal form, which goes to the planner by GET with and without the page's JavaScript, and the keypad's dot
// typing a colon in time fields (the home goal, a tool's time, a pace and the split check). Last, the units
// switch: it works on /research opened directly, and every page served with the inert placeholder reads the same in
// miles and kilometres. Then a course page's contents link, a link away and Back.
const fs = require('node:fs');
const path = require('node:path');
const { SITE, wiggle, openMenu, type } = require('../browser.cjs');
const { experimentPlant } = require('../inspect.cjs');

const DESKTOP = { viewport: { width: 1280, height: 900 } };
const PHONE = { viewport: { width: 390, height: 844 }, mobile: true };
// The five main links, in order, then the Menu's quieter line (components/SiteNav.tsx).
const MAIN = [['Plan your race', '/tools/plan'], ['Analyze a past race', '/runners'], ['Courses', '/courses'], ['Tools', '/tools'], ['Research', '/research']];
const MORE = [['About', '/about'], ['Request an analysis', '/request-analysis'], ['Open data ↗', 'https://github.com/koolkam00/htw-live-study/releases']];
const BLOCKED = ['/runners'];

async function browse(h, device) {
  const run = await h.run('visit', { ...device, plant: experimentPlant() });
  const page = await run.newPage();
  const click = async (selector, pathname) => {
    if (selector.startsWith('nav.main-nav')) await openMenu(page);
    await page.locator(selector).first().scrollIntoViewIfNeeded();
    await page.locator(selector).first().click();
    await page.waitForURL(url => pathname instanceof RegExp ? pathname.test(new URL(url).pathname) : new URL(url).pathname === pathname, { timeout: 15000 });
    await page.waitForTimeout(1200);
    await wiggle(page, 6);
  };
  await page.goto(SITE + '/', { waitUntil: 'load' });
  h.check('the recorder starts on /', await run.waitForRecording(page));
  await openMenu(page);
  const links = await page.evaluate(() => [...document.querySelectorAll('#site-menu a')].map(a => ({ text: a.textContent.trim(), href: a.getAttribute('href'), primary: a.classList.contains('nav-primary'), shown: a.getClientRects().length > 0, more: !!a.closest('.nav-more') })));
  const expected = [...MAIN, ...(device.mobile ? MORE : [])];
  const shown = links.filter(l => l.shown);
  h.check(`the navigation shows the five links in order${device.mobile ? ', then About, Request an analysis and Open data on the Menu\'s quieter line' : ' and nothing else'}`,
    JSON.stringify(shown.map(l => [l.text, l.href])) === JSON.stringify(expected) && shown.filter(l => l.more).length === (device.mobile ? MORE.length : 0), shown);
  h.check('Plan your race is the primary (orange) link', links[0] && links[0].primary && links.filter(l => l.primary).length === 1, links);
  if (device.mobile) await page.locator('.site-header .nav-toggle').click(); // close it again
  for (let i = 0; i < 6; i++) { await page.mouse.wheel(0, 700); await page.waitForTimeout(120); }
  await click('a.story-card', /^\/stories\/[a-z-]+$/);
  for (let i = 0; i < 6; i++) { await page.mouse.wheel(0, 800); await page.waitForTimeout(120); }
  for (const [, href] of MAIN) {
    const from = new URL(page.url()).pathname, left = Date.now();
    await click(`nav.main-nav a[href="${href}"]`, href);
    // Leaving the runner search, the recorder starts again with a full snapshot of the next page.
    if (BLOCKED.includes(from)) h.check(`recording resumes on ${href} after the runner search`, await run.waitForRecording(page, left));
  }
  await click('main a[href^="/analyses/"]', /^\/analyses\/[a-z-]+$/);
  await click('footer a[href="/privacy"]', '/privacy');
  h.check('the last page is recorded', await run.flush(page));
  await page.waitForTimeout(3500); // the next batch of events
  await run.close();

  const views = run.events().filter(({ e }) => e.event === '$pageview').map(({ e }) => e.properties);
  const paths = views.map(p => p.$pathname);
  h.check('a page view for each page, in order', /^\/,\/stories\/[a-z-]+,\/tools\/plan,\/runners,\/courses,\/tools,\/research,\/analyses\/[a-z-]+,\/privacy$/.test(paths.join()), paths);
  h.check('each page view after the first names the previous page and its reading figures',
    views.slice(1).every((p, i) => p.$prev_pageview_pathname === paths[i] && Number.isInteger(p.$prev_pageview_duration) && typeof p.$prev_pageview_max_scroll_percentage === 'number'),
    views.map(p => [p.$pathname, p.$prev_pageview_pathname, p.$prev_pageview_duration, p.$prev_pageview_max_scroll_percentage]));
  h.check('home page sections are counted', run.events().some(({ e }) => e.event === 'section_viewed' && e.properties.$pathname === '/'));
  h.inspect.invariants(run); // fills run.recordedPages
  const recorded = [...run.recordedPages.keys()];
  h.check('every page but the runner search was recorded', paths.filter(p => !BLOCKED.includes(p)).every(p => recorded.includes(p)) && !recorded.some(p => BLOCKED.includes(p)), { pageviews: paths, recorded });
}

// The first phone screen, at the default text size: the title, the plan form with its button and the other two ways
// to start all show without scrolling (the 57 px header included), and the plan button is the only orange control.
const FIRST_SCREENS = [{ width: 390, height: 664 }, { width: 402, height: 714 }];
async function firstScreen(h) {
  for (const viewport of FIRST_SCREENS) {
    const run = await h.run(`${viewport.width} x ${viewport.height}`, { viewport, mobile: true });
    const page = await run.newPage();
    await page.goto(SITE + '/', { waitUntil: 'load' });
    await page.evaluate(() => document.fonts.ready);
    await page.waitForTimeout(800);
    const seen = await page.evaluate(() => {
      const bottom = selector => [...document.querySelectorAll(selector)].map(el => Math.round(el.getBoundingClientRect().bottom));
      const orange = [...document.querySelectorAll('a, button, select, input:not([type=hidden])')].filter(el => {
        const r = el.getBoundingClientRect();
        return r.width && r.height && r.top < innerHeight && r.bottom > 0 && getComputedStyle(el).backgroundColor === 'rgb(255, 91, 46)';
      }).map(el => el.textContent.trim());
      return { innerHeight, scrollY, title: bottom('#hero-title'), button: bottom('.home-plan-button'), doors: bottom('.home-door-link'), orange };
    });
    await run.close();
    const fits = seen.scrollY === 0 && seen.button.length === 1 && seen.doors.length === 2 && [...seen.title, ...seen.button, ...seen.doors].every(b => b <= seen.innerHeight);
    h.check(`${viewport.width} x ${viewport.height}: the title, the Plan your race button and both other ways to start end above the screen's bottom`, fits, seen);
    h.check(`${viewport.width} x ${viewport.height}: Plan your race is the only orange control on the first screen`, JSON.stringify(seen.orange) === '["Plan your race"]', seen.orange);
    h.note(`${viewport.width} x ${viewport.height}: bottoms (px of ${seen.innerHeight}) title ${seen.title}, button ${seen.button}, doors ${seen.doors.join(' and ')}`);
  }
}

// 200% zoom halves the page's width in CSS pixels: 390 and 402 px phones become 195 and 201. Nothing may run off the
// screen, overlap or be cut off in the hero, with a long goal typed into the form; and in the open Menu every link can
// be scrolled into view, with its text inside its pill.
async function zoomed(h) {
  for (const viewport of [{ width: 195, height: 332 }, { width: 201, height: 357 }]) {
    const run = await h.run(`200% zoom ${viewport.width} px`, { viewport });
    const page = await run.newPage();
    await page.goto(SITE + '/', { waitUntil: 'load' });
    await page.evaluate(() => document.fonts.ready);
    await page.waitForTimeout(800);
    await type(page, '#home-plan-goal', '3:45:00');
    const goal = await page.locator('#home-plan-goal').evaluate(el => ({ value: el.value, clientWidth: el.clientWidth, scrollWidth: el.scrollWidth }));
    h.check(`200% zoom (${viewport.width} px): a typed 3:45:00 shows in full in the goal field`, goal.value === '3:45:00' && goal.scrollWidth <= goal.clientWidth, goal);
    // Typing scrolled the field into view, under the sticky header: measure the hero from the top again.
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.waitForTimeout(500);
    const seen = await page.evaluate(() => {
      const named = el => (typeof el.className === 'string' && el.className) || el.tagName;
      const parts = [...document.querySelectorAll('.site-header .header-brand, .site-header .nav-toggle, .site-header .unit-switch, #hero-title, .home-hero-dek, .home-plan-field label, .home-plan select, .home-plan input:not([type=hidden]), .home-plan-button, .home-door-link')]
        .map(el => ({ name: named(el), box: el.getBoundingClientRect() }));
      const overlaps = [];
      for (let i = 0; i < parts.length; i++) for (let j = i + 1; j < parts.length; j++) {
        const [a, b] = [parts[i].box, parts[j].box];
        if (a.left < b.right - 1 && b.left < a.right - 1 && a.top < b.bottom - 1 && b.top < a.bottom - 1) overlaps.push(`${parts[i].name} / ${parts[j].name}`);
      }
      const clipped = [...document.querySelectorAll('.site-header *, .home-hero-copy *')].filter(el => !el.closest('.sr-only, .nav-toggle-label, .unit-name, .main-nav') && el.clientWidth > 0
        && el.scrollWidth > el.clientWidth + 1 && getComputedStyle(el).overflowX !== 'visible').map(named);
      const wide = [...document.querySelectorAll('main *, .site-header *')].filter(el => !el.closest('.sr-only, .hero-replay, .runner-lane, .main-nav') && el.getClientRects().length && el.getBoundingClientRect().right > innerWidth + 1).map(named).slice(0, 8);
      return { innerWidth, scrollWidth: document.documentElement.scrollWidth, overlaps, clipped, wide };
    });
    h.check(`200% zoom (${viewport.width} px): no sideways scroll, nothing past the screen's edge, overlapping or cut off`, seen.scrollWidth <= seen.innerWidth && !seen.wide.length && !seen.overlaps.length && !seen.clipped.length, seen);
    await openMenu(page);
    await page.waitForTimeout(300);
    const menu = await page.evaluate(async () => {
      const links = [];
      for (const a of document.querySelectorAll('#site-menu a')) {
        a.scrollIntoView({ block: 'nearest' });
        await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
        const box = a.getBoundingClientRect();
        const range = document.createRange();
        range.selectNodeContents(a);
        const text = range.getBoundingClientRect();
        links.push({ text: a.textContent.trim(), top: Math.round(box.top), bottom: Math.round(box.bottom), overflow: Math.round(Math.max(0, text.right - box.right, box.left - text.left)) });
      }
      return { innerHeight, links };
    });
    await run.close();
    h.check(`200% zoom (${viewport.width} px): every link in the open Menu can be scrolled into view, its text inside its pill`,
      menu.links.length >= 8 && menu.links.every(l => l.top >= 0 && l.bottom <= menu.innerHeight && l.overflow <= 1), menu);
  }
}

// The form submits a GET to /tools/plan with the planner's own parameters: before any script runs, with the page's
// JavaScript (units=km only when kilometres are chosen) and with an empty goal. The page's script leaves an empty goal
// out, so the planner opens at its 4:00 example; without it (or before it runs) the form sends goal=, which the planner
// reads as a cleared goal and asks for one.
async function homeForm(h) {
  const submit = async (options, { km = false, goal = '3:30', course = 'berlin' } = {}) => {
    const run = await h.run(`form${options.javaScript === false ? ' without JavaScript' : ''}${km ? ', kilometres' : ''}${goal ? '' : ', empty goal'}`, { ...PHONE, ...options });
    const page = await run.newPage();
    await page.goto(SITE + '/', { waitUntil: 'load' });
    await page.waitForTimeout(800);
    if (km) { await page.click('.unit-switch button:has-text("Kilometres")'); await page.waitForTimeout(300); }
    await page.selectOption('#home-plan-course', course);
    if (goal) await type(page, '#home-plan-goal', goal);
    // The address the form asked for, before the planner tidies its own query.
    const [request] = await Promise.all([
      page.waitForRequest(r => r.isNavigationRequest() && new URL(r.url()).pathname === '/tools/plan', { timeout: 15000 }),
      page.locator('.home-plan-button').click(),
    ]);
    const url = new URL(request.url());
    await page.waitForURL(at => new URL(at).pathname === '/tools/plan', { timeout: 15000 });
    await page.waitForTimeout(1200);
    await run.close();
    return [...url.searchParams].sort();
  };
  const sent = (params) => JSON.stringify(params);
  const noScript = await submit({ javaScript: false });
  h.check('without JavaScript the form opens /tools/plan?course=…&goal=… by GET, with no units', sent(noScript) === sent([['course', 'berlin'], ['goal', '3:30']]), noScript);
  const miles = await submit({});
  h.check('with JavaScript and miles the same address, with no units', sent(miles) === sent([['course', 'berlin'], ['goal', '3:30']]), miles);
  const km = await submit({}, { km: true });
  h.check('with kilometres chosen it adds units=km', sent(km) === sent([['course', 'berlin'], ['goal', '3:30'], ['units', 'km']]), km);
  const empty = await submit({}, { goal: '' });
  h.check('an empty goal is left out, so the planner opens at its example', sent(empty) === sent([['course', 'berlin']]), empty);
  const emptyNoScript = await submit({ javaScript: false }, { goal: '' });
  h.check('without JavaScript an empty goal is sent as goal=', sent(emptyNoScript) === sent([['course', 'berlin'], ['goal', '']]), emptyNoScript);
  // What the planner then shows, for each address (with its JavaScript).
  const planner = async (query) => {
    const run = await h.run(`planner ${query}`, PHONE);
    const page = await run.newPage();
    await page.goto(SITE + '/tools/plan?' + query, { waitUntil: 'load' });
    await page.waitForTimeout(1500);
    const shown = await page.evaluate(() => ({
      plan: document.querySelector('#plan-headline-title')?.textContent.trim() ?? null,
      asks: /Type a goal between/.test(document.querySelector('.tool-workspace')?.textContent ?? ''),
      goal: new URLSearchParams(location.search).get('goal'),
    }));
    await run.close();
    return shown;
  };
  const example = await planner('course=berlin');
  h.check('with the goal left out the planner opens at its 4:00 example on the chosen course', example.plan === '4:00 in Berlin' && !example.asks, example);
  const cleared = await planner('course=berlin&goal=');
  h.check('with goal= the planner shows no plan and asks for a goal (its rule: a cleared goal stays cleared)', cleared.plan === null && cleared.asks, cleared);
  // A keypad's 3.30 typed before (or without) the page's JavaScript is sent as it is; the planner reads it as 3:30 and
  // rewrites its address to goal=3:30.
  const dotted = await submit({ javaScript: false }, { goal: '3.30' });
  h.check('without JavaScript a typed 3.30 is sent as goal=3.30', sent(dotted) === sent([['course', 'berlin'], ['goal', '3.30']]), dotted);
  const read = await planner('course=berlin&goal=3.30');
  h.check('the planner opens goal=3.30 at 3:30 and rewrites its address to goal=3:30', read.plan === '3:30 in Berlin' && read.goal === '3:30', read);
}

// An iPhone's numeric keypad (inputMode="decimal") has a dot, or a comma in some locales, and no colon. In a race-time
// field the dot key types a colon as it is typed, and touch screens show "Tap . for :" (never desktops, never screen
// readers); a pace keeps its dot ("8.5" is 8.5 minutes) and shows m:ss once the field is left. S2 types dotted times too,
// so they go through its check that typed values never reach PostHog.
async function keypad(h) {
  const hintOf = (page, selector) => page.evaluate((selector) => {
    const el = document.querySelector(selector);
    return el && { shown: getComputedStyle(el).display !== 'none', ariaHidden: el.getAttribute('aria-hidden'), text: el.textContent.replace(/\s+/g, ' ').trim(), coarse: matchMedia('(pointer: coarse)').matches };
  }, selector);
  const typeOnly = async (page, selector, value) => {
    const field = typeof selector === 'string' ? page.locator(selector).first() : selector.first();
    await field.scrollIntoViewIfNeeded({ timeout: 8000 });
    await field.click({ timeout: 8000 });
    await field.fill('');
    await field.pressSequentially(value, { delay: 15 });
    return field.inputValue();
  };
  const desk = await h.run('keypad hint on a desktop', DESKTOP);
  const deskPage = await desk.newPage();
  await deskPage.goto(SITE + '/', { waitUntil: 'load' });
  await deskPage.waitForTimeout(600);
  const deskHint = await hintOf(deskPage, '.home-plan .keypad-hint');
  h.check('desktop: the home goal has the keypad hint, not shown (a fine pointer)', deskHint && !deskHint.shown && !deskHint.coarse, deskHint);
  // A keyboard has a colon key, so on a desktop a typed dot stays a dot (the phone's keypad makes it a colon before a
  // letter arrives, "3:5h", which parseDuration still reads as 3.5 hours): either way the reading is 3.5 hours.
  await deskPage.goto(SITE + '/tools/plan?course=berlin', { waitUntil: 'load' });
  await deskPage.waitForTimeout(1200);
  const units = [];
  for (const typedUnits of ['3.5h', '3.75 hours']) {
    const shown = await typeOnly(deskPage, '.plan-goal input', typedUnits);
    await deskPage.keyboard.press('Tab');
    await deskPage.waitForTimeout(400);
    units.push({ typed: typedUnits, shown, left: await deskPage.locator('.plan-goal input').first().inputValue(), goal: new URL(deskPage.url()).searchParams.get('goal') });
  }
  await desk.close();
  h.check('desktop: 3.5h and 3.75 hours typed key by key in the planner read 3:30:00 and 3:45:00 (goal=3:30, goal=3:45)',
    units[0].left === '3:30:00' && units[0].goal === '3:30' && units[1].left === '3:45:00' && units[1].goal === '3:45', units);

  const run = await h.run('keypad', PHONE);
  const page = await run.newPage();
  await page.goto(SITE + '/', { waitUntil: 'load' });
  await page.waitForTimeout(800);
  const hint = await hintOf(page, '.home-plan .keypad-hint');
  h.check('phone: the home goal shows "Tap . for :", hidden from screen readers', hint && hint.shown && hint.ariaHidden === 'true' && hint.text === 'Tap . for :', hint);
  await page.selectOption('#home-plan-course', 'berlin');
  const typed = await typeOnly(page, '#home-plan-goal', '3.30');
  h.check('phone: typing 3.30 into the home goal shows 3:30', typed === '3:30', typed);
  const [request] = await Promise.all([
    page.waitForRequest(r => r.isNavigationRequest() && new URL(r.url()).pathname === '/tools/plan', { timeout: 15000 }),
    page.locator('.home-plan-button').click(),
  ]);
  await page.waitForURL(at => new URL(at).pathname === '/tools/plan', { timeout: 15000 });
  await page.waitForTimeout(1500);
  const plan = await page.evaluate(() => ({ plan: document.querySelector('#plan-headline-title')?.textContent.trim() ?? null, field: document.querySelector('.plan-goal input')?.value ?? null }));
  const sentGoal = new URL(request.url()).searchParams.get('goal');
  h.check('phone: the form sends goal=3:30 and the planner shows 3:30', sentGoal === '3:30' && plan.plan === '3:30 in Berlin', { sentGoal, ...plan });

  await page.goto(SITE + '/tools/pace-calculator', { waitUntil: 'load' });
  await page.waitForTimeout(1200);
  const time = await typeOnly(page, page.getByLabel('Time', { exact: true }), '3.30.15');
  h.check('phone: typing 3.30.15 into the pace calculator\'s time shows 3:30:15 as it is typed', time === '3:30:15', time);
  const pace = await typeOnly(page, page.getByLabel(/^Pace per mile/), '8.5');
  await page.keyboard.press('Tab');
  await page.waitForTimeout(300);
  const left = await page.getByLabel(/^Pace per mile/).first().inputValue();
  h.check('phone: a pace keeps 8.5 while it is typed and shows 8:30 once the field is left', pace === '8.5' && left === '8:30', { typed: pace, left });
  const paceHint = await page.evaluate(() => [...document.querySelectorAll('.tool-field')].filter(f => /Pace per/.test(f.querySelector('label')?.textContent ?? '')).map(f => !!f.querySelector('.keypad-hint')));
  h.check('phone: the pace field has no keypad hint (its dot is a decimal point)', JSON.stringify(paceHint) === '[false]', paceHint);

  // At 200% zoom (195 px wide) the inline hint wraps as one piece, never leaving the colon alone on a line.
  await page.setViewportSize({ width: 195, height: 800 });
  await page.goto(SITE + '/tools/pace-band', { waitUntil: 'load' });
  await page.waitForTimeout(1200);
  const narrow = await page.evaluate(() => [...document.querySelectorAll('.tool-field-hint .keypad-hint')].filter(el => getComputedStyle(el).display !== 'none').map(el => new Set([...el.getClientRects()].map(r => Math.round(r.top))).size));
  h.check('phone at 195 px: the pace band goal\'s inline "Tap . for :" sits on one line', narrow.length === 1 && narrow[0] === 1, narrow);
  await page.setViewportSize(PHONE.viewport);

  // The split check's nine boxes share one hint; each box turns dots into colons, and its pasted list is left as it is.
  await page.goto(SITE + '/tools/split-check', { waitUntil: 'load' });
  await page.waitForTimeout(1200);
  const gridHint = await hintOf(page, '.split-check-inputs fieldset ~ .tool-field-hint .keypad-hint');
  const mat = await typeOnly(page, 'input[id$="-t2"]', '1.12.55');
  h.check('phone: the split check shows one keypad hint for its nine boxes, and 1.12.55 typed in a box shows 1:12:55',
    gridHint && gridHint.shown && mat === '1:12:55' && await page.locator('.split-check-inputs .keypad-hint').count() === 1, { gridHint, mat });
  await run.close();
}

// Every page whose text changes with the units has the header's working switch (lib/unit-preference.ts; the build stops
// otherwise). /research, opened directly, converts its list of analyses when Kilometres is pressed (it showed the inert
// placeholder before); every page the export serves with the placeholder (404.html aside) reads the same in both units.
async function unitSwitch(h) {
  const run = await h.run('units switch', DESKTOP);
  const page = await run.newPage();
  const seen = () => page.evaluate(() => {
    const control = document.querySelector('.site-header .unit-switch');
    return {
      working: !!control && !control.classList.contains('unit-switch-placeholder') && control.getAttribute('role') === 'group' && getComputedStyle(control).visibility === 'visible',
      analyses: (document.querySelector('#analyses')?.innerText ?? '').match(/[^\n]*the first [^\n]* to the finish\./)?.[0] ?? null, search: location.search,
    };
  });
  await page.goto(SITE + '/research', { waitUntil: 'load' });
  await page.waitForTimeout(800);
  const miles = await seen();
  h.check('/research, opened directly, has the working units switch', miles.working, miles);
  if (miles.working) { await page.click('.site-header .unit-switch button:has-text("Kilometres")'); await page.waitForTimeout(400); }
  const km = await seen();
  h.check('pressing Kilometres on /research converts its analyses (the first 3.11 mi, then the first 5 km) and adds units=km',
    /the first 3\.11 mi to/.test(miles.analyses) && /the first 5 km to/.test(km.analyses) && km.search === '?units=km', { miles, km });
  const placeholders = fs.readdirSync(h.out, { recursive: true }).filter(file => file.endsWith('.html') && file !== '404.html'
    && fs.readFileSync(path.join(h.out, file), 'utf8').includes('unit-switch-placeholder')).map(file => '/' + file.replace(/\.html$/, '').replace(/(^|\/)index$/, '')).sort();
  const differ = [];
  for (const at of placeholders) {
    const text = async units => { await page.goto(`${SITE}${at}?units=${units}`, { waitUntil: 'load' }); await page.waitForTimeout(800); return page.evaluate(() => document.querySelector('main')?.innerText ?? ''); };
    const [mi, kilometres] = [await text('mi'), await text('km')];
    const line = mi.split('\n').findIndex((text, i) => text !== kilometres.split('\n')[i]);
    if (!mi || mi !== kilometres) differ.push({ page: at, miles: mi.split('\n')[line], km: kilometres.split('\n')[line] });
  }
  await run.close();
  h.check('every page served with the inert placeholder reads the same in miles and kilometres', placeholders.length && !differ.length && !placeholders.includes('/research'), { placeholders, differ });
  h.note(`units switch: placeholder pages ${placeholders.join(', ')}`);
}

// A course page's in-page links (the contents, "sustained slowdown", "finish times by year") go through the router, so
// after one of them, following any other link and going Back shows the course page again, with its own page view; a
// plain fragment link left the address on the course page and the page left on screen.
async function courseBack(h, device) {
  const run = await h.run('course contents, a link, then Back', device);
  const page = await run.newPage();
  await page.goto(SITE + '/courses/boston', { waitUntil: 'load' });
  await page.waitForTimeout(800);
  const race = (await page.locator('h1').textContent()).trim();
  await page.locator('nav.course-toc a[href="#goals"]').click();
  await page.waitForFunction(() => location.hash === '#goals');
  await page.waitForTimeout(600);
  const focused = await page.evaluate(() => document.activeElement && document.activeElement.id);
  await page.locator('#goals tbody th a').first().click();
  await page.waitForURL(url => new URL(url).pathname === '/tools/plan', { timeout: 15000 });
  await page.waitForTimeout(1200);
  const away = (await page.locator('h1').textContent()).trim();
  await page.goBack();
  await page.waitForURL(url => new URL(url).pathname === '/courses/boston', { timeout: 15000 });
  await page.waitForTimeout(1500);
  const back = await page.evaluate(() => ({ h1: document.querySelector('h1').textContent.trim(), goals: !!document.getElementById('goals'), url: location.pathname + location.hash }));
  h.check('a contents link scrolls to its section and focuses it', focused === 'goals', focused);
  h.check(`Back from the planner shows the course page again ("${race}"), not the planner ("${away}")`, back.h1 === race && back.goals && back.url === '/courses/boston#goals', back);
  await run.close();
  const paths = run.events().filter(({ e }) => e.event === '$pageview').map(({ e }) => e.properties.$pathname);
  h.check('page views: the course page, the planner, the course page again', JSON.stringify(paths) === JSON.stringify(['/courses/boston', '/tools/plan', '/courses/boston']), paths);
}

module.exports = {
  id: 'S1',
  title: 'Browsing: home, story, the five main links, an analysis, privacy; the home page\'s first screen and form; the units switch; Back to a course page',
  jobs: ({ quick }) => [
    { name: 'desktop', weight: 34, run: h => browse(h, DESKTOP) },
    ...(quick ? [] : [{ name: 'phone', weight: 34, run: h => browse(h, PHONE) }]),
    { name: 'home first screen', weight: 6, run: firstScreen },
    { name: 'home at 200% zoom', weight: 5, run: zoomed },
    ...(quick ? [] : [{ name: 'home form', weight: 16, run: homeForm }]),
    { name: 'keypad colon', weight: 8, run: keypad },
    { name: 'units switch', weight: 12, run: unitSwitch },
    { name: 'course page Back', weight: 8, run: h => courseBack(h, PHONE) },
  ],
};
