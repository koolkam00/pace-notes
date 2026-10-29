'use strict';
// The words published copy may not use, shared by scripts/verify-charts.cjs (the Top 100 charts and their cards) and
// scripts/verify-half.cjs (every half surface, nugget, card and file; docs/HALF_MARATHON.md, spec 3.6). BANNED is the
// union of the site's word rules (verify-nuggets, verify-seo, verify-tools, verify-weather): no causal verbs, no promise
// or odds, no "fastest", counts are finishes, the owner's banned words, no halfway, DNF, goal or "chased" claims.

const BANNED = [
  [/arithmetic/i, 'the word "arithmetic"'], [/\bthe\s+wall\b/i, '"the wall"'], [/\byour\s+(?:[\p{L}\p{N}’'-]+\s+){0,2}chances?\b/iu, '"your chance"'],
  [/\byour odds\b|\byou will\b|\bpredict/i, 'odds, a promise or a prediction'], [/\bfastest\b/i, '"fastest"'],
  [/\b\d[\d,.]*\s+(?:million\s+)?runners\b/i, 'a count of runners (counts are finishes)'],
  [/\b(?:causes?|caused|costs?|leads? to|led to|because|came from|due to|results? in|makes?|affects?|improves?|produces?|helps?)\b/i, 'a causal verb'],
  [/\bhalfway\b|\bhalf-way\b|\bhalf marathon split\b/i, 'a halfway claim (the data have 20K and 25K, not 21.1K)'],
  [/\bDNFs?\b|\bdropp?ed out\b|\bdid not finish\b|\bquit\b/i, 'a non-finisher claim'],
  [/\bchas(?:e|ed|ing)\b|\baim(?:ed|ing)? for\b|\btarget(?:ed|ing)?\b|\bgoals?\b/i, 'a goal claim (goals are not recorded)'],
  [/\bhumid/i, 'humidity (withheld)'], [/\btoughest\b|\bhardest\b|\beasiest\b|\bharder\b|\beasier\b/i, 'a course-difficulty ranking'],
];

// Half surfaces add: records are linked by name (never "the same runners"), the marathon is not converted from the
// half, and the snapshot's status words stay on /methodology (the chip "Includes unverified half results" aside).
const HALF_BANNED = [
  [/\bsame runners?\b/i, '"same runners" (records are linked by name, never verified people)'],
  [/\bconver(?:sion|sions|t|ts|ted|ting)\b/i, 'a conversion claim'],
  [/\btune-?ups?\b/i, '"tune-up"'],
];
const STATUS_WORDS = [[/\bstamped\b/i, '"stamped"'], [/\binternal[- ]only\b/i, '"internal-only"'], [/\bheld for review\b/i, '"held for review"']];
const VERIFICATION_WORDS = [[/\b(?:un)?verified\b/i, '"verified" or "unverified" (only the scope chip says it)']];

// The exact strings a half surface may print although a word rule would catch them.
const ALLOWED = ['Not a prediction.', 'Finish-time predictor'];

// Release tags and export stamps never reach copy or a published family file.
const RELEASE_LABEL = /private-export|20260912|htw-db-|20261016|20261021|half-snapshot-|runner-links-/;

/** The rules a text breaks, as [description] (allow-listed strings removed first). */
function wordProblems(text, rules = BANNED) {
  let t = String(text);
  for (const a of ALLOWED) t = t.split(a).join(' ');
  return rules.filter(([re]) => re.test(t)).map(([, what]) => what);
}

module.exports = { BANNED, HALF_BANNED, STATUS_WORDS, VERIFICATION_WORDS, ALLOWED, RELEASE_LABEL, wordProblems };
