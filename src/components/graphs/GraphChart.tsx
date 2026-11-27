/**
 * One chart for a graph query.
 * The Graphs page and any other page use this. It does not read the URL
 * and it does not keep its own query. Colors come from the shared palette,
 * by series rank, so two charts on one page use the same color for rank 1.
 */

import { useState, type ReactNode } from "react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { OTHER_KEY, type GraphPoint } from "@/data/graph/graph";
import type { Stream } from "@/data/types";
import { MEASURE_LABELS, type ChartType, type GraphQuery, type Measure } from "@/data/graph/graphQuery";
import { ErrorBoundary } from "@/components/common/ErrorBoundary";
import {
  ANIMATION_POINT_LIMIT,
  DOT_POINT_LIMIT,
  chartSummary,
  formatAxisValue,
  formatTooltipValue,
  isCountMeasure,
  plotValue,
} from "./chartFormat";
import { OTHER_COLOR, seriesColor } from "./palette";
import { useGraph } from "./useGraph";
import styles from "./GraphChart.module.css";

const FALLBACK = "This chart could not be drawn.";
const EMPTY = "No streams in this range";

export type GraphChartProps = {
  query: GraphQuery;
  /** Pixel height of the chart. Defaults to 360. */
  height?: number;
  /** Hides the legend, axis titles, and the summary, and leaves fewer ticks. */
  compact?: boolean;
  /** Overrides compact for the legend. */
  showLegend?: boolean;
  /** Overrides compact for the summary sentence. */
  showSummary?: boolean;
  title?: string;
  className?: string;
  /** Replaces the loaded dataset. Tests and sliced views pass this. */
  streams?: readonly Stream[];
  onPointClick?: (point: GraphPoint) => void;
};

/**
 * Draws the query.
 * Input is the query and the optional display props. The dataset and the
 * listen settings come from the providers around the page. A bad query is
 * sanitized before it is drawn. A thrown chart stays inside this box.
 */
export function GraphChart(props: GraphChartProps) {
  return (
    <ErrorBoundary fallback={<p className={styles.fallback}>{FALLBACK}</p>}>
      <GraphChartBody {...props} />
    </ErrorBoundary>
  );
}

function GraphChartBody({
  query,
  height = 360,
  compact = false,
  showLegend,
  showSummary,
  title,
  className,
  streams,
  onPointClick,
}: GraphChartProps) {
  const model = useGraph(query, streams);
  const legend = showLegend ?? !compact;
  const summary = showSummary ?? !compact;
  const [hidden, setHidden] = useState<ReadonlySet<string>>(new Set());
  const seriesToken = model.seriesKeys.join("\u0000");
  const [trackedSeries, setTrackedSeries] = useState(seriesToken);
  if (trackedSeries !== seriesToken) {
    setTrackedSeries(seriesToken);
    setHidden(new Set());
  }

  const rootClass = className ? `${styles.root} ${className}` : styles.root;
  const summaryText =
    model.points.length > 0 && summary ? chartSummary(model.query, model) : null;

  return (
    <section className={rootClass} aria-label={title ?? "Chart"}>
      {title ? <h2 className={styles.title}>{title}</h2> : null}
      {model.notice ? <p className={styles.notice}>{model.notice}</p> : null}
      {model.status === "loading" ? <p className={styles.srOnly}>Updating chart</p> : null}
      {model.points.length === 0 ? (
        <p className={styles.empty}>{model.status === "loading" ? "Updating chart" : EMPTY}</p>
      ) : (
        <div
          className={styles.frame}
          data-stale={model.status === "loading" ? "true" : "false"}
          style={{ height }}
          aria-hidden={summaryText !== null ? true : undefined}
        >
          <ResponsiveContainer width="100%" height={height}>
            <ChartFrame
              chart={model.query.chart}
              compact={compact}
              data={chartRows(model.points, model.seriesKeys, model.query.measure)}
              onClick={
                onPointClick
                  ? (state) => {
                      const x = state.activeLabel;
                      if (typeof x !== "string") return;
                      const point = model.points.find((item) => item.x === x);
                      if (point) onPointClick(point);
                    }
                  : undefined
              }
            >
              <CartesianGrid stroke="var(--color-border)" vertical={false} />
              <XAxis
                dataKey="x"
                interval="preserveStartEnd"
                minTickGap={compact ? 48 : 16}
                tickFormatter={(value) => model.categoryLabels[String(value)] ?? String(value)}
                tick={{ fill: "var(--color-text-muted)", fontSize: 12 }}
                stroke="var(--color-border)"
              />
              <YAxis
                width={compact ? 36 : 48}
                allowDecimals={!isCountMeasure(model.query.measure)}
                tickFormatter={(value) => formatAxisValue(model.query.measure, Number(value))}
                tick={{ fill: "var(--color-text-muted)", fontSize: 12 }}
                stroke="var(--color-border)"
                label={
                  compact
                    ? undefined
                    : {
                        value: MEASURE_LABELS[model.query.measure],
                        angle: -90,
                        position: "insideLeft",
                        style: { fill: "var(--color-text-muted)", fontSize: 12 },
                      }
                }
              />
              <Tooltip
                content={(tooltip) => (
                  <ChartTooltip
                    active={tooltip.active}
                    label={tooltip.label}
                    payload={tooltip.payload}
                    measure={model.query.measure}
                    categoryLabels={model.categoryLabels}
                    seriesLabels={model.seriesLabels}
                    hidden={hidden}
                  />
                )}
              />
              {model.seriesKeys.map((key, index) => (
                <SeriesShape
                  key={key}
                  seriesKey={key}
                  name={model.seriesLabels[key] ?? key}
                  chart={model.query.chart}
                  color={seriesColor(index, key)}
                  hide={hidden.has(key)}
                  animate={model.points.length <= ANIMATION_POINT_LIMIT}
                  showDots={model.points.length <= DOT_POINT_LIMIT}
                  points={model.points}
                  single={model.seriesKeys.length === 1}
                />
              ))}
            </ChartFrame>
          </ResponsiveContainer>
        </div>
      )}
      {legend && model.seriesKeys.length > 1 ? (
        <ul className={styles.legend}>
          {model.seriesKeys.map((key, index) => {
            const off = hidden.has(key);
            return (
              <li key={key}>
                <button
                  type="button"
                  className={off ? styles.legendOff : styles.legendButton}
                  aria-pressed={!off}
                  onClick={() => {
                    setHidden((current) => {
                      const next = new Set(current);
                      if (next.has(key)) next.delete(key);
                      else next.add(key);
                      return next;
                    });
                  }}
                >
                  <span className={styles.swatch} style={{ background: seriesColor(index, key) }} />
                  {model.seriesLabels[key] ?? key}
                </button>
              </li>
            );
          })}
        </ul>
      ) : null}
      {summaryText ? <p className={styles.summary}>{summaryText}</p> : null}
    </section>
  );
}

