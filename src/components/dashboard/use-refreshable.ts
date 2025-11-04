import { useCallback, useEffect, useRef, useState } from "react";
import type { RefreshParameter } from "./refreshable-component";

interface UseRefreshableOptions {
  componentId?: string;
  initialCollapsed?: boolean;
  refreshInternal: (param: RefreshParameter) => void;
}

interface UseRefreshableReturn {
  componentRef: React.RefObject<HTMLDivElement>;
  isCollapsed: boolean;
  setIsCollapsed: (collapsed: boolean) => void;
  refresh: (param: RefreshParameter) => void;
  getLastRefreshParameter: () => RefreshParameter;
}

/**
 * Shared hook for refreshable components that handles:
 * - Collapsed state management
 * - Viewport detection
 * - Refresh logic (only refresh if NOT collapsed AND in viewport)
 * - IntersectionObserver setup
 * - Deferred refresh when component expands
 */
export function useRefreshable({
  componentId,
  initialCollapsed = false,
  refreshInternal,
}: UseRefreshableOptions): UseRefreshableReturn {
  // State
  const [isCollapsed, setIsCollapsed] = useState(initialCollapsed);
  const [needRefresh, setNeedRefresh] = useState(false);

  // Refs
  const componentRef = useRef<HTMLDivElement>(null);
  const observerRef = useRef<IntersectionObserver | null>(null);
  const refreshParameterRef = useRef<RefreshParameter | undefined>(undefined);
  const lastRefreshParamRef = useRef<RefreshParameter | undefined>(undefined);

  // Check if component is in viewport
  const isComponentInView = useCallback((): boolean => {
    if (componentRef.current) {
      const rect = componentRef.current.getBoundingClientRect();
      return rect.top >= 0 && rect.top < (window.innerHeight || document.documentElement.clientHeight);
    }
    return false;
  }, []);

  // Check if component should refresh (not collapsed AND in viewport)
  const shouldRefresh = useCallback((): boolean => {
    return !isCollapsed && isComponentInView();
  }, [isCollapsed, isComponentInView]);

  // Public refresh method
  const refresh = useCallback(
    (param: RefreshParameter) => {
      // Check if the parameters have actually changed
      // Skip refresh if we already have data with the same parameters (avoid unnecessary API calls)
      if (lastRefreshParamRef.current && JSON.stringify(lastRefreshParamRef.current) === JSON.stringify(param)) {
        console.trace(`Component [${componentId || "unknown"}] skipping refresh - parameters unchanged`);
        return;
      }

      lastRefreshParamRef.current = param;
      refreshParameterRef.current = param;

      console.trace(
        `Component [${componentId || "unknown"}] refresh called, isCollapsed: ${isCollapsed}, isInView: ${isComponentInView()}, hasTimeSpan: ${!!param.selectedTimeSpan}`
      );

      // Only refresh if NOT collapsed AND in viewport
      if (shouldRefresh()) {
        refreshInternal(param);
        setNeedRefresh(false);
      } else {
        // Mark that refresh is needed when component becomes visible/expanded
        setNeedRefresh(true);
      }
    },
    [componentId, isCollapsed, isComponentInView, shouldRefresh, refreshInternal]
  );

  const getLastRefreshParameter = useCallback((): RefreshParameter => {
    return refreshParameterRef.current || {};
  }, []);

  // Handle collapsed state changes - refresh when expanded if needed
  useEffect(() => {
    if (!isCollapsed && needRefresh && shouldRefresh()) {
      console.trace(`Component [${componentId || "unknown"}] expanding and refreshing...`);
      const currentParam = refreshParameterRef.current;
      if (currentParam) {
        refreshInternal(currentParam);
      }
      setNeedRefresh(false);
    }
  }, [isCollapsed, needRefresh, shouldRefresh, componentId, refreshInternal]);

  // IntersectionObserver setup
  useEffect(() => {
    const handleIntersection = (entries: IntersectionObserverEntry[]) => {
      const entry = entries[0];
      if (entry.isIntersecting && needRefresh && shouldRefresh()) {
        console.trace(`Component [${componentId || "unknown"}] entering viewport and refreshing...`);
        const currentParam = refreshParameterRef.current;
        if (currentParam) {
          refreshInternal(currentParam);
        }
        setNeedRefresh(false);
      }
    };

    const currentComponent = componentRef.current;
    observerRef.current = new IntersectionObserver(handleIntersection, {
      root: null,
      rootMargin: "0px",
      threshold: 0.1,
    });

    if (currentComponent) {
      observerRef.current.observe(currentComponent);
    }

    return () => {
      if (currentComponent && observerRef.current) {
        observerRef.current.unobserve(currentComponent);
      }
    };
  }, [componentId, needRefresh, shouldRefresh, refreshInternal]);

  return {
    componentRef,
    isCollapsed,
    setIsCollapsed,
    refresh,
    getLastRefreshParameter,
  };
}

