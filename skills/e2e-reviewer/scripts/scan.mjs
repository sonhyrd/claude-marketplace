#!/usr/bin/env node
// Three-tier E2E smell scanner. Orchestration only — every matcher is a subprocess:
//   Tier 1  eslint-plugin-{playwright,cypress}   (mechanical rules, official semantics)
//   Tier 2  ast-grep                             (Tree-sitter; lower FP rate where it applies)
//   Tier 3  ripgrep -P                           (PCRE2; the universal net, all 25 checks)
//
// The Tier-3 patterns are PCRE2 STRING LITERALS handed to rg verbatim. Do not "port" them to
// JS RegExp: at least one is load-bearing on a possessive quantifier that JS cannot express
// (see CHECKS #15 below), and rewriting it silently inverts the check. See
// tests/pattern-corpus/ for the fixture that guards this.
//
// Contract (frozen — callers depend on all three):
//   env      E2E_SMELL_FAIL_ON (p0|any|none), E2E_SMELL_NO_ESLINT_DOWNLOAD,
//            E2E_SMELL_NO_AST_GREP_DOWNLOAD, E2E_SMELL_ESLINT_TIMEOUT_SECS
//   exit     0 clean · 1 gate tripped · 2 bad usage (missing path, missing rg, bad FAIL_ON)
//   stdout   tier headers, per-check blocks, scope-filter line, Summary line
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = process.argv[2] ?? '.';
const FAIL_ON = process.env.E2E_SMELL_FAIL_ON ?? 'p0';
const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));

const out = (s) => process.stdout.write(s);
const err = (s) => process.stderr.write(s);
const plural = (n) => (String(n) === '1' ? '' : 's');

// Run ledger (issue #5) — the shared helper ships with playwright-test-generator, a sibling in
// every bundle install. Best-effort across the skill boundary: a standalone copy of this scanner
// without that sibling still scans, it just leaves no PTG_RUN record. Telemetry never blocks a scan.
try {
  const { ptgRun } = await import(
    new URL('../../playwright-test-generator/scripts/ptg-run.mjs', import.meta.url)
  );
  ptgRun(import.meta.url, 'scan');
} catch {
  /* sibling skill absent */
}

function isFile(p) {
  try {
    return fs.statSync(p).isFile();
  } catch {
    return false;
  }
}

function isDir(p) {
  try {
    return fs.statSync(p).isDirectory();
  } catch {
    return false;
  }
}

function commandExists(name) {
  return (process.env.PATH ?? '')
    .split(path.delimiter)
    .filter(Boolean)
    .some((dir) => {
      try {
        fs.accessSync(path.join(dir, name), fs.constants.X_OK);
        return true;
      } catch {
        return false;
      }
    });
}

// Every capture below mimics shell command substitution, `$(cmd)`, which strips ALL trailing
// newlines. Downstream code then re-adds exactly one when it prints — so a captured blob's trailing
// blank lines must not survive into the report, or every block grows phantom padding.
const stripTrailingNewlines = (s) => s.replace(/\n+$/, '');

// Capture a subprocess's stdout, ignoring its exit code and stderr. Every matcher call in this file
// is best-effort: rg exits 1 on "no match", and a crashed engine must degrade to zero hits for that
// check rather than take the whole scan down.
function capture(cmd, args, opts = {}) {
  const r = spawnSync(cmd, args, { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, ...opts });
  return stripTrailingNewlines(r.stdout ?? '');
}

