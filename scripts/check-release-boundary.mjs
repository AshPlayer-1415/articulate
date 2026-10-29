import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {isDeepStrictEqual} from 'node:util';

export const ORIGIN = 'https://github.com/AshPlayer-1415/articulate.git';
export const BASE = '55d70fa505bb51a400c8bb977a2334b825ec9f6d';
// Pinned from the approved sanitized handoff, independently of editable policy.
export const SOURCE_LIST_SHA256 = '42050049a719c9cd228f627492a751a8d8ba32eb9d3c17d72fbe55d076b84418';
export const CONTROLS = Object.freeze([
  'AGENTS.md', 'release-policy.json',
  'scripts/check-release-boundary.mjs', 'test/release-boundary.test.mjs'
]);
const ROOT = fileURLToPath(new URL('..', import.meta.url));
const sorted = values => [...values].sort();
export const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');

export function checkDestination(name, url, repo) {
  if (name !== 'origin' || url !== ORIGIN) throw new Error('Unexpected staging destination');
  if (!repo || repo.id !== 1436838545 || repo.full_name !== 'AshPlayer-1415/articulate' ||
      repo.private !== true || repo.visibility !== 'private' || repo.clone_url !== ORIGIN ||
      repo.archived !== false || repo.disabled !== false) {
    throw new Error('Staging identity or private visibility is unverified');
  }
}

export function checkPolicy(p) {
  const files = p?.approvedSourceExports;
  if (!Array.isArray(files) || files.length !== 130) throw new Error('Exact approved source list required');
  for (const e of files) {
    if (!e || !isDeepStrictEqual(sorted(Object.keys(e)), ['path', 'sha256', 'size']) ||
        typeof e.path !== 'string' || !/^[A-Za-z0-9_./-]+$/.test(e.path) ||
        e.path.startsWith('/') || e.path.split('/').some(c => !c || c === '.' || c === '..' || c.toLowerCase() === '.git') ||
        !Number.isSafeInteger(e.size) || e.size < 0 || !/^[a-f0-9]{64}$/.test(e.sha256)) {
      throw new Error('Invalid approved public entry');
    }
  }
  const canonical = files.map(({path, size, sha256}) => ({path, size, sha256}));
  if (new Set(files.map(e => e.path)).size !== 130 || sha256(JSON.stringify(canonical)) !== SOURCE_LIST_SHA256) {
    throw new Error('Source list differs from the approved handoff');
  }
  const expected = {
    schemaVersion: 2, phase: 'approved-private-import', expectedGitHubId: 1436838545,
    expectedRepository: 'AshPlayer-1415/articulate', expectedOrigin: ORIGIN,
    stagingVisibility: 'private', publicationAllowed: false, packagePublishAllowed: false,
    containerPublishAllowed: false, registryPublishAllowed: false, approvedSourceExports: files,
    approvedPrivateSourcePaths: [], userDataImportAllowed: false,
    internalDocumentImportAllowed: false, oldGitHistoryImportAllowed: false,
    automaticTelemetryAllowed: false, activityUploadAllowed: false,
    futureExportsRequire: {
      explicitLaterHumanInstruction: true, approvedSanitizedHandoff: true,
      exactReviewedPaths: true, sha256ContentHashes: true, globsOrDirectoryApprovalsAllowed: false
    },
    expectedBaseCommit: BASE, retainedControlFiles: [...CONTROLS]
  };
  if (!isDeepStrictEqual(p, expected)) throw new Error('Private import policy changed or publication enabled');
  return files;
}

export function checkTree(entries, files) {
  const allowed = [...files.map(e => e.path), ...CONTROLS];
  if (!Array.isArray(entries) || entries.length !== 134 ||
      !isDeepStrictEqual(sorted(entries.map(e => e.path)), sorted(allowed)) ||
      entries.some(e => e.mode !== '100644' || e.type !== 'blob')) {
    throw new Error('Tree must contain exactly 130 approved regular files and four controls');
  }
}

export function checkSourceBytes(files, readBytes) {
  for (const entry of files) {
    const bytes = readBytes(entry.path);
    if (!Buffer.isBuffer(bytes) || bytes.length !== entry.size || sha256(bytes) !== entry.sha256) {
      throw new Error('Approved source byte size or hash mismatch');
    }
  }
}

