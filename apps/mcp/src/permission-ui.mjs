import http from "node:http";
import { randomBytes, timingSafeEqual } from "node:crypto";
import { spawn } from "node:child_process";

/**
 * A short-lived, on-device consent page. The MCP model never receives
 * the secret URL and cannot enable sharing through a tool argument.
 * It is NOT a remotely reachable Articulate API.
 */
const DEFAULT_TTL_MS = 120_000;
const MAX_BODY_BYTES = 2048;

const headers = {
  "Content-Type": "text/html; charset=utf-8",
  "Cache-Control": "no-store, max-age=0",
  "Pragma": "no-cache",
  "Referrer-Policy": "no-referrer",
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "DENY",
  "Cross-Origin-Resource-Policy": "same-origin",
  "Content-Security-Policy":
    "default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; frame-ancestors 'none'; base-uri 'none'"
};

function page(body) {
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="referrer" content="no-referrer"><title>Articulate · Device permissions</title>
<style>
:root {color-scheme:dark;font-family:system-ui,-apple-system,sans-serif;background:#0b1118;color:#f3f7f9}
*{box-sizing:border-box}body{min-height:100vh;display:grid;place-items:center;margin:0;padding:24px}
main{max-width:570px;width:100%;padding:36px;background:#151e29;border:1px solid #36534a;border-radius:18px}
.eyebrow{color:#9fe7d5;letter-spacing:1.5px;text-transform:uppercase;font-size:11px;font-weight:750}
h1{font-size:30px;letter-spacing:-.8px}p,li{color:#c0cbd3;line-height:1.65;font-size:14px}
ul{padding-left:21px}label{display:flex;gap:12px;align-items:flex-start;padding:14px;background:#1c2b30;border-radius:9px;font-size:13px;line-height:1.55}
input{accent-color:#9fe7d5;margin-top:3px}form{margin-top:16px}
button{width:100%;border:1px solid #52695e;border-radius:10px;padding:13px;background:#1f3034;color:#ecf7f3;font-weight:700;font-size:14px;cursor:pointer}
.primary{background:#9fe7d5;color:#0e2420;border-color:#9fe7d5}
button:focus-visible,input:focus-visible{outline:3px solid #9fe7d5;outline-offset:4px}
button:hover{border-color:#9fe7d5}
@media(max-width:500px){main{padding:22px}h1{font-size:26px}}
@media(prefers-reduced-motion:reduce){*{scroll-behavior:auto!important;animation:none!important;transition:none!important}}
@media(forced-colors:active){button{border:2px solid ButtonText}.primary{color:ButtonText;background:ButtonFace}}
.note{margin-top:18px;font-size:12px;color:#a2b3bb}
</style></head><body><main><span class="eyebrow">Articulate · Local-only</span>${body}</main></body></html>`;
}

const escapeHtml=value=>String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function promptHtml(enabled,context={mode:'legacy'}) {
  const client=context.mode==='registered'?`<p><strong>Registered client:</strong> ${escapeHtml(context.name)}.<br><strong>Imported-memory projects:</strong> ${escapeHtml(context.projects.includes('*')?'All projects':context.projects.join(', '))}.</p><p>Existing response styles and manual pattern notes are global preferences. Project limits apply to imported activity memory. This decision applies only to this client. Raw imported activity is never returned through MCP.</p>`:'';
  return page(`
<h1>Allow AI profile access?</h1>
<p><strong>Current status:</strong> ${enabled ? "Sharing enabled" : "Sharing disabled"}.</p>
${client}
<p>Only you can change this setting on your device. If enabled, a connected Claude or other AI host may request:</p>
<ul><li>Your provisional explanation-preference scores and self-reported subject familiarity.</li>
<li>Your saved style names, response rules and approved pattern notes as part of the presentation policy, when you request Articulate personalization.</li><li>Reviewed working rules and a derived activity-analysis summary: project coverage, per-agent event counts and refresh dates within this client’s permitted projects. Raw imported transcripts are excluded.</li></ul>
<p>What you write in an AI chat is processed by that AI provider. No Articulate-operated server receives your profile. This setting does not write Claude or ChatGPT memory or force future-chat activation.</p>
<form method="POST" action=""><input type="hidden" name="action" value="enable">
<label><input type="checkbox" name="agree" value="yes" required>
<span>I understand that an AI provider may process the permitted profile summary and explanation policy.</span></label>
<p><button class="primary" type="submit">${context.mode==='registered'?'Enable sharing for '+escapeHtml(context.name):'Enable AI profile sharing on this device'}</button></p></form>
<form method="POST" action=""><input type="hidden" name="action" value="disable">
<button type="submit">Disable / revoke sharing</button></form>
<form method="POST" action=""><input type="hidden" name="action" value="cancel">
<button type="submit">Leave permissions unchanged</button></form>
<p class="note">This page expires in two minutes. After your decision, return to Terminal or your AI app to continue. This browser tab may be closed.</p>`);
}

function sameToken(candidate, expected) {
  if (typeof candidate !== "string" || candidate.length !== expected.length) return false;
  return timingSafeEqual(Buffer.from(candidate, "ascii"), Buffer.from(expected, "ascii"));
}

async function readForm(req) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > MAX_BODY_BYTES) throw new Error("Request too large");
    chunks.push(chunk);
  }
  return new URLSearchParams(Buffer.concat(chunks).toString("utf8"));
}

/**
 * Accept real browser form POSTs from this loopback page.
 * Some Chromium profiles omit Origin or send Origin: null on same-origin
 * navigational form submits while still setting Sec-Fetch-Site: same-origin.
 * Cross-site Origins remain rejected.
 */
export function isTrustedLocalFormPost(req, origin) {
  const contentType = String(req.headers["content-type"] ?? "").toLowerCase();
  if (!contentType.startsWith("application/x-www-form-urlencoded")) return false;
  const reqOrigin = req.headers.origin;
  if (reqOrigin === origin) return true;
  const site = String(req.headers["sec-fetch-site"] ?? "").toLowerCase();
  const mode = String(req.headers["sec-fetch-mode"] ?? "").toLowerCase();
  const dest = String(req.headers["sec-fetch-dest"] ?? "").toLowerCase();
  const navigationalSameOrigin =
    (reqOrigin === undefined || reqOrigin === "null") &&
    site === "same-origin" &&
    (mode === "navigate" || mode === "" || mode === "same-origin") &&
    (dest === "document" || dest === "" || dest === "empty");
  if (navigationalSameOrigin) return true;
  const referer = req.headers.referer;
  if ((reqOrigin === undefined || reqOrigin === "null") &&
      typeof referer === "string" &&
      (referer === origin + "/" || referer.startsWith(origin + "/consent/"))) {
    return true;
  }
  return false;
}

export function launchSystemBrowser(url) {
  const command = process.platform === "darwin" ? "open"
    : process.platform === "win32" ? "explorer.exe" : "xdg-open";
  return new Promise((resolve, reject) => {
    const child = spawn(command, [url], {
      detached: true, stdio: "ignore", windowsHide: true
    });
    child.once("error", reject);
    child.once("spawn", () => { child.unref(); resolve(); });
  });
}

/** The URL is returned to *trusted local code only*, never via MCP. */
export async function createConsentWindow(service, { ttlMs = DEFAULT_TTL_MS } = {}) {
  if (!Number.isInteger(ttlMs) || ttlMs < 100 || ttlMs > 300_000)
    throw new Error("Invalid local-consent timeout");
  const {profile,context}=await service.exclusive(async()=>({profile:await service.profileStore.load(),context:await service.sharingContext()}));
  if (!profile) throw new Error("Complete onboarding or import a local profile first.");
  const token = randomBytes(32).toString("hex");
  let closed = false;
  let closeResolver;
  const done = new Promise(resolve => { closeResolver = resolve; });
  let timer;
  let activeRequests = 0;
  let port;
  let outcome={action:'expired',changed:false};
  const sockets=new Set();
  let shutdownTimer;
  function shutdown(delay=0) {
    clearTimeout(timer);
    clearTimeout(shutdownTimer);
    shutdownTimer=setTimeout(()=>{
      server.close();
      // Browsers can preconnect a socket without ever sending an HTTP request.
      // Waiting for that socket used to leave the CLI stuck after approval.
      server.closeAllConnections();
      for(const socket of sockets)socket.destroy();
    },delay);
  }

  const server = http.createServer(async (req, res) => {
    activeRequests++;
    const reply = (status, content) => {
      res.writeHead(status, headers);
      res.end(content);
    };
    try {
      const host = req.headers.host;
      if (host !== `127.0.0.1:${port}`) {
        reply(403, page("<h1>Host rejected</h1>")); return;
      }
      const url = new URL(req.url ?? "/", `http://127.0.0.1:${port}`);
      const match = url.pathname.match(/^\/consent\/([a-f0-9]{64})$/);
      if (!match || !sameToken(match[1], token) || url.search) {
        reply(404, page("<h1>Not found</h1>")); return;
      }
      if (closed) { reply(410, page("<h1>Permission session expired</h1>")); return; }
      if (req.method === "GET") {
        const current = await service.exclusive(() => service.sharingContext());
        reply(200, promptHtml(current.sharingEnabled,current));
        return;
      }
      if (req.method !== "POST") { reply(405, page("<h1>Method not allowed</h1>")); return; }
      const origin = `http://127.0.0.1:${port}`;
      if (!isTrustedLocalFormPost(req, origin)) {
        reply(403, page("<h1>Cross-origin request denied</h1><p>Reload this local permission page and try again from the same tab.</p>")); return;
      }
      const form = await readForm(req);
      const action = form.get("action");
      if (!["enable","disable","cancel"].includes(action)) {
        reply(400, page("<h1>Unknown choice</h1>")); return;
      }
      if (action === "enable" && form.get("agree") !== "yes") {
        reply(400, page("<h1>Explicit acknowledgment required</h1>")); return;
      }
      if (closed) { reply(410,page("<h1>Permission session expired</h1>"));return; }
      closed = true;
      if (action !== "cancel") {
        await service.exclusive(async () => {
          const current = await service.profileStore.load();
          if (!current || current.profileId !== profile.profileId)
            throw new Error("Local profile changed; open a new permission window");
          await service.applyLocalSharingDecision({enabled:action==='enable',profileId:profile.profileId,context});
        });
      }
      closed = true;
      clearTimeout(timer);
      outcome={action,changed:action!=='cancel',...(action!=='cancel'?{sharingEnabled:action==='enable'}:{})};
      const message = action === "cancel" ? "Permissions unchanged"
        : action === "enable" ? (context.mode==='registered'?'Sharing enabled for '+escapeHtml(context.name):"Sharing enabled on this device") : "Sharing revoked";
      reply(200, page(`<h1>${message}</h1><p>Your choice is saved.</p><p><strong>Return to Terminal or your AI app to continue.</strong> You can close this tab.</p>`));
      // Let response flush before closing the transient HTTP listener.
      shutdown(80);
    } catch {
      // Do not log request bodies, tokens or personal profile data.
      if (!res.headersSent) reply(400, page("<h1>Request could not be completed</h1>"));
      if (closed) { outcome={action:'failed',changed:false};shutdown(80); }
    } finally { activeRequests--; }
  });
  server.on('connection',socket=>{sockets.add(socket);socket.once('close',()=>sockets.delete(socket));});
  server.on("close", () => { closed = true; clearTimeout(timer);clearTimeout(shutdownTimer);closeResolver(outcome); });
  try {
    await new Promise((resolve, reject) => {
      server.once("error", reject);
      server.listen(0, "127.0.0.1", () => {
        server.off("error", reject);
        resolve();
      });
    });
    port = server.address().port;
    timer = setTimeout(() => {
      closed = true;
      shutdown();
    }, ttlMs);
    const url = `http://127.0.0.1:${port}/consent/${token}`;
    return {
      url,
      done,
      async close() {
        if (closed) return done;
        closed = true;
        outcome={action:'cancel',changed:false};
        shutdown();
        await done;
      }
    };
  } catch (error) {
    if (server.listening) server.close();
    throw error;
  }
}

/** Manages at most one browser approval window per MCP host process. */
export function createPermissionLauncher(service, { browser = launchSystemBrowser, ttlMs } = {}) {
  let active = null;
  return {
    async open({ userRequested } = {}) {
      if (userRequested !== true) throw new Error("Open the permission screen only after the user requests it.");
      if (active) return { opened: false, message: "A local permission window is already open. Complete or close it on this device." };
      const window = await createConsentWindow(service, { ttlMs });
      active = window;
      window.done.then(() => { if (active === window) active = null; });
      try { await browser(window.url); }
      catch {
        await window.close();
        throw new Error("Unable to open a browser on this device. Use the trusted local permission command instead.");
      }
      return {
        opened: true,
        message: "The Articulate permission window opened on this device. No permission changed yet. Review and choose in that browser tab. The link is not shared with your AI provider."
      };
    },
    async shutdown() {
      if (active) await active.close();
    }
  };
}
