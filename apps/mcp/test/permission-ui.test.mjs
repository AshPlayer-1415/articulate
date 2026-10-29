import test from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import net from 'node:net';
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { createProfile } from "@articulate/core";
import { ArticulateLocalService } from "../src/service.mjs";
import { createConsentWindow, createPermissionLauncher, isTrustedLocalFormPost } from "../src/permission-ui.mjs";

async function fixture(fn) {
  const dir = await mkdtemp(path.join(os.tmpdir(), "articulate-permission-ui-"));
  const service = new ArticulateLocalService(dir);
  await service.profileStore.save(createProfile("synthetic-profile"));
  try { await fn(service); }
  finally { await rm(dir, { force: true, recursive: true }); }
}
const post = (url, value, headers = {}) =>
  fetch(url, {
    method: "POST", redirect: "manual",
    headers: {
      Origin: new URL(url).origin,
      "Content-Type": "application/x-www-form-urlencoded",
      ...headers
    },
    body: new URLSearchParams(value).toString()
  });

test("trusted local form posts accept Chromium same-origin quirks and reject evil origins", () => {
  const origin = "http://127.0.0.1:5555";
  assert.equal(isTrustedLocalFormPost({
    headers: { origin, "content-type": "application/x-www-form-urlencoded" }
  }, origin), true);
  assert.equal(isTrustedLocalFormPost({
    headers: {
      "content-type": "application/x-www-form-urlencoded;charset=UTF-8",
      "sec-fetch-site": "same-origin",
      "sec-fetch-mode": "navigate",
      "sec-fetch-dest": "document"
    }
  }, origin), true);
  assert.equal(isTrustedLocalFormPost({
    headers: {
      origin: "null",
      "content-type": "application/x-www-form-urlencoded",
      "sec-fetch-site": "same-origin",
      "sec-fetch-mode": "navigate",
      "sec-fetch-dest": "document"
    }
  }, origin), true);
  assert.equal(isTrustedLocalFormPost({
    headers: {
      origin: "https://evil.example",
      "content-type": "application/x-www-form-urlencoded",
      "sec-fetch-site": "cross-site"
    }
  }, origin), false);
  assert.equal(isTrustedLocalFormPost({
    headers: { origin, "content-type": "application/json" }
  }, origin), false);
});

test("GET never grants; opt-in requires acknowledgment, same-origin request and nonce", async () => {
  await fixture(async service => {
    const window = await createConsentWindow(service);
    try {
      const before = await fetch(window.url);
      assert.equal(before.status, 200);
      const document=await before.text();
      assert.match(document,/AI provider may process/);
      assert.match(document,/button:focus-visible/);
      assert.match(document,/prefers-reduced-motion/);
      assert.match(document,/forced-colors:active/);
      assert.match(document,/<html lang="en">/);
      assert.match(document,/name="agree" value="yes" required/);
      assert.match(document,/Disable \/ revoke sharing/);
      assert.equal(before.headers.get("x-frame-options"), "DENY");
      assert.equal(before.headers.get("cache-control"), "no-store, max-age=0");
      assert.equal((await service.profileStore.load()).consent.sharePolicyWithAiProvider, false);
      const wrongToken = await fetch(window.url.slice(0,-1) + (window.url.endsWith("0") ? "1" : "0"));
      assert.equal(wrongToken.status, 404);
      const forged = await post(window.url, { action: "enable", agree: "yes" }, { Origin: "https://evil.example" });
      assert.equal(forged.status, 403);
      const unchecked = await post(window.url, { action: "enable" });
      assert.equal(unchecked.status, 400);
      assert.equal((await service.profileStore.load()).consent.sharePolicyWithAiProvider, false);
      // Chromium-style navigational form POST: Origin omitted, Sec-Fetch-Site present.
      const quirky = await new Promise((resolve, reject) => {
        const target = new URL(window.url);
        const body = new URLSearchParams({ action: "enable", agree: "yes" }).toString();
        const req = http.request({
          hostname: target.hostname,
          port: target.port,
          path: target.pathname,
          method: "POST",
          headers: {
            Host: target.host,
            "Content-Type": "application/x-www-form-urlencoded",
            "Content-Length": Buffer.byteLength(body),
            "Sec-Fetch-Site": "same-origin",
            "Sec-Fetch-Mode": "navigate",
            "Sec-Fetch-Dest": "document"
          }
        }, res => {
          const chunks = [];
          res.on("data", c => chunks.push(c));
          res.on("end", () => resolve({
            status: res.statusCode,
            text: Buffer.concat(chunks).toString("utf8")
          }));
        });
        req.on("error", reject);
        req.write(body);
        req.end();
      });
      assert.equal(quirky.status, 200);
      assert.match(quirky.text, /Sharing enabled/);
      assert.equal((await service.profileStore.load()).consent.sharePolicyWithAiProvider, true);
      await window.done;
    } finally { await window.close(); }
  });
});

