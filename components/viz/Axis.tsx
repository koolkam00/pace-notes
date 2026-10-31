import { layoutTicks, widthClass, type Tick } from './labels';
import { pc } from './scale';

/**
 * The x axis under a plot (the redesign spec, section 3.6): tick labels of 12 px, at most one every few dozen pixels,
 * each turned to start or end near an edge so it never leaves the axis, and hidden below the width it fits (it stays in
 * Values). The baseline itself is drawn by the plot, so the axis is only labels and small ticks. `title` puts a word at
 * each end under the ticks ("← faster 5K", "slower 5K →").
 */
export default function Axis({ ticks, title, refWidth, centred = false, gap }: {
  ticks: Tick[]; title?: { start?: string; end?: string };
  /** The axis width on the narrowest phone, when it is narrower than its figure (a dumbbell's track column). */
  refWidth?: number;
  /** Every label centred on its tick (years under stems); one that does not fit so hides below the width it fits. */
  centred?: boolean;
  /** The clear space between two labels (layoutTicks; 6 px of the width estimate by default). */
  gap?: number;
}) {
  const laid = layoutTicks(ticks, 12, refWidth, centred, gap);
  return (
    <div className="viz-axis">
      <svg className="viz-axis-svg" width="100%" height="24" aria-hidden="true">
        {laid.map((t) => {
          const mark = t.markWidth === undefined ? t.minWidth : t.markWidth;
          if (t.minWidth === null && mark === null) return null;
          const tick = <rect className="tick-mark" x={pc(t.x)} y={0} width={1} height={4} transform="translate(-0.5 0)" />;
          const text = <text className={`tick${t.turned ? ` turn-${t.turned}` : ''}`} x={pc(t.x)} y={18} textAnchor={t.anchor}>{t.label}</text>;
          // A mark that keeps a width of its own (a group's) hides apart from its label.
          if (mark !== t.minWidth) {
            return (
              <g key={`${t.label}-${t.x}`}>
                {mark === null ? null : <g className={widthClass(mark) || undefined}>{tick}</g>}
                {t.minWidth === null ? null : <g className={widthClass(t.minWidth) || undefined}>{text}</g>}
              </g>
            );
          }
          return <g key={`${t.label}-${t.x}`} className={widthClass(t.minWidth) || undefined}>{tick}{text}</g>;
        })}
      </svg>
      {title ? <div className="viz-axis-title" aria-hidden="true"><span>{title.start}</span><span>{title.end}</span></div> : null}
    </div>
  );
}
