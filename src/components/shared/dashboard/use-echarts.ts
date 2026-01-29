"use client";

import * as echarts from "echarts";
import { useEffect, useRef } from "react";
import useIsDarkTheme from "./use-is-dark-theme";

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
        ...initOptions,
      });
      chartInstanceRef.current = instance;
      return instance;
    };

    // Dispose existing instance if theme or fundamental options changed
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
  }, [isDark, useExplicitSize, JSON.stringify(initOptions), ...dependencies]);

  return {
    chartContainerRef,
    chartInstanceRef,
  };
}
