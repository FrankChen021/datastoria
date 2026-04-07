"use client";

import * as echarts from "echarts";
import { useEffect, useRef } from "react";
import useIsDarkTheme from "./use-is-dark-theme";

// Produces a stable string key from initOptions.
// Used as a dep-array value so the effect reruns only when the options'
// serialized content changes, not on every new object reference.
function serializeInitOptions(opts: echarts.EChartsInitOpts | undefined): string {
  try {
    return JSON.stringify(opts) ?? "";
  } catch {
    return "";
  }
}

export interface UseEchartsOptions {
  /**
   * Whether to use explicit dimensions for resizing.
   * Useful for crisp rendering in some components like Gauge.
   */
  useExplicitSize?: boolean;
  /**
   * Additional initialization options for ECharts.
   */
  initOptions?: echarts.EChartsInitOpts;
  /**
   * Additional dependencies that should trigger re-initialization.
   */
  dependencies?: React.DependencyList;
}

/**
 * Common hook for ECharts initialization, resizing, and lifecycle management.
 */
export function useEcharts(options: UseEchartsOptions = {}) {
  const { useExplicitSize = false, initOptions, dependencies = [] } = options;
  const isDark = useIsDarkTheme();

  const chartContainerRef = useRef<HTMLDivElement>(null);
  const chartInstanceRef = useRef<echarts.ECharts | null>(null);

  // Compute the serialized snapshot on every render.  When content genuinely
  // changes, this produces a different string and triggers the effect to rerun.
  // When the caller passes a structurally identical object (e.g. a new literal
  // each render), the string stays the same and no unnecessary re-init fires.
  const initOptionsSnapshot = serializeInitOptions(initOptions);

  // Keep a ref so the latest initOptions value is accessible inside the effect
  // without needing to list the object reference itself in the dep array.
  const initOptionsRef = useRef(initOptions);
  initOptionsRef.current = initOptions;

  useEffect(() => {
    const container = chartContainerRef.current;
    if (!container) {
      return;
    }

    // Function to initialize the chart instance if dimensions are valid
    const initChart = () => {
      if (chartInstanceRef.current) {
        return chartInstanceRef.current;
      }
      const { clientWidth, clientHeight } = container;
      if (clientWidth === 0 || clientHeight === 0) {
        return null;
      }

      const chartTheme = isDark ? "dark" : undefined;
      const instance = echarts.init(container, chartTheme, {
        useCoarsePointer: true,
        ...initOptionsRef.current,
      });
      chartInstanceRef.current = instance;
      return instance;
    };

    // Dispose existing instance when theme or init options changed
    if (chartInstanceRef.current) {
      chartInstanceRef.current.dispose();
      chartInstanceRef.current = null;
    }

    // Initial attempt to initialize
    initChart();

    const handleResize = () => {
      if (chartInstanceRef.current && container) {
        if (useExplicitSize) {
          const { width, height } = container.getBoundingClientRect();
          if (width > 0 && height > 0) {
            chartInstanceRef.current.resize({
              width: Math.round(width),
              height: Math.round(height),
            });
          }
        } else {
          const { clientWidth: w, clientHeight: h } = container;
          if (w > 0 && h > 0) {
            chartInstanceRef.current.resize({ width: "auto", height: "auto" });
          }
        }
      }
    };

    window.addEventListener("resize", handleResize);

    const resizeObserver = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (!entry) return;

      let width: number;
      let height: number;

      if (entry.contentRect) {
        width = entry.contentRect.width;
        height = entry.contentRect.height;
      } else {
        const rect = entry.target.getBoundingClientRect();
        width = rect.width;
        height = rect.height;
      }

      if (width > 0 && height > 0) {
        requestAnimationFrame(() => {
          let instance = chartInstanceRef.current;
          if (!instance) {
            instance = initChart();
          }

          if (instance) {
            if (useExplicitSize) {
              instance.resize({
                width: Math.round(width),
                height: Math.round(height),
              });
            } else {
              instance.resize({ width: "auto", height: "auto" });
            }
          }
        });
      }
    });

    resizeObserver.observe(container);

    const initialResizeTimeout = setTimeout(() => {
      handleResize();
    }, 100);

    return () => {
      clearTimeout(initialResizeTimeout);
      resizeObserver.disconnect();
      window.removeEventListener("resize", handleResize);
      if (chartInstanceRef.current) {
        chartInstanceRef.current.dispose();
        chartInstanceRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- caller provides additional dynamic dependencies for chart lifecycle
  }, [isDark, useExplicitSize, initOptionsSnapshot, ...dependencies]);

  return {
    chartContainerRef,
    chartInstanceRef,
  };
}