test("revoke and cancel preserve local control", async () => {
  await fixture(async service => {
    const current = await service.profileStore.load();
    await service.profileStore.save({
      ...current, consent: { ...current.consent, sharePolicyWithAiProvider: true }
    });
    let window = await createConsentWindow(service);
    try {
      const response = await post(window.url, {action:"cancel"});
      assert.equal(response.status, 200);
      await window.done;
      assert.equal((await service.profileStore.load()).consent.sharePolicyWithAiProvider, true);
    } finally { await window.close(); }
    window = await createConsentWindow(service);
    try {
      const response = await post(window.url, { action: "disable" });
      assert.equal(response.status, 200);
      await window.done;
      assert.equal((await service.profileStore.load()).consent.sharePolicyWithAiProvider, false);
    } finally { await window.close(); }
  });
});

test("MCP launcher returns no secret URL and requires explicit user request", async () => {
  await fixture(async service => {
    let capturedUrl;
    const launcher = createPermissionLauncher(service, {
      browser: async url => { capturedUrl = url; }
    });
    try {
      await assert.rejects(() => launcher.open({userRequested:false}), /user requests/);
      const opened = await launcher.open({userRequested:true});
      assert.equal(opened.opened, true);
      assert.ok(capturedUrl.startsWith("http://127.0.0.1:"));
      assert.equal(JSON.stringify(opened).includes(capturedUrl), false);
      assert.equal((await service.profileStore.load()).consent.sharePolicyWithAiProvider,false);
      const duplicate = await launcher.open({userRequested:true});
      assert.equal(duplicate.opened,false);
      const done = await post(capturedUrl, {action:"enable",agree:"yes"});
      assert.equal(done.status,200);
      await new Promise(resolve => setTimeout(resolve,110));
      assert.equal((await service.profileStore.load()).consent.sharePolicyWithAiProvider,true);
    } finally { await launcher.shutdown(); }
  });
});

test("permission sessions expire without enabling provider disclosure", async () => {
  await fixture(async service => {
    const window = await createConsentWindow(service, {ttlMs:100});
    await window.done;
    assert.equal((await service.profileStore.load()).consent.sharePolicyWithAiProvider,false);
    await window.close();
  });
});

test('approval returns to the CLI even when a browser leaves an unused preconnection open',async()=>{
  await fixture(async service=>{
    const window=await createConsentWindow(service);const url=new URL(window.url);
    const socket=net.createConnection({host:url.hostname,port:Number(url.port)});
    socket.on('error',()=>{});
    await new Promise((resolve,reject)=>{socket.once('connect',resolve);socket.once('error',reject);});
    let timer;
    try {
      const response=await post(window.url,{action:'enable',agree:'yes'});
      assert.equal(response.status,200);assert.match(await response.text(),/Return to Terminal/);
      const outcome=await Promise.race([window.done,new Promise((_,reject)=>{timer=setTimeout(()=>reject(new Error('CLI was left waiting for a browser socket')),2000);})]);
      assert.deepEqual(outcome,{action:'enable',changed:true,sharingEnabled:true});
      assert.equal((await service.profileStore.load()).consent.sharePolicyWithAiProvider,true);
    }finally{clearTimeout(timer);socket.destroy();await window.close();}
  });
});

 test("permission approval cannot follow a replaced profile and each window accepts one decision",async()=>{
  await fixture(async service=>{
    const window=await createConsentWindow(service);
    try {
      await service.exclusive(()=>service.profileStore.save(createProfile("replacement-synthetic")));
      assert.equal((await post(window.url,{action:"enable",agree:"yes"})).status,400);
      assert.equal((await service.profileStore.load()).consent.sharePolicyWithAiProvider,false);
    } finally {await window.close();}
    const second=await createConsentWindow(service);
    try {
      const outcomes=await Promise.all([
        post(second.url,{action:"enable",agree:"yes"}),
        post(second.url,{action:"disable"})
      ]);
      assert.deepEqual(outcomes.map(r=>r.status).sort(),[200,410]);
    } finally {await second.close();}
  });
 });
