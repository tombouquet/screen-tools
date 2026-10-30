/**
 * Made-up web pages for the listing screenshots (docs/guides/listing-screenshots.md).
 * The capture script renders each one in a plain browser tab and seeds the result
 * into the extension as a screenshot, or animates it into a sample recording.
 * Every name, number and address here is invented.
 */

export interface SamplePage {
  /** Shown as the screenshot's page title in Screenshots. */
  title: string;
  url: string;
  html: string;
}

const BASE_CSS = `
* { box-sizing: border-box; }
body { margin: 0; font-family: system-ui, -apple-system, "Segoe UI", sans-serif; color: #0f172a; background: #f8fafc; }
.top { display: flex; align-items: center; gap: 28px; height: 64px; padding: 0 40px; background: #fff; border-bottom: 1px solid #e2e8f0; }
.brand { display: flex; align-items: center; gap: 10px; font-weight: 700; font-size: 18px; }
.mark { width: 28px; height: 28px; border-radius: 8px; }
.top nav { display: flex; gap: 22px; color: #64748b; font-size: 14px; font-weight: 500; }
.top nav b { color: #0f172a; }
.avatar { margin-left: auto; width: 34px; height: 34px; border-radius: 50%; }
`;

/** An analytics dashboard: the page the editor screenshot annotates. */
const dashboard: SamplePage = {
  title: 'Northwind Analytics: Weekly overview',
  url: 'https://app.northwind-analytics.example/overview',
  html: `<!doctype html><html><head><style>${BASE_CSS}
main { padding: 32px 40px; }
h1 { margin: 0 0 6px; font-size: 26px; }
.sub { margin: 0 0 26px; color: #64748b; font-size: 14px; }
.cards { display: grid; grid-template-columns: repeat(4, 1fr); gap: 18px; }
.card { padding: 20px 22px; background: #fff; border: 1px solid #e2e8f0; border-radius: 14px; }
.card small { color: #64748b; font-size: 13px; font-weight: 500; }
.card strong { display: block; margin: 8px 0 6px; font-size: 30px; letter-spacing: -0.02em; }
.up { color: #059669; font-size: 13px; font-weight: 600; }
.down { color: #dc2626; font-size: 13px; font-weight: 600; }
.row { display: grid; grid-template-columns: 2fr 1fr; gap: 18px; margin-top: 18px; }
.panel { padding: 22px; background: #fff; border: 1px solid #e2e8f0; border-radius: 14px; }
.panel h2 { margin: 0 0 18px; font-size: 16px; }
.bars { display: flex; align-items: flex-end; gap: 14px; height: 250px; padding-top: 10px; border-bottom: 1px solid #e2e8f0; }
.bars div { flex: 1; border-radius: 6px 6px 0 0; background: #6366f1; }
.bars div.dim { background: #c7d2fe; }
.days { display: flex; gap: 14px; margin-top: 8px; color: #94a3b8; font-size: 12px; }
.days span { flex: 1; text-align: center; }
table { width: 100%; border-collapse: collapse; font-size: 14px; }
td { padding: 11px 0; border-bottom: 1px solid #f1f5f9; }
td:last-child { text-align: right; font-weight: 600; }
.who { display: flex; align-items: center; gap: 10px; }
.dot { width: 28px; height: 28px; border-radius: 50%; }
.mail { color: #64748b; font-size: 12px; }
</style></head><body>
<div class="top"><div class="brand"><div class="mark" style="background:#6366f1"></div>Northwind</div>
<nav><b>Overview</b><span>Customers</span><span>Orders</span><span>Reports</span></nav>
<div class="avatar" style="background:#fbbf24"></div></div>
<main>
<h1>Weekly overview</h1><p class="sub">12 to 18 October · All stores</p>
<div class="cards">
<div class="card"><small>Revenue</small><strong>$48,210</strong><span class="up">▲ 12.4% on last week</span></div>
<div class="card"><small>Orders</small><strong>1,284</strong><span class="up">▲ 8.1% on last week</span></div>
<div class="card"><small>Average order</small><strong>$37.55</strong><span class="up">▲ 3.9% on last week</span></div>
<div class="card"><small>Returns</small><strong>2.1%</strong><span class="down">▲ 0.4% on last week</span></div>
</div>
<div class="row">
<div class="panel"><h2>Orders by day</h2>
<div class="bars"><div class="dim" style="height:52%"></div><div class="dim" style="height:61%"></div><div class="dim" style="height:57%"></div><div class="dim" style="height:70%"></div><div style="height:96%"></div><div class="dim" style="height:78%"></div><div class="dim" style="height:66%"></div></div>
<div class="days"><span>Mon</span><span>Tue</span><span>Wed</span><span>Thu</span><span>Fri</span><span>Sat</span><span>Sun</span></div></div>
<div class="panel"><h2>Top customers</h2><table>
<tr><td><div class="who"><div class="dot" style="background:#f472b6"></div><div>Harper Lane<div class="mail">harper@lane-studio.example</div></div></div></td><td>$2,940</td></tr>
<tr><td><div class="who"><div class="dot" style="background:#34d399"></div><div>Oak &amp; Ivy Co.<div class="mail">orders@oakivy.example</div></div></div></td><td>$2,310</td></tr>
<tr><td><div class="who"><div class="dot" style="background:#60a5fa"></div><div>Milo Brennan<div class="mail">milo.b@mailbox.example</div></div></div></td><td>$1,875</td></tr>
<tr><td><div class="who"><div class="dot" style="background:#f59e0b"></div><div>Juniper Goods<div class="mail">hello@juniper.example</div></div></div></td><td>$1,620</td></tr>
<tr><td><div class="who"><div class="dot" style="background:#a78bfa"></div><div>Sasha Ortiz<div class="mail">sasha@ortiz.example</div></div></div></td><td>$1,480</td></tr>
</table></div>
</div>
</main></body></html>`,
};

