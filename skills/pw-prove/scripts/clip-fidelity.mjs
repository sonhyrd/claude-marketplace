#!/usr/bin/env node
// clip-fidelity.mjs — the Step-6 authoring-time check that the generated spec actually carries the
// Clip Fidelity contract (`code-rules.md` §Clip Fidelity, `docs/adr/0007` amended by `docs/adr/0015`).
//
//   node clip-fidelity.mjs spec <spec-file...> --config <playwright.config.ts> --verdict <declared>
//     --config <path>    the project's committed Playwright config, read as TEXT (never imported —
//                        importing a stranger's config executes it)
//     --verdict <v>      the Step-4 Assumptions block's Effective viewport line, verbatim:
//                        `pinned:1600x900` or `deliberate:390x844` (the size is informational; the
//                        branch is the claim). Required — see the disagreement rule below.
//
// This exists because both halves of the contract were invisible by construction. A real PR-mode run
// passed `PW_PROVE_CLIP=1` at Step 7 while the generated spec contained no reader for the variable:
// the flag was inert, the dwell never happened, and every gate the pipeline owns stayed green over a
// recording that showed nothing. The same hole covers the viewport pin — a `pinned:` verdict in the
// Assumptions block is PROSE, and nothing compared it against the spec. Prose instructions are the
// category of thing that already failed here; code cannot be forgotten.
//
// Three assertions, in the order their failures matter:
//
//   1. THE DERIVED VERDICT MUST MATCH THE DECLARED ONE. The effective viewport is re-derived from
//      the config text by the resolution rule (below) and compared with `--verdict`. A disagreement
//      is a FAILURE, not a warning: that is what turns the Assumptions block from unverified prose
//      into a checkable claim. Silently trusting the declared value would leave the same hole one
//      level up.
//   2. A `pinned:` VERDICT MUST HAVE PRODUCED A COMMITTED `test.use({ viewport })`. Pinning only in
//      the throwaway proof config means healing, the hermetic audit and the mutation check all ran
//      against a rendering CI never produces — a viewport-axis silent-always-pass.
//   3. EVERY `test()` MUST CARRY A `PW_PROVE_CLIP`-GATED WAIT WITH ITS `// JUSTIFIED:` LINE. The
//      marker is not decoration: it is what suppresses smell #9 across all three scanner tiers, so a
//      dwell without it is an unexplained fixed wait and a dwell nobody justified.
//
// THE RESOLUTION RULE (re-derived here, not read from the plan) — `code-rules.md` §Viewport pin:
//
//   explicit `viewport:` key in a `use` block   deliberate  respect it, never pin over it
//   a mobile / non-desktop device descriptor    deliberate  a desktop pin over a phone is nonsense
//   a DESKTOP device-descriptor spread only     pinned      scaffold default — pin over it
//   nothing at all (Playwright's 1280x720)      pinned      scaffold default — pin over it
//
// The rule is textual by design, so reading the config as text is not a shortcut — it is the rule.
//
// AMBIGUITY REFUSES; IT DOES NOT GUESS. A function-export config (`export default defineConfig(({
// ... }) => ...)`, `export default () => ...`) computes its `use` at load time, and multiple projects
// whose `use` blocks resolve to DIFFERENT verdicts have no single effective viewport to derive. Both
// exit 5 — neither a pass nor a failure. A guess here would either pin over a deliberate viewport or
// skip a pin the clip needs, and both failures are silent.
//
// Exit codes are the contract Step 6 branches on; they are stable:
//   0  contract satisfied
//   1  usage error
//   2  payoff dwell missing (or present without its `// JUSTIFIED:` line)
//   3  viewport pin missing on a `pinned:` verdict
//   4  derived verdict disagrees with the declared one
//   5  config ambiguity — refused rather than guessed
//
// Zero dependencies, Node stdlib only, per the shipped-scripts convention: nothing is installed into
// a user's project and the config is never executed.
import fs from 'node:fs';
import { pwproveRun } from './pwprove-run.mjs';

