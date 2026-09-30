import { chromium } from "@playwright/test";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
const browser = await chromium.launch({ channel: "msedge", headless: true });
try {
  const page = await browser.newPage({
    viewport: { width: 760, height: 430 },
    deviceScaleFactor: 1,
  });
  for (const n of [1, 2]) {
    await page.setContent(
      `<html lang="en"><style>*{box-sizing:border-box}body{margin:0;background:#f7f8f5;font:14px system-ui;color:#314438}header{height:55px;display:flex;align-items:center;justify-content:space-between;background:#fff;border-bottom:1px solid #e2e8de;padding:0 25px}b{font-size:20px;letter-spacing:2px}small{font-size:10px;background:#edf1e5;padding:6px;border-radius:4px;color:#768768}aside{width:185px;position:absolute;top:55px;bottom:0;background:#fff;border-right:1px solid #e2e8de;padding:24px 14px}aside div{padding:11px 10px;font-size:12px;color:#77846b}.active{background:#edf3e7;border:1px solid #c9dabd;border-radius:5px;color:#466641}main{padding:29px 28px;margin-left:185px}h1{font-size:22px;margin:0 0 7px}p{font-size:12px;color:#8a967e;margin-bottom:24px}.panel{background:#fff;border:1px solid #e1e8d8;border-radius:7px;padding:19px;box-shadow:0 3px 10px #34462905}h2{font-size:14px;margin:0 0 17px}.row{display:flex;justify-content:space-between;border-top:1px solid #ecf0e5;padding:14px 0;font-size:11px}.row span{color:#7c8973}button{font:11px system-ui;background:#3f6c46;color:#fff;border:0;border-radius:5px;padding:9px 13px}.highlight{outline:2px solid #95ae69;outline-offset:3px}.footer{font-size:9px;color:#9aa68c;margin-top:20px}</style><header><b>ATLAS</b><small>ORIGINAL SYNTHETIC EXAMPLE</small></header><aside><div>Workspace</div><div>Team members</div><div>Integrations</div><div class="active highlight">${n === 1 ? "Billing" : "Plans & billing"}</div><div>Security</div></aside><main><h1>${n === 1 ? "Billing" : "Plans & billing"}</h1><p>Fictional support sandbox · Northwind workspace</p><div class="panel"><h2>Invoice history</h2><div class="row"><strong>INV-2026-09</strong><span>September 2026</span><span>$240.00</span></div><div class="row"><strong>INV-2026-08</strong><span>August 2026</span><span>$240.00</span></div><button>${n === 1 ? "Export" : "Download PDF"}</button></div><div class="footer">This screen is a designed fixture. It does not represent a live customer application.</div></main></html>`,
    );
    const bytes = await page.screenshot({ path: `fixtures/atlas-v${n}.png` });
    const path = `fixtures/invoice-v${n}.json`;
    const fixture = JSON.parse(readFileSync(path, "utf8"));
    fixture.steps[0].text =
      n === 1
        ? "From the workspace menu, choose Settings > Billing. Confirm you are in the correct customer workspace."
        : "From the workspace menu, choose Settings > Plans & billing. Confirm you are in the correct customer workspace.";
    fixture.steps[0].screenshots = [
      {
        name: `Synthetic Atlas billing screen v${n}`,
        dataUrl: `data:image/png;base64,${bytes.toString("base64")}`,
      },
    ];
    writeFileSync(path, JSON.stringify(fixture, null, 2) + "\n");
  }
  mkdirSync("public/fixtures", { recursive: true });
  writeFileSync(
    "public/fixtures/example.md",
    "# Invite a teammate\n\nOwner: People operations\n\nAn original synthetic guide.\n\n## Send an invitation\n<!-- step:invite -->\n\nOpen Workspace settings > Members. Select Invite teammate and choose the Member role.\n\n## Confirm access\n<!-- step:confirm -->\n\nAsk the teammate to sign in and confirm they can view the workspace.\n",
  );
  writeFileSync(
    "public/fixtures/example.json",
    JSON.stringify(
      {
        title: "Invite a teammate",
        owner: "People operations",
        description: "An original synthetic guide.",
        steps: [
          {
            id: "invite",
            title: "Send an invitation",
            text: "Open Workspace settings > Members. Select Invite teammate and choose the Member role.",
            links: [],
            screenshots: [],
          },
          {
            id: "confirm",
            title: "Confirm access",
            text: "Ask the teammate to sign in and confirm they can view the workspace.",
            links: [],
            screenshots: [],
          },
        ],
      },
      null,
      2,
    ) + "\n",
  );
} finally {
  await browser.close();
}
