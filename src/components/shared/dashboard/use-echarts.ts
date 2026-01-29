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
}

/**
 * Common hook for ECharts initialization, resizing, and lifecycle management.
 */
export function useEcharts(options: UseEchartsOptions = {}) {
    const { useExplicitSize = false, initOptions } = options;
    const isDark = useIsDarkTheme();

    const chartContainerRef = useRef<HTMLDivElement>(null);
    const chartInstanceRef = useRef<echarts.ECharts | null>(null);

    useEffect(() => {
        if (!chartContainerRef.current) {
            return;
        }

        // Check if container has valid dimensions before initializing
        const { clientWidth, clientHeight } = chartContainerRef.current;
        if (clientWidth === 0 || clientHeight === 0) {
            return;
        }

        // Dispose existing instance if theme changed
        if (chartInstanceRef.current) {
            chartInstanceRef.current.dispose();
            chartInstanceRef.current = null;
        }

        // Initialize with dark theme if in dark mode
        const chartTheme = isDark ? "dark" : undefined;

        const instance = echarts.init(chartContainerRef.current, chartTheme, {
            useCoarsePointer: true,
            ...initOptions,
        });
        chartInstanceRef.current = instance;

        const handleResize = () => {
            if (chartInstanceRef.current && chartContainerRef.current) {
                if (useExplicitSize) {
                    const { width, height } = chartContainerRef.current.getBoundingClientRect();
                    if (width > 0 && height > 0) {
                        chartInstanceRef.current.resize({
                            width: Math.round(width),
                            height: Math.round(height),
                        });
                    }
                } else {
                    const { clientWidth: w, clientHeight: h } = chartContainerRef.current;
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
                // Fallback for older browsers
                const rect = entry.target.getBoundingClientRect();
                width = rect.width;
                height = rect.height;
            }

            if (width > 0 && height > 0 && chartInstanceRef.current) {
                requestAnimationFrame(() => {
                    if (chartInstanceRef.current) {
                        if (useExplicitSize) {
                            chartInstanceRef.current.resize({
                                width: Math.round(width),
                                height: Math.round(height),
                            });
                        } else {
                            chartInstanceRef.current.resize({ width: "auto", height: "auto" });
                        }
                    }
                });
            }
        });

        resizeObserver.observe(chartContainerRef.current);

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
    }, [isDark, useExplicitSize, initOptions]);

    return {
        chartContainerRef,
        chartInstanceRef,
    };
}