// Run ledger — registered before validation, so even a usage-error exit leaves a record.
pwproveRun(import.meta.url, 'audit');

const out = (s) => process.stdout.write(s);
const err = (s) => process.stderr.write(s);

const EXIT = { OK: 0, USAGE: 1, DWELL: 2, PIN: 3, DISAGREE: 4, AMBIGUOUS: 5 };

const USAGE =
  'clip-fidelity.mjs: usage: node clip-fidelity.mjs spec <spec-file...> --config <playwright.config> ' +
  '--verdict <pinned:WxH|deliberate:WxH>\n';

const usage = (why) => {
  err(`clip-fidelity: ${why}\n${USAGE}`);
  process.exit(EXIT.USAGE);
};

// ============================================================ source masking
// Brace and paren balance is how test() bodies and `use` blocks are found, and a brace inside a
// string or a comment is not a brace. `mask()` returns a same-length copy with every string,
// template, regex and comment INTERIOR replaced by spaces, so offsets computed on the mask index
// straight back into the original text (which is where `// JUSTIFIED:` is still readable).
function mask(src) {
  const o = src.split('');
  const blank = (i) => {
    if (src[i] !== '\n') o[i] = ' ';
  };
  // A `/` opens a regex only where a value may start; after an identifier, `)` or `]` it is division.
  const regexAllowed = (i) => {
    for (let j = i - 1; j >= 0; j--) {
      const c = src[j];
      if (c === ' ' || c === '\t' || c === '\n' || c === '\r') continue;
      return !/[\w$)\]]/.test(c);
    }
    return true;
  };
  let i = 0;
  while (i < src.length) {
    const c = src[i];
    const d = src[i + 1];
    if (c === '/' && d === '/') {
      while (i < src.length && src[i] !== '\n') blank(i++);
      continue;
    }
    if (c === '/' && d === '*') {
      blank(i++);
      blank(i++);
      while (i < src.length && !(src[i] === '*' && src[i + 1] === '/')) blank(i++);
      if (i < src.length) {
        blank(i++);
        blank(i++);
      }
      continue;
    }
    if (c === "'" || c === '"') {
      i++; // keep the delimiter: it makes a masked string still look like a string literal
      while (i < src.length && src[i] !== c) {
        if (src[i] === '\\') blank(i++);
        if (i < src.length) blank(i++);
      }
      i++;
      continue;
    }
    if (c === '`') {
      // Blank the WHOLE template, `${…}` interiors included. Uniform blanking keeps balance intact
      // without having to understand the expressions inside.
      i++;
      let depth = 0;
      while (i < src.length) {
        if (src[i] === '\\') {
          blank(i++);
          blank(i++);
          continue;
        }
        if (src[i] === '$' && src[i + 1] === '{') depth++;
        else if (src[i] === '}' && depth > 0) depth--;
        else if (src[i] === '`' && depth === 0) break;
        blank(i++);
      }
      i++;
      continue;
    }
    if (c === '/' && regexAllowed(i)) {
      const start = i;
      i++;
      let closed = false;
      let inClass = false;
      while (i < src.length && src[i] !== '\n') {
        if (src[i] === '\\') {
          i += 2;
          continue;
        }
        if (src[i] === '[') inClass = true;
        else if (src[i] === ']') inClass = false;
        else if (src[i] === '/' && !inClass) {
          closed = true;
          break;
        }
        i++;
      }
      if (closed) {
        for (let j = start + 1; j < i; j++) blank(j);
        i++;
      } else i = start + 1; // not a regex after all (a bare division) — carry on
      continue;
    }
    i++;
  }
  return o.join('');
}

/** The span of a balanced `open`/`close` pair, given the index of the opening character. */
function balanced(masked, start, open, close) {
  let depth = 0;
  for (let i = start; i < masked.length; i++) {
    if (masked[i] === open) depth++;
    else if (masked[i] === close) {
      depth--;
      if (depth === 0) return [start, i + 1];
    }
  }
  return null;
}

