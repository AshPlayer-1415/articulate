import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync, writeFileSync, mkdirSync, mkdtempSync, realpathSync, rmSync} from 'node:fs';
import {execFileSync, spawnSync} from 'node:child_process';
import path from 'node:path';
import os from 'node:os';
import {fileURLToPath} from 'node:url';
import {
  ORIGIN, BASE, CONTROLS, SOURCE_LIST_SHA256, sha256, checkDestination,
  checkPolicy, checkTree, checkSourceBytes, checkUpdates, checkHistory, verifyRelease
} from '../scripts/check-release-boundary.mjs';

const root = fileURLToPath(new URL('..', import.meta.url));
const policy = JSON.parse(readFileSync(new URL('../release-policy.json', import.meta.url), 'utf8'));
const files = policy.approvedSourceExports;
const repo = {id: 1436838545, full_name: 'AshPlayer-1415/articulate', private: true,
  visibility: 'private', clone_url: ORIGIN, archived: false, disabled: false};
const head = 'a'.repeat(40);
const update = `refs/heads/main ${head} refs/heads/main ${BASE}\n`;
const entries = [...files.map(e => e.path), ...CONTROLS].map(path => ({path, mode: '100644', type: 'blob'}));
const clone = value => structuredClone(value);

test('fixed private identity passes; missing, public, transferred or disabled identity fails', () => {
  checkDestination('origin', ORIGIN, repo);
  for (const changed of [null, {}, {...repo, id: 1}, {...repo, id: '1436838545'},
    {...repo, private: false}, {...repo, visibility: 'public'}, {...repo, visibility: undefined},
    {...repo, full_name: 'other/articulate'}, {...repo, clone_url: ORIGIN + '.evil'},
    {...repo, archived: true}, {...repo, disabled: true}]) {
    assert.throws(() => checkDestination('origin', ORIGIN, changed));
  }
});

test('alternate URLs, direct URL pushes and extra remote names fail', () => {
  for (const [name, url] of [['other', ORIGIN], [ORIGIN, ORIGIN], ['origin', ORIGIN + '/'],
    ['origin', 'git@github.com:AshPlayer-1415/articulate.git'],
    ['origin', 'https://example.invalid/articulate.git']]) {
    assert.throws(() => checkDestination(name, url, repo));
  }
});

test('policy uses the independently pinned exact approved list', () => {
  assert.equal(checkPolicy(policy).length, 130);
  assert.equal(SOURCE_LIST_SHA256, '42050049a719c9cd228f627492a751a8d8ba32eb9d3c17d72fbe55d076b84418');
  const modified = clone(policy);
  modified.approvedSourceExports[0].sha256 = '0'.repeat(64);
  assert.throws(() => checkPolicy(modified), /handoff/);
  modified.approvedSourceExports[0] = clone(files[1]);
  assert.throws(() => checkPolicy(modified), /handoff/);
  assert.throws(() => checkPolicy({...policy, approvedSourceExports: [...files].reverse()}), /handoff/);
});

test('all publication, data import and upload flags remain false', () => {
  for (const flag of ['publicationAllowed', 'packagePublishAllowed', 'containerPublishAllowed',
    'registryPublishAllowed', 'userDataImportAllowed', 'internalDocumentImportAllowed',
    'oldGitHistoryImportAllowed', 'automaticTelemetryAllowed', 'activityUploadAllowed']) {
    for (const value of [true, 'false', undefined]) assert.throws(() => checkPolicy({...policy, [flag]: value}));
  }
});

test('policy cannot authorize additional exports, private paths or future transitions', () => {
  for (const patch of [{approvedSourceExports: []}, {approvedSourceExports: [...files, files[0]]},
    {approvedPrivateSourcePaths: ['private/source.js']}, {expectedBaseCommit: head},
    {retainedControlFiles: [...CONTROLS, 'extra']}, {phase: 'public'},
    {futureExportsRequire: {}}, {unexpectedApproval: true}]) assert.throws(() => checkPolicy({...policy, ...patch}));
});

test('unsafe paths and invalid entry metadata fail before hashing', () => {
  for (const entry of [{path: '../secret'}, {path: '/absolute'}, {path: 'a/../b'},
    {path: '.git/config'}, {path: '.GIT/config'}, {path: 'a\\b'}, {path: 'a//b'},
    {path: 'a\nb'}, {path: 'a/./b'}, {size: -1}, {sha256: 'xyz'}, {extra: true}]) {
    const p = clone(policy); Object.assign(p.approvedSourceExports[0], entry);
    assert.throws(() => checkPolicy(p));
  }
});