export function checkUpdates(input, head) {
  if (!/^[a-f0-9]{40}$/.test(head) || head === BASE ||
      input !== `refs/heads/main ${head} refs/heads/main ${BASE}\n` &&
      input !== `refs/heads/main ${head} refs/heads/main ${BASE}`) {
    throw new Error('Only one main update from the approved bootstrap root is permitted');
  }
}

export function checkHistory(count, parents, refs, head) {
  if (count !== '2' || parents !== `${head} ${BASE}` ||
      refs !== `${BASE}\trefs/heads/main`) {
    throw new Error('Requires one direct child of bootstrap and an unchanged remote main only');
  }
}

function run(command, args, cwd) {
  try {
    return execFileSync(command, args, {
      cwd, timeout: 30000, maxBuffer: 8 * 1024 * 1024,
      stdio: ['ignore', 'pipe', 'pipe'],
      env: {...process.env, GH_PROMPT_DISABLED: '1', GIT_TERMINAL_PROMPT: '0'}
    });
  } catch {
    // Never echo command output, tokens, supplied URLs, or file contents.
    throw new Error('Required Git or GitHub verification failed; push blocked');
  }
}

export function verifyRelease(name, url, input, {root = ROOT, runCommand = run} = {}) {
  // Validate the destination before executing commands or contacting a host.
  if (name !== 'origin' || url !== ORIGIN) throw new Error('Unexpected staging destination');
  const bytes = args => runCommand('git', ['--no-replace-objects', ...args], root);
  const git = args => bytes(args).toString('utf8').trim();
  if (git(['rev-parse', '--show-toplevel']) !== path.resolve(root) ||
      git(['rev-parse', '--is-shallow-repository']) !== 'false' ||
      git(['remote']) !== 'origin' ||
      git(['remote', 'get-url', '--all', 'origin']) !== ORIGIN ||
      git(['remote', 'get-url', '--push', '--all', 'origin']) !== ORIGIN ||
      git(['symbolic-ref', '--short', 'HEAD']) !== 'main') {
    throw new Error('Unexpected checkout, origin, or branch');
  }
  if (git(['status', '--porcelain', '--untracked-files=all']) !== '') {
    throw new Error('Review and commit all intended changes before pushing');
  }
  const head = git(['rev-parse', 'HEAD']);
  checkUpdates(input, head);
  const p = JSON.parse(bytes(['show', `${head}:release-policy.json`]).toString('utf8'));
  const files = checkPolicy(p);
  const rawTree = bytes(['ls-tree', '-rz', head]).toString('utf8');
  if (!rawTree.endsWith('\0')) throw new Error('Unexpected tree encoding');
  const entries = rawTree.slice(0, -1).split('\0').map(line => {
    const match = /^(\d{6}) (\w+) ([a-f0-9]{40})\t([^\0]+)$/.exec(line);
    if (!match) throw new Error('Unexpected tree entry');
    return {mode: match[1], type: match[2], oid: match[3], path: match[4]};
  });
  checkTree(entries, files);
  const byPath = new Map(entries.map(e => [e.path, e]));
  checkSourceBytes(files, publicPath => bytes(['cat-file', 'blob', byPath.get(publicPath).oid]));
  const pkg = JSON.parse(bytes(['cat-file', 'blob', byPath.get('package.json').oid]).toString('utf8'));
  if (pkg.private !== true) throw new Error('Package publication must remain disabled');
  checkHistory(git(['rev-list', '--count', head]), git(['rev-list', '--parents', '-n', '1', head]),
    git(['ls-remote', '--refs', ORIGIN]), head);
  // Check actual headers too; grafts cannot authorize unexpected parents.
  const parents = bytes(['cat-file', 'commit', head]).toString('utf8').split('\n\n')[0]
    .split('\n').filter(line => line.startsWith('parent '));
  if (!isDeepStrictEqual(parents, [`parent ${BASE}`])) throw new Error('Unexpected commit parents');
  const repo = JSON.parse(runCommand('gh', [
    'api', '--hostname', 'github.com', 'repos/AshPlayer-1415/articulate',
    '--jq', '{id,full_name,private,visibility,clone_url,archived,disabled}'
  ], root).toString('utf8'));
  checkDestination(name, url, repo);
  return head;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    if (process.argv.length !== 4) throw new Error('Run through the installed Git pre-push hook');
    verifyRelease(process.argv[2], process.argv[3], readFileSync(0, 'utf8'));
    process.stderr.write('Exact approved private staging import verified.\n');
  } catch {
    process.stderr.write('Release push blocked: private import verification failed.\n');
    process.exitCode = 1;
  }
}