const lineOf = (src, index) => src.slice(0, index).split('\n').length;

// ============================================================ the resolution rule
const VIEWPORT_KEY = /(?:^|[{,;\s])viewport\s*:/;
const DEVICE_SPREAD = /\.\.\.\s*devices\s*\[\s*['"`]([^'"`\]]+)['"`]\s*\]/g;
const IS_MOBILE = /(?:^|[{,;\s])isMobile\s*:\s*true/;

/** Every `use:` object literal inside `text`, as [start, end) spans over the mask. */
function useBlocks(masked, from = 0, to = masked.length) {
  const spans = [];
  const re = /(?:^|[{,;\s])use\s*:\s*\{/g;
  re.lastIndex = from;
  let m;
  while ((m = re.exec(masked)) !== null) {
    const open = m.index + m[0].length - 1;
    if (open >= to) break;
    const span = balanced(masked, open, '{', '}');
    if (span) {
      spans.push(span);
      re.lastIndex = span[1];
    }
  }
  return spans;
}

/**
 * The verdict a single scope's `use` blocks produce, or null when the scope says nothing about the
 * viewport (a project with no `use` inherits the top-level one).
 */
function deriveScope(masked, original, spans) {
  let sawDesktopDescriptor = null;
  for (const [s, e] of spans) {
    const maskedText = masked.slice(s, e);
    const realText = original.slice(s, e);
    if (VIEWPORT_KEY.test(maskedText)) {
      const dims = realText.match(/width\s*:\s*(\d+)[\s\S]{0,40}?height\s*:\s*(\d+)/);
      return {
        verdict: 'deliberate',
        why: `an explicit viewport: key${dims ? ` (${dims[1]}x${dims[2]})` : ''}`,
      };
    }
    if (IS_MOBILE.test(maskedText)) return { verdict: 'deliberate', why: 'isMobile: true' };
    DEVICE_SPREAD.lastIndex = 0;
    let m;
    while ((m = DEVICE_SPREAD.exec(realText)) !== null) {
      const name = m[1];
      // Only the `Desktop *` family is scaffold boilerplate. Every other descriptor — phones,
      // tablets, anything non-desktop — is a project decision a desktop pin would destroy.
      if (/^desktop\b/i.test(name)) sawDesktopDescriptor = name;
      else return { verdict: 'deliberate', why: `a non-desktop device descriptor (${name})` };
    }
  }
  if (sawDesktopDescriptor)
    return {
      verdict: 'pinned',
      why: `only a desktop device-descriptor spread (${sawDesktopDescriptor}) — scaffold default`,
    };
  return null;
}

/** The `projects: [ … ]` array span, or null. */
function projectsSpan(masked) {
  const m = /(?:^|[{,;\s])projects\s*:\s*\[/.exec(masked);
  if (!m) return null;
  return balanced(masked, m.index + m[0].length - 1, '[', ']');
}

/** The object literals directly inside a `projects: [ … ]` array. */
function projectObjects(masked, [s, e]) {
  const objs = [];
  let i = s + 1;
  while (i < e - 1) {
    if (masked[i] === '{') {
      const span = balanced(masked, i, '{', '}');
      if (!span) return null;
      objs.push(span);
      i = span[1];
    } else i++;
  }
  return objs;
}

/**
 * Re-derive the effective viewport verdict from the config TEXT, or refuse.
 * Returns {verdict, why} | {ambiguous: '<reason>'}.
 */
function deriveVerdict(original) {
  const masked = mask(original);

  // A config whose default export is computed cannot be resolved by a text rule: its `use` may be
  // assembled from arguments this script never sees.
  const fnExport =
    /export\s+default\s+(?:async\s+)?(?:function\b|\()/.test(masked) ||
    /export\s+default\s+\w+\s*=>/.test(masked) ||
    /module\.exports\s*=\s*(?:async\s+)?(?:function\b|\()/.test(masked) ||
    /defineConfig\s*\(\s*(?:async\s*)?(?:function\b|\()/.test(masked);
  if (fnExport)
    return {
      ambiguous:
        'the config exports a FUNCTION — its `use` is computed at load time, so no text rule can resolve it',
    };

  const pSpan = projectsSpan(masked);
  const topSpans = useBlocks(masked).filter(([s]) => !pSpan || s < pSpan[0] || s >= pSpan[1]);
  const top = deriveScope(masked, original, topSpans);

  if (!pSpan) return top ?? { verdict: 'pinned', why: "nothing at all — Playwright's 1280x720 default" };

  const objs = projectObjects(masked, pSpan);
  if (objs === null || objs.length === 0)
    return { ambiguous: 'a `projects:` array this text rule cannot split into project objects' };

  const perProject = objs.map(([s, e]) => {
    const scoped = useBlocks(masked, s, e).filter(([us]) => us > s && us < e);
    const own = deriveScope(masked, original, scoped);
    const name = (original.slice(s, e).match(/name\s*:\s*['"`]([^'"`]+)/) ?? [, '(unnamed)'])[1];
    return {
      name,
      resolved: own ?? top ?? { verdict: 'pinned', why: "nothing at all — Playwright's 1280x720 default" },
    };
  });

  const distinct = [...new Set(perProject.map((p) => p.resolved.verdict))];
  if (distinct.length > 1)
    return {
      ambiguous:
        'the projects disagree — ' +
        perProject.map((p) => `${p.name}: ${p.resolved.verdict}`).join(', ') +
        '. There is no single effective viewport to derive',
    };
  return perProject[0].resolved;
}

// ============================================================ the spec assertions
const CLIP_GATE = /process\.env\.PW_PROVE_CLIP/;
const WAIT = /waitForTimeout\s*\(/;

/** Every `test(…)` / `test.only(…)` body in the spec, with its name and its line. */
function testBlocks(masked, original) {
  const blocks = [];
  const re = /(?:^|[^\w.$])(test(?:\.only)?)\s*\(/g;
  let m;
  while ((m = re.exec(masked)) !== null) {
    const openParen = m.index + m[0].length - 1;
    const call = balanced(masked, openParen, '(', ')');
    if (!call) continue;
    re.lastIndex = call[1];
    const arrow = masked.indexOf('=>', openParen);
    if (arrow < 0 || arrow > call[1]) continue; // no callback — not a test we can read
    const brace = masked.indexOf('{', arrow);
    if (brace < 0 || brace > call[1]) continue;
    const body = balanced(masked, brace, '{', '}');
    if (!body) continue;
    const name = (original.slice(openParen, call[1]).match(/['"`]([^'"`]*)['"`]/) ?? [, '(unnamed)'])[1];
    blocks.push({ name, line: lineOf(original, m.index + 1), body });
  }
  return blocks;
}

/**
 * A dwell is compliant when it is gated on PW_PROVE_CLIP, it is a WAIT, and the contiguous comment
 * block immediately above it carries `// JUSTIFIED:`. The marker is checked on the ORIGINAL text —
 * the mask blanked it — and a multi-line justification counts, since the sanctioned snippet spans
 * three comment lines.
 */
function findDwells(original, masked, [start, end]) {
  const lines = original.split('\n');
  const bodyStartLine = lineOf(original, start);
  const bodyEndLine = lineOf(original, end - 1);
  const found = [];
  for (let n = bodyStartLine; n <= bodyEndLine; n++) {
    const line = lines[n - 1] ?? '';
    if (!CLIP_GATE.test(line) || !WAIT.test(line)) continue;
    let justified = false;
    for (let k = n - 1; k >= 1; k--) {
      const above = (lines[k - 1] ?? '').trim();
      if (above === '') continue; // a blank line does not break the justification
      if (!above.startsWith('//') && !above.startsWith('*') && !above.startsWith('/*')) break;
      if (above.includes('JUSTIFIED:')) {
        justified = true;
        break;
      }
    }
    found.push({ line: n, justified, text: line.trim() });
  }
  return found;
}

/** Every `test.use({ … viewport … })` in the spec — the committed pin. */
function viewportPins(masked, original) {
  const pins = [];
  const re = /(?:^|[^\w.$])test\.use\s*\(/g;
  let m;
  while ((m = re.exec(masked)) !== null) {
    const openParen = m.index + m[0].length - 1;
    const call = balanced(masked, openParen, '(', ')');
    if (!call) continue;
    re.lastIndex = call[1];
    if (VIEWPORT_KEY.test(masked.slice(call[0], call[1])))
      pins.push({ line: lineOf(original, m.index + 1), gated: CLIP_GATE.test(original.slice(call[0], call[1])) });
  }
  return pins;
}

// ============================================================ cli
const argv = process.argv.slice(2);
const SUB = argv[0];
// The subcommand surface stays open: `frames` (issue #30) lands beside `spec` on this same script.
if (SUB !== 'spec') usage(SUB === undefined ? 'no subcommand' : `unknown subcommand '${SUB}'`);

const specs = [];
let CONFIG = null;
let DECLARED = null;
for (let i = 1; i < argv.length; i++) {
  const a = argv[i];
  if (a === '--config') CONFIG = argv[++i];
  else if (a === '--verdict') DECLARED = argv[++i];
  else if (a.startsWith('-')) usage(`unknown flag '${a}'`);
  else specs.push(a);
}
if (specs.length === 0) usage('no spec file given');
if (!CONFIG) usage('--config <playwright.config> is required — the verdict is re-derived, not trusted');
if (!DECLARED)
  usage("--verdict is required — the Step-4 Assumptions block's Effective viewport line, verbatim");

const declaredBranch = /^\s*(pinned|deliberate)\b/.exec(DECLARED)?.[1];
if (!declaredBranch)
  usage(`--verdict '${DECLARED}' is neither pinned:<WxH> nor deliberate:<WxH>`);

let configText;
try {
  configText = fs.readFileSync(CONFIG, 'utf8');
} catch {
  usage(`cannot read --config '${CONFIG}'`);
}

out(`--- clip-fidelity: spec --- ${specs.join(', ')}\n`);

// ---- 1. the derived verdict, and whether the declared one agrees ---------------------------------
const derived = deriveVerdict(configText);
if (derived.ambiguous) {
  out(`effective viewport: AMBIGUOUS — ${derived.ambiguous}\n`);
  err(
    `clip-fidelity: STOP — cannot derive the effective viewport from ${CONFIG}:\n` +
      `       ${derived.ambiguous}.\n` +
      '       This refuses rather than guessing: a wrong guess either pins over a deliberate\n' +
      '       viewport or skips a pin the clip needs, and both are silent. Resolve it by hand —\n' +
      '       read the config, decide the effective viewport, and state which branch and why in\n' +
      '       the Assumptions block. (exit 5)\n',
  );
  process.exit(EXIT.AMBIGUOUS);
}
out(`effective viewport: derived ${derived.verdict} — config carries ${derived.why}\n`);
out(`                    declared ${DECLARED.trim()} — ${derived.verdict === declaredBranch ? 'agrees' : 'DISAGREES'}\n`);
if (derived.verdict !== declaredBranch) {
  err(
    `clip-fidelity: STOP — the Assumptions block claims '${DECLARED.trim()}' but ${CONFIG} derives\n` +
      `       '${derived.verdict}' (${derived.why}).\n` +
      '       A declared verdict nothing checks is the prose this check exists to replace. One of\n' +
      '       the two is wrong: re-read the resolution rule in code-rules.md §Viewport pin, fix the\n' +
      '       Assumptions line and the spec together, then re-run. (exit 4)\n',
  );
  process.exit(EXIT.DISAGREE);
}

// ---- 2 & 3. the spec side ------------------------------------------------------------------------
let pinFailure = null;
let dwellFailure = null;

for (const spec of specs) {
  let src;
  try {
    src = fs.readFileSync(spec, 'utf8');
  } catch {
    usage(`cannot read spec '${spec}'`);
  }
  const masked = mask(src);

  const pins = viewportPins(masked, src);
  if (derived.verdict === 'pinned') {
    if (pins.length === 0) {
      out(`viewport pin:       MISSING in ${spec} — a 'pinned' verdict produced no test.use({ viewport })\n`);
      pinFailure ??= spec;
    } else {
      out(`viewport pin:       ${spec}:${pins[0].line} — test.use({ viewport }) is committed\n`);
      // The filming law: a gated pin renders something CI never renders.
      for (const p of pins.filter((x) => x.gated))
        out(`                    WARNING ${spec}:${p.line} — the pin is PW_PROVE_CLIP-gated; the filming law forbids it\n`);
    }
  } else {
    out(`viewport pin:       not required — a 'deliberate' verdict is respected, never pinned over\n`);
    for (const p of pins)
      out(
        `                    WARNING ${spec}:${p.line} — a pin over a deliberate project viewport ` +
          '(code-rules.md: respect it, never pin over it)\n',
      );
  }

  const tests = testBlocks(masked, src);
  if (tests.length === 0) {
    out(`payoff dwell:       no test() blocks found in ${spec}\n`);
    continue;
  }
  const bad = [];
  for (const t of tests) {
    const dwells = findDwells(src, masked, t.body);
    if (dwells.length === 0) bad.push({ t, why: 'no PW_PROVE_CLIP-gated wait' });
    else if (!dwells.some((d) => d.justified))
      bad.push({ t, why: `the dwell at ${spec}:${dwells[0].line} has no // JUSTIFIED: line above it` });
  }
  out(
    `payoff dwell:       ${tests.length - bad.length}/${tests.length} test() block(s) in ${spec} carry a ` +
      'JUSTIFIED, PW_PROVE_CLIP-gated wait\n',
  );
  for (const b of bad) out(`                    MISSING ${spec}:${b.t.line} test('${b.t.name}') — ${b.why}\n`);
  if (bad.length) dwellFailure ??= { spec, bad };
}

// A missing pin outranks a missing dwell: without the pin the clip was filmed at a rendering the
// dwell would only have held longer.
if (pinFailure) {
  err(
    `clip-fidelity: STOP — ${pinFailure} carries no committed viewport pin, but the effective\n` +
      `       viewport derives as 'pinned' (${derived.why}).\n` +
      '       Add it to the SPEC (never to the project config, never only to the proof config):\n' +
      '         test.use({ viewport: { width: 1600, height: 900 } });\n' +
      '       A viewport that exists only while filming means healing, the hermetic audit and the\n' +
      '       mutation check all ran against a rendering CI never produces. (exit 3)\n',
  );
  process.exit(EXIT.PIN);
}
if (dwellFailure) {
  err(
    `clip-fidelity: STOP — ${dwellFailure.bad.length} test() block(s) in ${dwellFailure.spec} have no\n` +
      '       justified payoff dwell, so PW_PROVE_CLIP=1 at Step 7 would be INERT and the clip would\n' +
      '       show nothing. Add one per test, framed, at any beat except between an action and the\n' +
      '       assertion that covers it:\n' +
      "         await el.evaluate((n) => n.scrollIntoView({ block: 'center', inline: 'center' }));\n" +
      '         // JUSTIFIED: proof-clip payoff hold. Runs only under PW_PROVE_CLIP; it sits after the\n' +
      '         // assertion covering the beat above, so it adds time and nothing else. CI never sets it.\n' +
      '         if (process.env.PW_PROVE_CLIP) await page.waitForTimeout(2500);\n' +
      '       (exit 2)\n',
  );
  process.exit(EXIT.DWELL);
}

out('verdict: clip fidelity contract satisfied — Step 7 may film.\n');
process.exit(EXIT.OK);