test('exact 134-file tree passes; omissions, extras, duplicates, modes and links fail', () => {
  checkTree(entries, files);
  for (const changed of [entries.slice(1), [...entries, {path: 'extra', mode: '100644', type: 'blob'}],
    entries.map((e, i) => i ? e : entries[1]),
    entries.map((e, i) => i ? e : {...e, mode: '120000'}),
    entries.map((e, i) => i ? e : {...e, mode: '160000', type: 'commit'}),
    entries.map((e, i) => i ? e : {...e, mode: '100755'}),
    entries.map((e, i) => i ? e : {...e, type: 'tree'})]) assert.throws(() => checkTree(changed, files));
});

test('all approved source bytes match; same-length tampering and truncation fail', () => {
  const read = publicPath => readFileSync(path.join(root, publicPath));
  checkSourceBytes(files, read);
  assert.throws(() => checkSourceBytes(files, publicPath => {
    const bytes = read(publicPath); if (publicPath === files[0].path) bytes[0] ^= 1; return bytes;
  }), /hash mismatch/);
  assert.throws(() => checkSourceBytes(files, publicPath => read(publicPath).subarray(1)), /size or hash/);
  assert.throws(() => checkSourceBytes(files, () => 'not bytes'));
});

test('only the single main fast-forward from bootstrap is accepted', () => {
  checkUpdates(update, head); checkUpdates(update.trimEnd(), head);
  for (const changed of ['', update + update, update.replaceAll('refs/heads/main', 'refs/tags/v1'),
    update.replace('refs/heads/main', '(delete)'), update.replace(BASE, '0'.repeat(40)),
    update.replace(BASE, 'b'.repeat(40)), update.replace(head, 'b'.repeat(40)),
    update.replace('refs/heads/main', 'HEAD'), update + '\n']) assert.throws(() => checkUpdates(changed, head));
  assert.throws(() => checkUpdates(update, BASE));
});

test('unexpected ancestry, existing imports, remote branches and tags fail', () => {
  checkHistory('2', `${head} ${BASE}`, `${BASE}\trefs/heads/main`, head);
  for (const args of [['1', `${head} ${BASE}`, `${BASE}\trefs/heads/main`],
    ['3', `${head} ${BASE}`, `${BASE}\trefs/heads/main`],
    ['2', `${head} ${BASE} ${head}`, `${BASE}\trefs/heads/main`],
    ['2', `${head} ${'b'.repeat(40)}`, `${BASE}\trefs/heads/main`],
    ['2', `${head} ${BASE}`, `${head}\trefs/heads/main`],
    ['2', `${head} ${BASE}`, `${BASE}\trefs/heads/main\n${BASE}\trefs/tags/v1`],
    ['2', `${head} ${BASE}`, '']]) assert.throws(() => checkHistory(...args, head));
});

// Exercise orchestration offline with actual approved bytes. The command adapter
// is test-only; the CLI has no switch for skipping live GitHub or Git checks.
function offlineRunner(overrides = {}) {
  const tree = entries.map((e, i) => ({...e, oid: i.toString(16).padStart(40, '0')}));
  const blobs = new Map(tree.map(e => [e.oid, readFileSync(path.join(root, e.path))]));
  const values = new Map([
    ['rev-parse --show-toplevel', path.resolve(root)], ['rev-parse --is-shallow-repository', 'false'],
    ['remote', 'origin'], ['remote get-url --all origin', ORIGIN],
    ['remote get-url --push --all origin', ORIGIN], ['symbolic-ref --short HEAD', 'main'],
    ['status --porcelain --untracked-files=all', ''], ['rev-parse HEAD', head],
    [`show ${head}:release-policy.json`, JSON.stringify(policy)],
    [`ls-tree -rz ${head}`, tree.map(e => `${e.mode} ${e.type} ${e.oid}\t${e.path}\0`).join('')],
    [`rev-list --count ${head}`, '2'], [`rev-list --parents -n 1 ${head}`, `${head} ${BASE}`],
    [`ls-remote --refs ${ORIGIN}`, `${BASE}\trefs/heads/main`],
    [`cat-file commit ${head}`, `tree ${'b'.repeat(40)}\nparent ${BASE}\n\nSynthetic fixture\n`]
  ]);
  const calls = [];
  return {calls, run(command, args) {
    calls.push([command, ...args]);
    if (command === 'gh') {
      if (overrides.ghError) throw new Error('Synthetic offline API failure');
      return Buffer.from(overrides.ghResponse ?? JSON.stringify(repo));
    }
    assert.equal(command, 'git'); assert.equal(args[0], '--no-replace-objects');
    const key = args.slice(1).join(' ');
    if (overrides.fail === key) throw new Error('Synthetic offline Git failure');
    if (Object.hasOwn(overrides, key)) return Buffer.from(overrides[key]);
    if (key.startsWith('cat-file blob ')) {
      const value = blobs.get(args.at(-1)); assert(value, 'unexpected blob request'); return value;
    }
    assert(values.has(key), 'unexpected Git command: ' + key);
    return Buffer.from(values.get(key));
  }};
}

