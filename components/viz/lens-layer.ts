/**
 * Shows the figure's layer that `value` names: data-k on the figure, and is-off on every other [data-layer] (CSS fades
 * them out). The lens control's choice (Lens.client) and a scrolly's step where the steps own the lens and no control is
 * drawn (round numbers, ScrollyLens) both go through it. A plain module, so a page without the control loads no
 * segmented-control code for it.
 */
export function applyLens(figure: HTMLElement, value: string) {
  figure.dataset.k = value;
  figure.querySelectorAll<HTMLElement | SVGElement>('[data-layer]').forEach((el) => el.classList.toggle('is-off', el.dataset.layer !== value));
}