// Run with stdout and stderr merged into ONE stream, the way `cmd 2>&1` does. Node's spawnSync hands
// back two separate buffers, so concatenating them would reorder genuinely interleaved output; point
// both fds at the same file instead and let the kernel do the interleaving.
function captureMerged(cmd, args, opts = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'e2e-scan-'));
  const tmp = path.join(dir, 'out');
  const fd = fs.openSync(tmp, 'w');
  let open = true;
  try {
    const result = spawnSync(cmd, args, { stdio: ['ignore', fd, fd], ...opts });
    fs.closeSync(fd);
    open = false;
    return { text: stripTrailingNewlines(fs.readFileSync(tmp, 'utf8')), result };
  } finally {
    if (open) fs.closeSync(fd);
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

function rgMatches(pattern, target, extraArgs = []) {
  const r = spawnSync('rg', ['-lq', pattern, target, ...extraArgs], { stdio: 'ignore' });
  return r.status === 0;
}

const fileLinesCache = new Map();
function fileLines(f) {
  if (!fileLinesCache.has(f)) {
    let lines = null;
    try {
      if (isFile(f)) lines = fs.readFileSync(f, 'utf8').split('\n');
    } catch {
      lines = null;
    }
    fileLinesCache.set(f, lines);
  }
  return fileLinesCache.get(f);
}

// Shared `// JUSTIFIED:` suppression, honored by ALL THREE tiers so the documented convention is
// consistent. A hit at <file>:<line> is suppressed when the marker sits on the line itself, or
// anywhere in the contiguous //-comment block immediately above it (at most 5 lines — a rationale
// legitimately wraps). The #7 no-exemption contract is the CALLER's job: a committed focused test
// is never justifiable, so callers must not consult this for it.
function lineIsJustified(file, lineNo) {
  const n = Number(lineNo);
  if (!Number.isInteger(n) || n < 1) return false;
  const lines = fileLines(file);
  if (lines === null) return false;

  const self = lines[n - 1];
  if (self !== undefined && self.includes('JUSTIFIED:')) return true;

  const stopAt = n > 5 ? n - 5 : 1;
  for (let i = n - 1; i >= stopAt; i--) {
    const text = (lines[i - 1] ?? '').replace(/^\s+/, '');
    if (!text.startsWith('//')) break; // the comment block ended — nothing above it counts
    if (text.includes('JUSTIFIED:')) return true;
  }
  return false;
}

// ---------------------------------------------------------------------------- preconditions
if (!fs.existsSync(ROOT)) {
  err(`error: path does not exist: ${ROOT}\n`);
  process.exit(2);
}
if (!commandExists('rg')) {
  err('error: rg is required (https://github.com/BurntSushi/ripgrep)\n');
  process.exit(2);
}

// Eval fixtures hold intentional anti-patterns and are excluded from normal scans — EXCEPT when
// the scan root is itself inside an evals/files tree, which is how a fixture corpus self-tests.
// A ROOT that is a plain file has no directory to resolve, so the exclusion stays on.
const rootAbs = isDir(ROOT) ? fs.realpathSync(ROOT) : '';
const EVAL_FIXTURE_EXCLUDES = rootAbs.includes('/evals/files')
  ? []
  : ['--glob', '!**/evals/files/**'];

// ---------------------------------------------------------------------------- tier state
let totalHits = 0;
let p0Hits = 0;
let p1Hits = 0;
let llmTriageHits = 0;
let astTotal = 0;
let eslintRan = false;
let playwrightLintDone = false;
let cypressLintDone = false;

// Coverage map — the checks the eslint plugin's `recommended` config catches reliably. When the
// plugin runs, Tiers 2 and 3 skip these to avoid double-reporting. Tier-1 findings are mapped onto
// the SAME p0/p1 counters (see countEslintHits), so skipping the lower tiers can never zero the
// exit gate. Checks outside these lists are deliberately reported by every tier that matches.
const PLAYWRIGHT_LINT_COVERS = ['#7', '#9', '#15', '#16'];
const CYPRESS_LINT_COVERS = ['#7', '#9b'];

function shouldSkipPattern(id) {
  if (playwrightLintDone && PLAYWRIGHT_LINT_COVERS.includes(id)) return true;
  if (cypressLintDone && CYPRESS_LINT_COVERS.includes(id)) return true;
  return false;
}

const AST_RULE_TO_PATTERN = {
  'sg-15-missing-await-playwright-expect': '#15',
  'sg-4ce-count': '#4c-4e',
  'sg-4ce-state-bool': '#4c-4e',
  'sg-4ce-text': '#4c-4e',
  'sg-4f-locator-as-truthy': '#4f',
};

// ============================================================================ Tier 1: ESLint
// The framework's own plugin beats our regex on the mechanical rules. Prefers a locally installed
// plugin; falls back to `npx --yes` (mirrors the ast-grep tier). Skipped when the repo has no
// Playwright/Cypress import, or npx is absent.

// Resolve the plugins' ABSOLUTE entry paths. ESLint v9 loads eslint.config.mjs via an ESM import
// whose resolution is anchored at the CONFIG FILE's directory, so a config in a temp dir cannot see
// npx-cache-installed plugins by bare name. npm >=9 exposes the npx env only via PATH (no
// NODE_PATH), so derive its node_modules root from PATH[0] and resolve against that explicitly.
const RESOLVE_CJS = `
const cands = [
  process.env.PATH.split(':')[0].replace(/\\/\\.bin$/, ''),
  process.cwd() + '/node_modules',
];
const r = (n) => {
  for (const c of cands) { try { return require.resolve(n, { paths: [c] }); } catch (e) {} }
  throw new Error('unresolvable: ' + n);
};
console.log(JSON.stringify(process.argv.slice(2).map(r)));
`;

function eslintConfigSource(plugin, abs, silentPassAbs, ignoreEvalFixtures) {
  const evalIgnore = ignoreEvalFixtures ? "'**/evals/files/**'," : '';
  const spImport = silentPassAbs ? `import spp from '${silentPassAbs}';` : '';
  const spPlugin = silentPassAbs ? `, '${plugin}-silent-pass': spp` : '';
  const spRule = silentPassAbs ? `, '${plugin}-silent-pass/no-silent-pass': 'error'` : '';
  const languageOptions =
    `languageOptions: { parser: tsParser, ecmaVersion: 'latest', sourceType: 'module', ` +
    `parserOptions: { ecmaFeatures: { jsx: true } } }`;

  if (plugin === 'playwright') {
    return `import playwright from '${abs.plugin}';
import tsParser from '${abs.parser}';
${spImport}
export default [
  { ignores: ['**/node_modules/**','**/dist/**','**/build/**','**/.next/**','**/out/**','**/coverage/**','**/public/**','**/*.min.js',${evalIgnore}] },
  {
    files: ['**/*.ts','**/*.js','**/*.tsx','**/*.jsx'],
    plugins: { playwright${spPlugin} },
    ${languageOptions},
    rules: { ...(playwright.configs['flat/recommended'] ?? playwright.configs.recommended).rules${spRule} },
  },
];
`;
  }
  return `import cypress from '${abs.plugin}';
import mocha from '${abs.mocha}';
import tsParser from '${abs.parser}';
${spImport}
const cypressRules = (cypress.configs['flat/recommended'] ?? cypress.configs.recommended).rules;
export default [
  { ignores: ['**/node_modules/**','**/dist/**','**/build/**','**/coverage/**','**/*.min.js',${evalIgnore}] },
  {
    files: ['**/*.ts','**/*.js','**/*.tsx','**/*.jsx'],
    plugins: { cypress, mocha${spPlugin} },
    ${languageOptions},
    rules: { ...cypressRules, 'mocha/no-exclusive-tests': 'error'${spRule} },
  },
];
`;
}

// Walk eslint's stylish output and map the covered rules onto the same counters Tier 3 uses.
// Without this, a repo whose only P0 is `test.only` exits 0 under FAIL_ON=p0 whenever Tier 1 runs —
// because Tiers 2 and 3 skipped it as "covered".
//   P0: no-focused-test (#7), missing-playwright-await (#15/#16), mocha/no-exclusive-tests
//       (#7 Cypress), no-silent-pass (#4f, via the companion plugin)
//   P1: no-wait-for-timeout (#9), no-unnecessary-waiting (#9b)
// #7's rules are NEVER exempt, per the no-JUSTIFIED-for-#7 contract; the rest honor the marker.
function countEslintHits(text) {
  const NEVER_EXEMPT = ['/no-focused-test', '/no-exclusive-tests'];
  const P0_EXEMPTIBLE = ['/no-silent-pass', '/missing-playwright-await'];
  const P1_EXEMPTIBLE = ['/no-wait-for-timeout', '/no-unnecessary-waiting'];
  const endsWithAny = (s, list) => list.some((suffix) => s.endsWith(suffix));

  let p0 = 0;
  let p1 = 0;
  let currentFile = '';

  for (const line of text.split('\n')) {
    // A file header is a bare path on its own line — absolute, or relative with a dot in it.
    const isHeader =
      line.startsWith('/') ||
      (line !== '' &&
        !line.startsWith(' ') &&
        line.includes('.') &&
        !line.includes('problem') &&
        !line.includes('✖') &&
        !line.includes('potentially fixable'));
    if (isHeader) {
      currentFile = line;
      continue;
    }

    // A hit is "  <line>:<col>  <severity>  <message>  <rule>".
    const body = line.replace(/^\s+/, '');
    const lineNo = body.slice(0, body.indexOf(':'));
    if (!/^[0-9]+$/.test(lineNo)) continue;

    const rule = line.replace(/\s+$/, ''); // the rule id is the trailing field
    const file = isFile(currentFile) ? currentFile : `${ROOT}/${currentFile}`;

    if (endsWithAny(rule, NEVER_EXEMPT)) p0 += 1;
    else if (endsWithAny(rule, P0_EXEMPTIBLE)) {
      if (!lineIsJustified(file, lineNo)) p0 += 1;
    } else if (endsWithAny(rule, P1_EXEMPTIBLE)) {
      if (!lineIsJustified(file, lineNo)) p1 += 1;
    }
  }
  return { p0, p1 };
}

function tryEslint(plugin, label) {
  if (!commandExists('npx')) return;

  let mode;
  let npxArgs;
  if (isDir(path.join(ROOT, 'node_modules', `eslint-plugin-${plugin}`))) {
    mode = 'locally installed';
    npxArgs = ['--no-install', 'eslint'];
  } else if (process.env.E2E_SMELL_NO_ESLINT_DOWNLOAD === '1') {
    out(
      `\n[ESLint] ${label} — eslint-plugin-${plugin} not installed and ` +
        `E2E_SMELL_NO_ESLINT_DOWNLOAD=1 — skipping\n`,
    );
    return;
  } else {
    mode = 'auto-downloaded via npx (set E2E_SMELL_NO_ESLINT_DOWNLOAD=1 to skip)';
    // `typescript` MUST be a direct -p dep. It is only a PEER dep of @typescript-eslint/parser, and
    // npx materializes its cache env using the npmrc of the cwd it runs from: inside a repo whose
    // .npmrc sets legacy-peer-deps=true, the env installs WITHOUT peers, the parser dies with
    // "Cannot find module 'typescript'" (rc=2), and Tier 1 silently never fires — for that repo and
    // for every later scan reusing the poisoned cache. A direct dep survives every peer policy.
    npxArgs = [
      '--yes',
      '-p', 'eslint@^9',
      '-p', `eslint-plugin-${plugin}`,
      '-p', '@typescript-eslint/parser',
      '-p', 'typescript@^5',
      '-p', `eslint-plugin-${plugin}-silent-pass`,
    ];
    if (plugin === 'cypress') npxArgs.push('-p', 'eslint-plugin-mocha');
    npxArgs.push('eslint');
  }

  const cfgDir = fs.mkdtempSync(path.join(os.tmpdir(), 'e2e-eslint-'));
  try {
    const resolveCjs = path.join(cfgDir, 'resolve.cjs');
    fs.writeFileSync(resolveCjs, RESOLVE_CJS);

    // Same -p set as the eslint run, but exec `node` instead of `eslint`.
    const resolveArgs =
      mode === 'locally installed' ? ['--no-install', 'node'] : [...npxArgs.slice(0, -1), 'node'];
    const resolveInNpxEnv = (names) => {
      const stdout = capture('npx', [...resolveArgs, resolveCjs, ...names], {
        cwd: ROOT,
        stdio: ['ignore', 'pipe', 'ignore'],
      });
      const lines = stdout.replace(/\n$/, '').split('\n');
      const last = lines[lines.length - 1] ?? '';
      if (!last.startsWith('[')) return null;
      try {
        return JSON.parse(last);
      } catch {
        return null;
      }
    };

    const want = [`eslint-plugin-${plugin}`, '@typescript-eslint/parser'];
    if (plugin === 'cypress') want.push('eslint-plugin-mocha');
    const resolved = resolveInNpxEnv(want);
    if (!resolved) {
      out(
        `\n[ESLint] ${label} — could not resolve eslint-plugin-${plugin} (or ` +
          `@typescript-eslint/parser) — skipping Tier 1; Tier 2/3 cover\n`,
      );
      return;
    }
    const abs = { plugin: resolved[0], parser: resolved[1], mocha: resolved[2] };

    // Companion silent-pass plugin (dogfoods the #4f always-pass rule). Best-effort and resolved
    // SEPARATELY, so a missing or offline package never breaks Tier 1 — the official plugin still
    // runs, and Tiers 2/3 still cover #4f.
    const silentPass = resolveInNpxEnv([`eslint-plugin-${plugin}-silent-pass`]);
    const silentPassAbs = silentPass ? silentPass[0] : '';

    const cfg = path.join(cfgDir, 'eslint.config.mjs');
    fs.writeFileSync(
      cfg,
      eslintConfigSource(plugin, abs, silentPassAbs, EVAL_FIXTURE_EXCLUDES.length > 0),
    );

    out(`\n[ESLint] ${label} — running eslint-plugin-${plugin} (${mode})\n`);

    // Watchdog: npx's auto-download, or eslint itself, can hang on a large or offline environment.
    // detached:true makes the child a process-group leader, so on timeout we can SIGKILL the whole
    // group — npx's node grandchildren survive a bare kill on the npx pid alone.
    const capSecs = process.env.E2E_SMELL_ESLINT_TIMEOUT_SECS ?? '300';
    const { text, result } = captureMerged(
      'npx',
      [...npxArgs, '--no-error-on-unmatched-pattern', '-c', cfg, '.'],
      {
        cwd: ROOT,
        // ESLINT_USE_FLAT_CONFIG opts eslint v8.21+ local installs onto the same flat-config path
        // v9 takes by default; anything older fails with rc>=2 and we fall through below WITHOUT
        // claiming coverage.
        env: { ...process.env, ESLINT_USE_FLAT_CONFIG: 'true' },
        timeout: Number(capSecs) * 1000,
        killSignal: 'SIGKILL',
        detached: true,
      },
    );

    if (result.error?.code === 'ETIMEDOUT') {
      if (result.pid) {
        try {
          process.kill(-result.pid, 'SIGKILL'); // the whole group, not just npx
        } catch {
          /* already gone */
        }
      }
      out(`  [watchdog] eslint exceeded ${capSecs}s — killed; Tier 2/3 still cover these patterns\n`);
      return;
    }

    // EXIT-CODE GATE — the silent-always-pass bug class this skill exists to catch. eslint exits
    // 0 = clean, 1 = findings. ANYTHING else (2 = config/usage error, 127 = not found, an npx or
    // network crash, a signal) means Tier 1 did NOT cover these patterns. Never claim it did, or
    // Tiers 2/3 would skip #7/#9/#15/#16 (#7/#9b for Cypress) and the scan would pass silently.
    const rc = result.status ?? 2; // a null status means it never exited normally — treat as crashed
    if (rc >= 2) {
      out(`  [ESLint] crashed or unusable (exit ${rc}) — Tier 2/3 keep covering these patterns\n`);
      out(
        text
          .split('\n')
          .slice(0, 5)
          .map((l) => `    ${l}\n`)
          .join(''),
      );
      return;
    }

    if (rc === 1 || /error|warning/.test(text)) {
      out(
        text
          .split('\n')
          .map((l) => `  ${l}\n`)
          .slice(0, 100)
          .join(''),
      );
    } else {
      out('  no findings\n');
    }

    // Count from the FULL output, not the display-truncated head.
    const { p0, p1 } = countEslintHits(text);
    if (p0 > 0) {
      p0Hits += p0;
      totalHits += p0;
    }
    if (p1 > 0) {
      p1Hits += p1;
      totalHits += p1;
    }
    eslintRan = true;
    if (plugin === 'playwright') playwrightLintDone = true;
    if (plugin === 'cypress') cypressLintDone = true;
  } finally {
    fs.rmSync(cfgDir, { recursive: true, force: true });
  }
}

const ESLINTRC_FILES = [
  '.eslintrc', '.eslintrc.json', '.eslintrc.js', '.eslintrc.cjs', '.eslintrc.yml',
  '.eslintrc.yaml', 'eslint.config.js', 'eslint.config.mjs', 'eslint.config.ts',
];
if (ESLINTRC_FILES.some((f) => isFile(path.join(ROOT, f)))) {
  out(
    '\n[note] Project has its own ESLint config — our Tier 1 uses `recommended` preset (not your ' +
      'config) for predictable output. If you already lint with eslint-plugin-{playwright,cypress} ' +
      'in CI/IDE, set E2E_SMELL_NO_ESLINT_DOWNLOAD=1 to skip Tier 1 here and let your pipeline own ' +
      'it (Tier 2 ast-grep + Tier 3 regex still run for the gaps your lint may not cover).\n',
  );
}

// Detect each framework by its actual imports, then opt into eslint-plugin-* if it is installed.
const CY_IMPORT_PATTERN =
  "from\\s+['\"]cypress['\"]|[^A-Za-z0-9_]cy\\.(visit|get|contains|request|intercept|session|origin|task|wait|fixture)\\(";
const pwImportsFound = rgMatches('@playwright/test', ROOT, ['--glob', '!node_modules/**']);
if (pwImportsFound) tryEslint('playwright', 'Playwright');
const cyImportsFound = rgMatches(CY_IMPORT_PATTERN, ROOT, [
  '--glob', '!node_modules/**',
  '--glob', '*.{cy.ts,cy.js,ts,js}',
]);
if (cyImportsFound) tryEslint('cypress', 'Cypress');

if (!eslintRan) {
  // ONE cause, named. The old message OR'ed three causes into one line, which made field failures
  // undiagnosable — the real cause turned out to be an eslint crash (a missing `typescript` peer in
  // the npx env; see the npxArgs comment above).
  if (!pwImportsFound && !cyImportsFound) {
    out(`\n[ESLint] Tier 1 not run — no Playwright/Cypress imports detected under ${ROOT}.\n`);
  } else if (!commandExists('npx')) {
    out('\n[ESLint] Tier 1 not run — npx is not on PATH.\n');
  } else if (process.env.E2E_SMELL_NO_ESLINT_DOWNLOAD === '1') {
    out(
      '\n[ESLint] Tier 1 not run — E2E_SMELL_NO_ESLINT_DOWNLOAD=1 is set and no locally installed ' +
        'plugin was found.\n',
    );
  } else {
    out(
      '\n[ESLint] Tier 1 not run — imports were detected but the eslint run failed; the [ESLint] ' +
        'line above names the exact failure (resolve error, crash exit code, or watchdog timeout).\n',
    );
  }
}

// ============================================================================ Tier 2: ast-grep
// Tree-sitter AST patterns. Lower FP rate than regex on what it covers (#15, #4c-4e, #4f). Skipped
// silently when neither ast-grep nor npx is on PATH. The rules are language:TypeScript by design —
// .js/.jsx/.tsx coverage is delegated to the always-on Tier-3 regex net.
function resolveAstGrep() {
  if (commandExists('ast-grep')) return ['ast-grep'];
  if (commandExists('sg')) return ['sg'];
  if (process.env.E2E_SMELL_NO_AST_GREP_DOWNLOAD === '1') return null;
  if (commandExists('npx')) return ['npx', '--yes', '@ast-grep/cli'];
  return null;
}

const AST_GREP = resolveAstGrep();
const AST_RULES_DIR = path.join(SCRIPT_DIR, 'ast-grep-rules');

if (AST_GREP && isDir(AST_RULES_DIR)) {
  out('\n--- Tier 2: AST-grep checks (Tree-sitter; covers FP-prone patterns more accurately) ---\n');
  let astSkipped = 0;

  const rules = fs
    .readdirSync(AST_RULES_DIR)
    .filter((f) => f.startsWith('sg-') && f.endsWith('.yml'))
    .filter((f) => !f.startsWith('sg-postfix-')) // postfix rules belong to verify-fixes.sh
    .sort();

  for (const ruleFile of rules) {
    const ruleName = ruleFile.replace(/\.yml$/, '');

    // Dedupe: Tier 1 wins. If the eslint plugin covering this pattern ran, skip the AST rule.
    const patternId = AST_RULE_TO_PATTERN[ruleName];
    if (patternId && shouldSkipPattern(patternId)) {
      astSkipped += 1;
      continue;
    }

    const [cmd, ...cmdArgs] = AST_GREP;
    const { text: astOut } = captureMerged(cmd, [
      ...cmdArgs,
      'scan',
      '--rule',
      path.join(AST_RULES_DIR, ruleFile),
      ROOT,
    ]);

    // Honor `// JUSTIFIED:` (parity with Tiers 1 and 3). ast-grep prints each hit's location as
    // "  ┌─ <file>:<line>:<col>".
    let astCount = 0;
    for (const loc of astOut.match(/\S+:\d+:\d+/g) ?? []) {
      const [file, lineNo] = loc.split(':');
      if (lineIsJustified(file, lineNo)) continue;
      if (!isFile(file) && lineIsJustified(path.join(ROOT, file), lineNo)) continue;
      astCount += 1;
    }

    if (astCount > 0) {
      out(`\n[AST] ${ruleName} (${astCount} hit${plural(astCount)})\n`);
      out(
        astOut
          .split('\n')
          .slice(0, 30)
          .map((l) => `  ${l}\n`)
          .join(''),
      );
      astTotal += astCount;
    }
  }

  out(`\n  ast-grep total: ${astTotal} hit(s)`);
  if (astSkipped > 0) {
    out(` (${astSkipped} rule${plural(astSkipped)} skipped — covered by Tier 1 eslint)`);
  }
  out('\n');
}

// ============================================================================ Tier 3: regex net
out(
  '\n--- Tier 3: Bundled regex checks (universal fallback for grep-detectable patterns and gaps ' +
    'eslint/ast-grep miss) ---\n',
);

// Phase-0 file scope filter: a check only applies to files that are actually E2E surface — a
// `.cy.` basename, a `cypress/` path component, an @playwright/test import, a cypress
// import/require or `cy.<cmd>(` usage, or a Playwright RUNTIME marker (`page.goto/route/locator/
// getBy*(`, `test.use(`, `expect(page`).
//
// The runtime markers matter: a spec importing test/expect from a project FIXTURES WRAPPER
// (`import { test } from '../fixtures'`) carries no literal @playwright/test line, and an
// import-only filter scoped it OUT — a staging-writing spec once sailed through with a false
// "0 P0". This also kills backend/unit-suite FPs that share the *.test.* suffix (seen in the
// field: a Knex `.first()` flagged as #10a, an `import type ... secret` line flagged as #14).
// Skipped files are counted and reported before the Summary — never silently.
const SCOPE_MARKER =
  "@playwright/test|from\\s+['\"]cypress['\"]|require\\(\\s*['\"]cypress['\"]|(^|[^A-Za-z0-9_])cy\\.[a-z]+\\(|page\\.(goto|route|locator|getBy[A-Z][A-Za-z]*)\\s*\\(|test\\.use\\s*\\(|expect\\(\\s*page\\b";

const scopeCache = new Map();
const scopeOut = new Set();

function fileInE2eScope(f) {
  if (path.basename(f).includes('.cy.')) return true;
  if (`/${f}/`.includes('/cypress/')) return true;
  return spawnSync('rg', ['-q', SCOPE_MARKER, f], { stdio: 'ignore' }).status === 0;
}

function inScope(f) {
  if (!scopeCache.has(f)) {
    const verdict = fileInE2eScope(f);
    scopeCache.set(f, verdict);
    if (!verdict) scopeOut.add(f);
  }
  return scopeCache.get(f);
}

// The e2e content flag's marker set deliberately ERRS TOWARD INCLUSION (fail-open): a unit file
// mentioning e.g. `router.page.url()` is admitted and its hits flow on to Phase 2, which owns
// residual unit-test elimination. Tightening this risks silently dropping real specs. It exists to
// kill Vitest/Jest/RTL unit-test bleed-through — the #1 FP root cause across the 77-repo OSS corpus.
const E2E_CONTENT_MARKER =
  "@playwright/test|async \\(\\{ ?page|(^|[^A-Za-z_])page\\.(goto|locator|getBy|url|waitFor|click|fill)|test\\.(describe|use|step|beforeEach|afterEach|fixme|slow|skip)\\s*\\(|from\\s+['\"][^'\"]*fixtures|cy\\.[a-z]+\\(";

const RG_EXCLUDES = [
  '--glob', '!node_modules/**',
  '--glob', '!.git/**',
  '--glob', '!playwright-report/**',
  '--glob', '!cypress/reports/**',
  '--glob', '!test-results/**',
  '--glob', '!dist/**',
  '--glob', '!build/**',
  '--glob', '!.next/**',
  '--glob', '!out/**',
  '--glob', '!coverage/**',
  '--glob', '!public/**',
  '--glob', '!*.min.js',
  '--glob', '!*.min.ts',
];

// An rg hit line is `<path>:<line>:<content>`. The path may itself contain a colon, but rg emits
// the path first and the line number second, so splitting from the LEFT on the first two colons is
// only wrong for paths with colons in them — which the shell implementation also mis-split, and
// which no E2E repo has. Keep the same split.
const hitFile = (hit) => hit.slice(0, hit.indexOf(':'));
const hitLineNo = (hit) => {
  const rest = hit.slice(hit.indexOf(':') + 1);
  return rest.slice(0, rest.indexOf(':'));
};

// Run one check from the CHECKS table below. Every field is named, so adding a 26th check is adding
// an object — not threading another positional argument through a function.
//
//   severity  'P0' | 'P1'                     the documented severity; drives the counter it lands in
//   id        '#4c-4e'                        stable pattern id — NEVER renumber (see AGENTS.md)
//   title     human-readable, printed         the block header a reviewer reads
//   pattern   PCRE2 string, handed to rg -P   VERBATIM. Not a JS RegExp. See the #15 note below.
//   globs     [glob, …]                       rg --glob includes, unioned
//   flags     ['e2e'|'triage'|'cont', …]      optional post-filters, applied in the order below
function runCheck({ severity, id, title, pattern, globs, flags = [] }) {
  // Dedupe: covered by an eslint plugin that already ran in Tier 1.
  if (shouldSkipPattern(id)) return;

  // Several --glob includes, which rg unions. That lets one check cover both a basename suffix
  // (*.cy.js) and a path location (cypress/integration/**/*.js — the legacy Cypress layout, which
  // has no .cy./.spec./.test. suffix and was once invisible here).
  //
  // rg gives precedence to LATER globs, so the includes MUST come before the negations — an include
  // declared last would re-admit files inside excluded dirs, which previously let vendored dist/
  // hits through on repos that do not gitignore their build output.
  const includeGlobs = globs.flatMap((g) => ['--glob', g]);

  const raw = capture('rg', [
    '-nP', '-H', '--color', 'never', '--hidden',
    ...includeGlobs,
    ...RG_EXCLUDES,
    ...EVAL_FIXTURE_EXCLUDES,
    pattern, '--', ROOT,
  ], { stdio: ['ignore', 'pipe', 'ignore'] });

  // Drop matches inside single-line `//` comments — a Phase 1 limitation, see SKILL.md. Trailing
  // comments and block comments stay Phase 2's responsibility.
  let hits = raw.split('\n').filter((line) => {
    const fields = line.split(':');
    if (fields.length < 3) return false;
    return !fields.slice(2).join(':').replace(/^\s+/, '').startsWith('//');
  });

  // Phase-0 scope filter. Runs BEFORE the JUSTIFIED walk so out-of-scope files never cost per-hit
  // file reads.
  if (hits.length) hits = hits.filter((hit) => inScope(hitFile(hit)));

  // `// JUSTIFIED: <reason>` suppression. Block-level and multi-line-chain placements remain Phase
  // 2's job, per the SKILL.md suppression contract. #7 is exempt from the exemption: a committed
  // focused test is never justifiable.
  if (hits.length && id !== '#7') {
    hits = hits.filter((hit) => !lineIsJustified(hitFile(hit), hitLineNo(hit)));
  }

  // Optional e2e content scoping.
  if (flags.includes('e2e') && hits.length) {
    const keep = new Map();
    hits = hits.filter((hit) => {
      const f = hitFile(hit);
      if (!keep.has(f)) {
        keep.set(f, spawnSync('rg', ['-q', E2E_CONTENT_MARKER, f], { stdio: 'ignore' }).status === 0);
      }
      return keep.get(f);
    });
  }

  // Continuation filter: drop a hit whose PRECEDING line ends in '(' or ',' — the matched line is
  // an argument inside a multi-line expect(...) call, not a dangling statement. This is what lets
  // #8a detect semicolonless dangling locators without re-admitting the continuation FPs.
  if (flags.includes('cont') && hits.length) {
    hits = hits.filter((hit) => {
      const n = Number(hitLineNo(hit));
      if (!(n > 1)) return true;
      const prev = ((fileLines(hitFile(hit)) ?? [])[n - 2] ?? '').replace(/\s+$/, '');
      return !(prev.endsWith('(') || prev.endsWith(','));
    });
  }

  if (!hits.length) return;

  const count = hits.length;
  totalHits += count;

  let sevLabel = `[${severity}]`;
  if (flags.includes('triage')) {
    // The documented severity does not change, but grep alone cannot confirm the context that makes
    // these hits real (#4b needs destructive-action context — ~90% FP on client-rendered apps, where
    // a positive toBeAttached is a legitimate render gate). Route them to a Phase-2 LLM-triage count
    // instead of the p0 exit gate.
    llmTriageHits += count;
    sevLabel = `[${severity}?][LLM-TRIAGE]`;
  } else if (severity === 'P0') {
    p0Hits += count;
  } else {
    p1Hits += count;
  }

  out(`\n${sevLabel} ${id} ${title} (${count} hit${plural(count)})\n`);
  out(hits.map((h) => `  ${h}\n`).join(''));
}

// The legacy Cypress layout — cypress/integration/**/*.{js,ts} — has no .cy./.spec./.test. suffix,
// so a suffix-only glob misses it. Appended to the Cypress-intended checks below so committed
// .only, error swallowing, etc. are caught in that classic layout too.
const CYI = '**/cypress/integration/**/*.{js,ts}';
const SPEC = '*.{spec.ts,spec.js,test.ts,test.js}';
const SPEC_CY = '*.{spec.ts,spec.js,test.ts,test.js,cy.ts,cy.js}';
const CY = '*.{cy.ts,cy.js}';
const SRC = '*.{ts,js,tsx,jsx}';
const SRC_CY = '*.{ts,js,tsx,jsx,cy.ts,cy.js}';

// Web-first matchers — the whitelist that keeps #15 to genuinely-unawaited assertions.
const WEB_FIRST =
  'toBeVisible|toBeHidden|toHaveText|toContainText|toHaveValue|toHaveValues|toHaveClass|' +
  'toHaveAttribute|toBeChecked|toBeEnabled|toBeDisabled|toBeEditable|toBeFocused|toBeEmpty|' +
  'toHaveCount|toHaveCSS|toHaveId|toHaveJSProperty|toHaveScreenshot|toHaveURL|toHaveTitle';

// ---------------------------------------------------------------------------------------------
// THE CHECK TABLE. Adding a check is adding an object. The ORDER here is the order of the report,
// so appending is safe and reordering is not.
//
// `pattern` is a PCRE2 string handed to `rg -P` VERBATIM. It is NOT a JS RegExp and must not be
// rewritten as one — see the #15 entry, and tests/pattern-corpus/README.md.
//
// Every id needs a fixture in tests/pattern-corpus/: one deliberate hit and one JUSTIFIED twin.
// ---------------------------------------------------------------------------------------------
const CHECKS = [
  { severity: 'P0', id: '#3', title: 'Error swallowing via empty catch (test scope)',
    pattern: '\\.catch\\(\\s*(async\\s*)?\\(\\)\\s*=>', globs: [SPEC_CY, CYI], flags: ['e2e'] },

  { severity: 'P0', id: '#7', title: 'Focused test committed',
    pattern: '\\.(only)\\(', globs: [SPEC_CY, CYI] },

  { severity: 'P1', id: '#9', title: 'Playwright hard-coded sleep',
    pattern: 'waitForTimeout', globs: [SRC], flags: ['e2e'] },

  { severity: 'P1', id: '#9b', title: 'Cypress hard-coded sleep',
    pattern: 'cy\\.wait\\(\\d', globs: [CY, CYI] },

  { severity: 'P1', id: '#6', title: 'Raw DOM query inside test code',
    pattern: 'document\\.querySelector', globs: [SRC_CY], flags: ['e2e'] },

  { severity: 'P0', id: '#4a', title: 'Always-true numeric assertion',
    pattern: 'toBeGreaterThanOrEqual\\(0\\)', globs: [SRC_CY], flags: ['e2e'] },

  // #4b is grep-undecidable: a positive toBeAttached is only vacuous when a destructive action
  // should have removed the element; on a client-rendered app it is usually a legitimate render gate
  // (field data: ~90% FP). The `triage` flag reports it as [P0?][LLM-TRIAGE] and keeps it OUT of the
  // p0 exit count — Phase 2 confirms the destructive-action context.
  { severity: 'P0', id: '#4b',
    title: 'Vacuous toBeAttached assertion (positive form only; Phase 2 confirms destructive-action context)',
    pattern: '(?<!not\\.)toBeAttached\\(\\)', globs: [SRC_CY], flags: ['e2e', 'triage'] },

  // #4c-4e: a one-shot read (`expect(await <locator>.textContent()/count()/…)` + a SYNC matcher) is a
  // P0 one-shot assertion, NOT a #15 — the await resolves a value, so nothing floats. The leading
  // `(?:…)*` group admits the wrapped forms (`expect((await …).trim())`, `expect(Number(await …))`,
  // `expect(!(await …))`) that field runs showed being misfiled as #15.
  { severity: 'P0', id: '#4c-4e', title: 'One-shot Playwright state/content assertion',
    pattern: 'expect\\((?:[!(\\s+-]|[A-Za-z_$][\\w$.]*\\()*await\\b.*\\.(isVisible|isDisabled|isEnabled|isChecked|isHidden|isEditable|textContent|innerText|getAttribute|inputValue|allTextContents|allInnerTexts|count)\\([^)]*\\)\\)',
    globs: [SPEC] },

  { severity: 'P0', id: '#4f', title: 'Locator always-true assertion (truthy/defined/not-null)',
    pattern: 'expect\\(.*(locator|getBy[A-Za-z]+).*(\\.toBeTruthy\\(\\)|\\.toBeDefined\\(\\)|\\.not\\.toBeNull\\(\\)|\\.not\\.toBeUndefined\\(\\)|\\.not\\.to\\.equal\\(null\\)|\\.not\\.to\\.be\\.null)',
    globs: [SRC], flags: ['e2e'] },

  { severity: 'P0', id: '#4g', title: 'Retry disabled with timeout zero',
    pattern: 'timeout:\\s*0', globs: [SRC_CY], flags: ['e2e'] },

  { severity: 'P0', id: '#4h', title: 'One-shot page.url assertion',
    pattern: 'expect\\(page\\.url\\(\\)\\)', globs: [SPEC] },

  { severity: 'P0', id: '#5a', title: 'Conditional assertion bypass',
    pattern: 'if.*(isVisible\\(|is\\(.*:visible.*\\))', globs: [SPEC_CY, CYI] },

  { severity: 'P1', id: '#5b', title: 'Forced actionability bypass',
    pattern: 'force:\\s*true', globs: [SRC_CY], flags: ['e2e'] },

  { severity: 'P0', id: '#8a', title: 'Dangling Playwright locator statement',
    pattern: '^\\s*(await\\s+)?page\\.(locator|getBy[A-Za-z]+)\\(([^()]|\\([^()]*\\))*\\)\\s*;?\\s*(//.*)?$',
    globs: [SPEC], flags: ['cont'] },

  { severity: 'P0', id: '#8b', title: 'Boolean state result discarded',
    pattern: '^\\s*await .*\\.(isVisible|isEnabled|isChecked|isDisabled|isEditable|isHidden)\\([^)]*\\)\\s*;?\\s*(//.*)?$',
    globs: [SPEC_CY, CYI] },

  { severity: 'P1', id: '#10a', title: 'Positional selector',
    pattern: '\\.(nth\\(|first\\(\\)|last\\(\\))', globs: [SPEC_CY, CYI] },

  { severity: 'P1', id: '#10b', title: 'Serial Playwright suite',
    pattern: '\\.describe\\.serial\\(', globs: [SPEC] },

  { severity: 'P1', id: '#14', title: 'Hardcoded credentials',
    pattern: '(login|fill|type).*(["\'].*password|["\'].*secret|["\']admin["\'])', globs: [SPEC_CY, CYI] },

  // #15 keeps ONLY unawaited web-first matchers. The trailing matcher whitelist ends the old
  // conflation where sync-matcher one-shot reads (`expect(Number(await getRowCount(page))).toBe(4)` —
  // note the `page)` substring) were misfiled as #15: on the ag-grid field run, 25 of 33 #15 hits
  // were really #4c-4e. Matcher-on-the-next-line splits are Tier 2's job (sg-15).
  //
  // The `\s*+` after `expect\(` is POSSESSIVE and LOAD-BEARING. Rewrite it as `\s*` and the engine
  // backtracks into the whitespace, the (?!await\b) lookahead lands on ` await`, and the check
  // INVERTS — correctly-classified lines start reporting here. JS RegExp cannot express `*+` at all,
  // which is why this is a PCRE2 string for rg and not a ported JS regex.
  // Guarded by tests/pattern-corpus/evals/files/backtracking-trap.spec.ts.
  { severity: 'P0', id: '#15', title: 'Missing await on Playwright expect',
    pattern: `^\\s*expect\\(\\s*+(?!await\\b).*(locator|getBy[A-Z][A-Za-z]*|(?<![.\\w])page\\)).*\\.(${WEB_FIRST})\\(`,
    globs: [SPEC], flags: ['e2e'] },

  // #15 variant: the await is misplaced INSIDE expect(), onto the locator. That is a no-op — a Locator
  // is not thenable — so the web-first matcher's promise still floats and the assertion never settles.
  // The base check skips `expect(await …` by design, so this catches the awaited-locator form. Bounded
  // to web-first matchers so a value-resolving read like `expect(await x.isVisible()).toBe(true)`
  // (that is #4c-4e) is not double-flagged.
  { severity: 'P0', id: '#15', title: 'Missing await on Playwright expect (awaited locator)',
    pattern: `^\\s*expect\\(\\s*await\\b.*\\)\\.(${WEB_FIRST})\\(`,
    globs: [SPEC], flags: ['e2e'] },

  { severity: 'P0', id: '#16', title: 'Missing await on Playwright action',
    pattern: '^\\s*page\\.(locator|getBy\\w+)\\(.*\\)\\.(click|fill|type|press|check|uncheck|selectOption|setInputFiles|hover|focus|blur)\\(',
    globs: [SPEC] },

  { severity: 'P1', id: '#17', title: 'Direct page action API',
    pattern: 'page\\.(click|fill|type|check|uncheck|selectOption)\\(["\'`]', globs: [SPEC] },

  { severity: 'P1', id: '#9c', title: 'Network-idle readiness check',
    pattern: '(waitForLoadState\\(\\s*[\\x27"]networkidle[\\x27"]|waitUntil:\\s*[\\x27"]networkidle[\\x27"])',
    globs: [SRC], flags: ['e2e'] },

  { severity: 'P1', id: '#18', title: 'Soft assertion usage',
    pattern: 'expect\\.soft\\(', globs: [SPEC] },

  // #3b matches EVERY uncaught:exception handler opening, single- or multi-line. The old `.*false`
  // suffix only caught the one-line `() => false` form and missed 51 multi-line
  // `(err, runnable) => { return false; }` blanket suppressors in a single OSS Cypress suite.
  // Blanket-vs-scoped is Phase 2's documented call (a handler containing expect() is exempt).
  { severity: 'P0', id: '#3b',
    title: 'Cypress uncaught exception suppression (Phase 2 confirms blanket vs scoped)',
    pattern: 'on\\(\\s*[\'"]uncaught:exception[\'"]', globs: ['*.{cy.ts,cy.js,ts,js}'] },

  { severity: 'P1', id: '#19', title: 'Module-level mutable state in test code',
    pattern: '^let\\s+', globs: [SRC_CY], flags: ['e2e'] },
];

for (const check of CHECKS) runCheck(check);
// One explicit line, so a Phase-0 skip is never a silent truncation.
out(
  `\nScope filter: ${scopeOut.size} out-of-scope file(s) skipped ` +
    '(pattern hits in files without Playwright/Cypress markers).\n',
);

out(
  `\nSummary: ${totalHits} total hit(s), ${p0Hits} P0, ${p1Hits} P1/P2 heuristic, ` +
    `${llmTriageHits} LLM-triage; ${astTotal} AST hit(s).\n`,
);

// ---------------------------------------------------------------------------- exit gate
switch (FAIL_ON) {
  case 'none':
    process.exit(0);
  case 'any':
    // `any` means anything found by ANY tier — Tier-2 AST hits gate here too.
    process.exit(totalHits + astTotal === 0 ? 0 : 1);
  case 'p0':
    process.exit(p0Hits === 0 ? 0 : 1);
  default:
    err('error: E2E_SMELL_FAIL_ON must be one of: p0, any, none\n');
    process.exit(2);
}