const docs: SamplePage = {
  title: 'Getting started · Trailhead Docs',
  url: 'https://docs.trailhead.example/getting-started',
  html: `<!doctype html><html><head><style>${BASE_CSS}
body { background: #fff; }
.wrap { display: grid; grid-template-columns: 260px 1fr; }
aside { min-height: 836px; padding: 28px 24px; border-right: 1px solid #e2e8f0; font-size: 14px; color: #475569; line-height: 2.2; }
aside b { display: block; color: #0f172a; margin-top: 10px; }
aside .on { color: #0d9488; font-weight: 600; }
article { max-width: 760px; padding: 44px 64px; line-height: 1.65; font-size: 16px; color: #334155; }
article h1 { margin: 0 0 12px; font-size: 38px; color: #0f172a; letter-spacing: -0.02em; }
article h2 { margin: 32px 0 8px; font-size: 22px; color: #0f172a; }
pre { padding: 18px 20px; border-radius: 10px; background: #0f172a; color: #e2e8f0; font-size: 14px; }
.note { padding: 14px 18px; border-left: 4px solid #0d9488; border-radius: 6px; background: #f0fdfa; }
</style></head><body>
<div class="top"><div class="brand"><div class="mark" style="background:#0d9488"></div>Trailhead</div>
<nav><b>Docs</b><span>Guides</span><span>API</span><span>Changelog</span></nav></div>
<div class="wrap"><aside><b>Start here</b><div class="on">Getting started</div><div>Install</div><div>Your first project</div><b>Guides</b><div>Routing</div><div>Data loading</div><div>Deploying</div></aside>
<article><h1>Getting started</h1><p>Trailhead turns a folder of Markdown into a fast docs site. This guide takes you from an empty folder to a site running on your machine in a few minutes.</p>
<h2>Install</h2><pre>npm create trailhead@latest my-docs
cd my-docs &amp;&amp; npm run dev</pre>
<p class="note">Trailhead needs Node 20 or later. Check your version with <code>node -v</code>.</p>
<h2>Add a page</h2><p>Every Markdown file in <code>pages/</code> becomes a page. The file name sets the address, and the first heading sets the title in the sidebar.</p></article></div>
</body></html>`,
};

