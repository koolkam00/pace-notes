"""Runner lookup v2: name normalisation and search words. Pure functions, no data access.

The browser must compute exactly the same strings (scripts/lib/lookup.cjs is the Node reference the client ports), so
every step here is stated in words and the two sides are compared on every published name (analysis/test_runner_lookup.py
with scripts/lib/lookup-parity.json, and scripts/verify-lookup.cjs on a real build).

Normalisation (`normalize_name`), in this order:
1. Unicode NFKD.
2. Remove every code point whose general category starts with M (marks).
3. Lower case (the language-neutral Unicode mapping).
4. The fold table (lead decision D24.5 of the adoption plan, 2026-11-14): the nine Latin letters NFKD leaves whole.
5. Every run of code points that are neither letters nor numbers becomes one space; leading and trailing spaces go.

Search words (`search_words`): when the recorded name ends with a bracketed code of two or three capital ASCII letters
("Smith, José (GBR)"), that part is dropped first; the rest is normalised and split on spaces, and the distinct words
are kept in code point order. A name whose words would then be empty keeps the code as its word ("(USA)" gives "usa").
A name with no word at all is unnamed and is never listed. Nothing here infers a person, a sex or a country from a name.
"""
from __future__ import annotations

import re
import unicodedata

# Lead decision D24.5: Latin letters that NFKD does not decompose. Applied after lower-casing, so the capitals follow.
FOLD = {'ł': 'l', 'ø': 'o', 'đ': 'd', 'ð': 'd', 'ß': 'ss', 'æ': 'ae', 'œ': 'oe', 'þ': 'th', 'ı': 'i'}
_FOLD_TABLE = str.maketrans(FOLD)
NORMALIZATION = ('NFKD; remove Unicode marks; lower case; fold ł→l ø→o đ→d ð→d ß→ss æ→ae œ→oe þ→th ı→i; '
                 'keep letters and numbers; collapse every other run to one space')
SEARCH_WORDS = ('drop a trailing bracketed code of two or three capital ASCII letters; normalise; split on spaces; keep the '
                'distinct words in code point order; a name whose words would be empty keeps the code as its word')

# The pattern lib/runner-search.ts displayName uses (/\s*\(([A-Z]{2,3})\)$/). \Z, not $: in Python `$` also matches
# before a trailing newline, in JavaScript (without the m flag) it does not.
_CODE = re.compile(r'\s*\(([A-Z]{2,3})\)\Z')
# Fast path: for a name of these ASCII characters alone the five steps reduce to two regular expressions.
_ASCII = re.compile(r"[A-Za-z0-9 ,.\-'()]*\Z")
_NOT_WORD = re.compile(r'[^a-z0-9]+')


def normalize_name(value):
    """The normalised form of a recorded or typed name ('' for None)."""
    if not value:
        return ''
    if _ASCII.match(value):
        return _NOT_WORD.sub(' ', value.lower()).strip()
    text = ''.join(c for c in unicodedata.normalize('NFKD', value) if not unicodedata.category(c).startswith('M'))
    text = text.lower().translate(_FOLD_TABLE)
    return ' '.join(''.join(c if c.isalnum() else ' ' for c in text).split())


def normalize_name_reference(value):
    """The five steps written out with no fast path; the tests compare it with normalize_name."""
    text = unicodedata.normalize('NFKD', value or '')
    text = ''.join(c for c in text if not unicodedata.category(c).startswith('M'))
    text = text.lower()
    text = ''.join(FOLD.get(c, c) for c in text)
    return ' '.join(''.join(c if c.isalnum() else ' ' for c in text).split())


def split_code(name):
    """(the name without a trailing bracketed code, the code or None)."""
    match = _CODE.search(name or '')
    return ((name or '')[:match.start()], match.group(1)) if match else (name or '', None)


def search_words(name):
    """The distinct search words of a recorded name, in code point order ([] for an unnamed result)."""
    rest, code = split_code(name)
    words = normalize_name(rest).split()
    if not words and code:
        words = normalize_name(name).split()
    return sorted(set(words))


def search_key(name):
    """The search words joined by one space: the identity of a search name inside a profile."""
    return ' '.join(search_words(name))


def separator(before, after):
    """The shortest beginning of `after` that still sorts after `before` (code point order; requires before < after)."""
    if not before < after:
        raise ValueError(f'separator needs {before!r} < {after!r}')
    at = 0
    while at < len(before) and before[at] == after[at]:
        at += 1
    return after[:at + 1]
