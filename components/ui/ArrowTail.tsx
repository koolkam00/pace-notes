import Arrow from './Arrow';

/**
 * The words of a link that ends on an arrow, laid out as text: the link wraps where its words do, and its last word and
 * the arrow never part (`.arrow-tail`), so a link that takes two lines keeps the arrow beside its last word instead of
 * alone at the column's edge (an inline-flex link pushed it there; half review, round 3). Pair it with a link that is
 * `display: inline` and padded for its 44 px reach (`.arrow-line a` in button.css).
 */
export default function ArrowTail({ text }: { text: string }) {
  const words = text.trimEnd();
  const at = words.lastIndexOf(' ');
  return <>{at < 0 ? null : words.slice(0, at + 1)}<span className="arrow-tail">{words.slice(at + 1)}<Arrow /></span></>;
}