const bakery: SamplePage = {
  title: 'Pinecrest Bakery · Fresh every morning',
  url: 'https://pinecrest-bakery.example/',
  html: `<!doctype html><html><head><style>${BASE_CSS}
body { background: #fffbeb; }
.hero { display: grid; grid-template-columns: 1fr 1fr; gap: 48px; align-items: center; padding: 80px 72px; }
.hero h1 { margin: 0 0 18px; font-size: 64px; line-height: 1.02; color: #78350f; letter-spacing: -0.03em; }
.hero p { font-size: 19px; color: #92400e; line-height: 1.6; }
.btn { display: inline-block; margin-top: 18px; padding: 14px 26px; border-radius: 999px; background: #b45309; color: #fff; font-weight: 600; }
.art { height: 420px; border-radius: 28px; background: radial-gradient(circle at 30% 35%, #fcd34d 0 18%, transparent 19%), radial-gradient(circle at 68% 60%, #f59e0b 0 22%, transparent 23%), radial-gradient(circle at 40% 75%, #fde68a 0 12%, transparent 13%), #fed7aa; }
</style></head><body>
<div class="top" style="background:#fffbeb;border-color:#fde68a"><div class="brand" style="color:#78350f"><div class="mark" style="background:#b45309"></div>Pinecrest Bakery</div>
<nav><span>Menu</span><span>Order ahead</span><span>Visit</span></nav></div>
<div class="hero"><div><h1>Fresh every morning, from 6 am</h1><p>Sourdough, croissants and seasonal pastries, baked on site in small batches. Order by 8 pm for pickup the next day.</p><span class="btn">Order ahead</span></div><div class="art"></div></div>
</body></html>`,
};

const board: SamplePage = {
  title: 'Sprint 14 board · Fieldnote',
  url: 'https://fieldnote.example/team/sprint-14',
  html: `<!doctype html><html><head><style>${BASE_CSS}
main { display: grid; grid-template-columns: repeat(3, 1fr); gap: 20px; padding: 32px 40px; }
.col { padding: 16px; border-radius: 14px; background: #eef2f7; }
.col h2 { margin: 0 0 14px; font-size: 14px; color: #475569; text-transform: uppercase; letter-spacing: 0.06em; }
.task { margin-bottom: 12px; padding: 14px 16px; border-radius: 10px; background: #fff; box-shadow: 0 1px 2px rgb(0 0 0 / 6%); font-size: 15px; }
.tag { display: inline-block; margin-top: 10px; padding: 3px 9px; border-radius: 999px; font-size: 12px; font-weight: 600; }
</style></head><body>
<div class="top"><div class="brand"><div class="mark" style="background:#ec4899"></div>Fieldnote</div><nav><b>Board</b><span>Backlog</span><span>Roadmap</span></nav></div>
<main>
<div class="col"><h2>To do</h2><div class="task">Draft onboarding emails<br><span class="tag" style="background:#fce7f3;color:#9d174d">Marketing</span></div><div class="task">Audit image sizes on the shop<br><span class="tag" style="background:#e0e7ff;color:#3730a3">Web</span></div><div class="task">Plan the spring range shoot<br><span class="tag" style="background:#fef3c7;color:#92400e">Design</span></div></div>
<div class="col"><h2>In progress</h2><div class="task">New checkout page<br><span class="tag" style="background:#e0e7ff;color:#3730a3">Web</span></div><div class="task">Customer survey results<br><span class="tag" style="background:#dcfce7;color:#166534">Research</span></div></div>
<div class="col"><h2>Done</h2><div class="task">Update the returns policy<br><span class="tag" style="background:#f1f5f9;color:#334155">Ops</span></div><div class="task">Logo refresh<br><span class="tag" style="background:#fef3c7;color:#92400e">Design</span></div></div>
</main></body></html>`,
};

/** Seeded oldest first, so the dashboard is the newest screenshot. */
export const SAMPLE_PAGES: SamplePage[] = [board, bakery, docs, dashboard];

/** The page the sample recording scrolls through. */
export const RECORDING_PAGE = dashboard;