test('full offline pipeline accepts only verified bytes, history and identity', () => {
  const f = offlineRunner(); assert.equal(verifyRelease('origin', ORIGIN, update, {runCommand: f.run}), head);
  assert.equal(f.calls.at(-1)[0], 'gh');
  assert(f.calls.filter(c => c.includes('blob')).length >= 131);
});

test('unavailable or malformed GitHub identity fails closed', () => {
  for (const overrides of [{ghError: true}, {ghResponse: 'not JSON'}, {ghResponse: '{}'},
    {ghResponse: JSON.stringify({...repo, private: false})}]) {
    const f = offlineRunner(overrides);
    assert.throws(() => verifyRelease('origin', ORIGIN, update, {runCommand: f.run}));
  }
});

test('unexpected checkout, dirty files, alternate push URLs and failed Git checks block before API', () => {
  for (const overrides of [{'rev-parse --is-shallow-repository': 'true'}, {'remote': 'origin\nextra'},
    {'remote get-url --all origin': ORIGIN + '.evil'},
    {'remote get-url --push --all origin': ORIGIN + '\nhttps://example.invalid/repo'},
    {'symbolic-ref --short HEAD': 'other'}, {'status --porcelain --untracked-files=all': '?? extra'},
    {fail: `ls-remote --refs ${ORIGIN}`},
    {[`cat-file commit ${head}`]: 'tree synthetic\nparent wrong\n\nfixture'}]) {
    const f = offlineRunner(overrides);
    assert.throws(() => verifyRelease('origin', ORIGIN, update, {runCommand: f.run}));
    assert(!f.calls.some(c => c[0] === 'gh'));
  }
});

test('unexpected supplied destination executes no commands', () => {
  assert.throws(() => verifyRelease('origin', 'https://example.invalid/repo', update, {
    runCommand() { assert.fail('must reject before executing any command'); }
  }), /destination/);
});

test('actual temporary Git checkout rejects unapproved root history without network', () => {
  const directory = realpathSync(mkdtempSync(path.join(os.tmpdir(), 'articulate-guard-synthetic-')));
  const env = {...process.env, GIT_CONFIG_NOSYSTEM: '1', GIT_CONFIG_GLOBAL: '/dev/null',
    GIT_AUTHOR_NAME: 'Synthetic Fixture', GIT_AUTHOR_EMAIL: 'fixture@example.invalid',
    GIT_COMMITTER_NAME: 'Synthetic Fixture', GIT_COMMITTER_EMAIL: 'fixture@example.invalid'};
  const git = args => execFileSync('git', args, {cwd: directory, env, stdio: ['ignore', 'pipe', 'pipe']});
  try {
    git(['init', '--initial-branch=main', '--template=']); git(['remote', 'add', 'origin', ORIGIN]);
    // Copy exact allowlisted paths only. No recursive discovery or Git objects.
    for (const {path: publicPath} of entries) {
      const target = path.join(directory, publicPath); mkdirSync(path.dirname(target), {recursive: true});
      writeFileSync(target, readFileSync(path.join(root, publicPath)));
    }
    git(['add', '--', ...entries.map(e => e.path)]); git(['commit', '-m', 'Synthetic guard fixture']);
    const fixtureHead = git(['rev-parse', 'HEAD']).toString().trim();
    let apiCalled = false;
    const runner = (command, args) => {
      if (command === 'gh') { apiCalled = true; assert.fail('invalid history must not reach API'); }
      if (args.includes('ls-remote')) return Buffer.from(`${BASE}\trefs/heads/main`);
      return git(args);
    };
    assert.throws(() => verifyRelease('origin', ORIGIN,
      `refs/heads/main ${fixtureHead} refs/heads/main ${BASE}\n`,
      {root: directory, runCommand: runner}), /direct child/);
    assert.equal(apiCalled, false);
  } finally { rmSync(directory, {recursive: true, force: true}); }
});

test('CLI fails offline without leaking supplied secrets', () => {
  const marker = 'SYNTHETIC_SECRET';
  const r = spawnSync(process.execPath, [path.join(root, 'scripts/check-release-boundary.mjs'),
    'origin', `https://${marker}@example.invalid/repo`],
  {encoding: 'utf8', env: {...process.env, PATH: '/nonexistent'}, timeout: 10000});
  assert.equal(r.status, 1); assert.match(r.stderr, /Release push blocked/);
  assert.equal(r.stdout, ''); assert(!r.stderr.includes(marker));
});