type ChartRow = Record<string, string | number>;

function chartRows(
  points: readonly GraphPoint[],
  seriesKeys: readonly string[],
  measure: Measure,
): ChartRow[] {
  return points.map((point) => {
    const row: ChartRow = { x: point.x };
    for (const key of seriesKeys) {
      const raw = point.series[key] ?? 0;
      row[key] = plotValue(measure, raw);
      row[`raw:${key}`] = raw;
    }
    return row;
  });
}

type FrameProps = {
  chart: ChartType;
  compact: boolean;
  data: ChartRow[];
  onClick?: (state: { activeLabel?: unknown }) => void;
  children: ReactNode;
};

function ChartFrame({ chart, compact, data, onClick, children }: FrameProps) {
  const shared = {
    data,
    margin: {
      top: 8,
      right: 8,
      left: compact ? 0 : 28,
      bottom: compact ? 0 : 8,
    },
    onClick,
  };
  if (chart === "bar") return <BarChart {...shared}>{children}</BarChart>;
  if (chart === "area") return <AreaChart {...shared}>{children}</AreaChart>;
  return <LineChart {...shared}>{children}</LineChart>;
}

type SeriesShapeProps = {
  seriesKey: string;
  name: string;
  chart: ChartType;
  color: string;
  hide: boolean;
  animate: boolean;
  showDots: boolean;
  points: readonly GraphPoint[];
  single: boolean;
};

function SeriesShape({
  seriesKey,
  name,
  chart,
  color,
  hide,
  animate,
  showDots,
  points,
  single,
}: SeriesShapeProps) {
  if (chart === "bar") {
    return (
      <Bar dataKey={seriesKey} name={name} fill={color} hide={hide} isAnimationActive={animate}>
        {single
          ? points.map((point) => (
              <Cell key={point.x} fill={point.x === OTHER_KEY ? OTHER_COLOR : color} />
            ))
          : null}
      </Bar>
    );
  }
  if (chart === "area") {
    return (
      <Area
        type="monotone"
        dataKey={seriesKey}
        name={name}
        stroke={color}
        fill={color}
        fillOpacity={0.2}
        hide={hide}
        isAnimationActive={animate}
      />
    );
  }
  return (
    <Line
      type="monotone"
      dataKey={seriesKey}
      name={name}
      stroke={color}
      strokeWidth={2}
      dot={showDots}
      hide={hide}
      isAnimationActive={animate}
    />
  );
}

type TooltipItem = {
  dataKey?: unknown;
  name?: unknown;
  color?: string;
  payload?: ChartRow;
};

function ChartTooltip({
  active,
  label,
  payload,
  measure,
  categoryLabels,
  seriesLabels,
  hidden,
}: {
  active?: boolean;
  label?: unknown;
  payload?: readonly TooltipItem[];
  measure: Measure;
  categoryLabels: Record<string, string>;
  seriesLabels: Record<string, string>;
  hidden: ReadonlySet<string>;
}) {
  if (!active || !payload || payload.length === 0) return null;
  const heading =
    typeof label === "string" ? (categoryLabels[label] ?? label) : String(label ?? "");
  const items = payload
    .filter((item) => {
      const key = item.dataKey;
      return typeof key === "string" && !key.startsWith("raw:") && !hidden.has(key);
    })
    .sort((a, b) => rawOf(b) - rawOf(a));
  if (items.length === 0) return null;
  return (
    <div className={styles.tooltip}>
      <p className={styles.tooltipLabel}>{heading}</p>
      <ul className={styles.tooltipList}>
        {items.map((item) => {
          const key = String(item.dataKey);
          return (
            <li key={key} style={{ color: item.color }}>
              {seriesLabels[key] ?? String(item.name ?? key)}: {formatTooltipValue(measure, rawOf(item))}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function rawOf(item: TooltipItem): number {
  const key = item.dataKey;
  if (typeof key !== "string" || !item.payload) return 0;
  const raw = item.payload[`raw:${key}`];
  return typeof raw === "number" ? raw : 0;
}
