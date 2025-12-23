import { useCallback, useEffect, useRef, useState } from "react";
import type { RefreshOptions } from "./dashboard-panel-layout";

interface UseRefreshableOptions {
  initialCollapsed?: boolean;
  refreshInternal: (param: RefreshOptions) => void;
  // Provide initial parameters so the hook can trigger the first refresh automatically
  // Components should memoize this function with useCallback and include their dependencies
  getInitialParams?: () => RefreshOptions | undefined;
  // Callback when collapsed state changes (called only when user toggles, not on prop changes)
  onCollapsedChange?: (collapsed: boolean) => void;
}

interface UseRefreshableReturn {
  componentRef: React.RefObject<HTMLDivElement | null>;
  isCollapsed: boolean;
  setIsCollapsed: (collapsed: boolean) => void;
  refresh: (param: RefreshOptions) => void;
  getLastRefreshParameter: () => RefreshOptions;
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
  initialCollapsed = false,
  refreshInternal,
  getInitialParams,
  onCollapsedChange,
}: UseRefreshableOptions): UseRefreshableReturn {
  // State
  const [isCollapsed, setIsCollapsedInternal] = useState(initialCollapsed);
  const [needRefresh, setNeedRefresh] = useState(false);

  // Wrapper around setIsCollapsed that also calls the callback
  const setIsCollapsed = useCallback(
    (collapsed: boolean) => {
      setIsCollapsedInternal(collapsed);
      onCollapsedChange?.(collapsed);
    },
    [onCollapsedChange]
  );

  // Refs
  const componentRef = useRef<HTMLDivElement>(null);
  const observerRef = useRef<IntersectionObserver | null>(null);
  const refreshParameterRef = useRef<RefreshOptions | undefined>(undefined);
  const lastRefreshParamRef = useRef<RefreshOptions | undefined>(undefined);

  // Check if component is actually visible (not hidden by collapsed parents, and in viewport)
  const isComponentInView = useCallback((): boolean => {
    if (!componentRef.current) {
      return false;
    }

    const element = componentRef.current;

    // Check if element is actually visible (not hidden by collapsed parents)
    // Elements inside collapsed CollapsibleContent have display: none or height: 0
    const rect = element.getBoundingClientRect();
    const isVisible = rect.width > 0 && rect.height > 0;

    if (!isVisible) {
      return false;
    }

    // Check if any parent is hidden (collapsed)
    // Only check up to body element to avoid false positives
    let parent: HTMLElement | null = element.parentElement;
    while (parent && parent !== document.body) {
      const style = window.getComputedStyle(parent);
      // Check if parent is hidden via display: none or visibility: hidden
      if (style.display === 'none' || style.visibility === 'hidden') {
        return false;
      }
      // Check if parent has hidden attribute
      if (parent.hasAttribute('hidden')) {
        return false;
      }
      // Check if parent has collapsed content (CollapsibleContent when closed)
      // CollapsibleContent uses data-state="closed" with hidden class
      // But we need to check if this parent itself is the CollapsibleContent, not just any parent with data-state
      if (parent.hasAttribute('data-state') && parent.getAttribute('data-state') === 'closed') {
        // Only treat as hidden if the computed style confirms it (display: none from the data-state:closed class)
        if (style.display === 'none') {
          return false;
        }
      }
      parent = parent.parentElement;
    }

    // Check if element is in viewport (with some margin for elements at the edge)
    // Element is considered in viewport if any part of it is visible
    const viewportHeight = window.innerHeight || document.documentElement.clientHeight;
    const elementBottom = rect.bottom;
    const elementTop = rect.top;

    // Element is in viewport if:
    // - Top is above bottom of viewport AND
    // - Bottom is below top of viewport
    return elementTop < viewportHeight && elementBottom > 0;
  }, []);

  // Check if component should refresh (not collapsed AND in viewport)
  const shouldRefresh = useCallback((): boolean => {
    return !isCollapsed && isComponentInView();
  }, [isCollapsed, isComponentInView]);

  // Public refresh method
  const refresh = useCallback(
    (param: RefreshOptions) => {
      // Check if the parameters have actually changed
      // Skip refresh if we already have data with the same parameters (avoid unnecessary API calls)
      // UNLESS forceRefresh is true (e.g., when user clicks the refresh button)
      if (!param.forceRefresh && lastRefreshParamRef.current && JSON.stringify(lastRefreshParamRef.current) === JSON.stringify(param)) {
        return;
      }

      // Store the parameter for potential deferred execution
      refreshParameterRef.current = param;

      // Re-check visibility at the time of refresh (it may have changed)
      const isCurrentlyVisible = isComponentInView();
      const shouldRefreshNow = !isCollapsed && isCurrentlyVisible;

      // Only refresh if NOT collapsed AND in viewport
      if (shouldRefreshNow) {
        // Only update lastRefreshParamRef after successfully executing refresh
        refreshInternal(param);
        lastRefreshParamRef.current = param;
        setNeedRefresh(false);
      } else {
        // Mark that refresh is needed when component becomes visible/expanded
        // Don't update lastRefreshParamRef here - we haven't executed yet
        setNeedRefresh(true);
      }
    },
    [isCollapsed, isComponentInView, refreshInternal]
  );

  const getLastRefreshParameter = useCallback((): RefreshOptions => {
    return refreshParameterRef.current || {};
  }, []);

  // Trigger initial refresh (deferred until visible if needed)
  useEffect(() => {
    if (!getInitialParams) {
      // If no initial params getter, we still want to trigger an initial "blank" refresh 
      // if the component supports raw execution
      refresh({} as RefreshOptions);
      return;
    }
    const params = getInitialParams();
    // Even if params is undefined, we trigger it. The component's loadData will handle validation.
    refresh(params || {} as RefreshOptions);
  }, [getInitialParams, refresh]);

  // Handle collapsed state changes - refresh when expanded if needed
  useEffect(() => {
    if (!isCollapsed && needRefresh && shouldRefresh()) {
      const currentParam = refreshParameterRef.current;
      if (currentParam) {
        // Check if parameters have actually changed before refreshing
        // If parameters haven't changed, don't re-fetch - just clear the needRefresh flag
        if (lastRefreshParamRef.current && JSON.stringify(lastRefreshParamRef.current) === JSON.stringify(currentParam)) {
          setNeedRefresh(false);
        } else {
          refreshInternal(currentParam);
          lastRefreshParamRef.current = currentParam;
          setNeedRefresh(false);
        }
      } else {
        setNeedRefresh(false);
      }
    }
  }, [isCollapsed, needRefresh, shouldRefresh, refreshInternal]);

  // IntersectionObserver setup
  useEffect(() => {
    const handleIntersection = (entries: IntersectionObserverEntry[]) => {
      const entry = entries[0];
      // Trigger if element is intersecting and visible
      if (entry.isIntersecting && entry.intersectionRatio > 0 && shouldRefresh()) {
        // Double-check visibility using our more thorough check
        if (!isComponentInView()) {
          return;
        }

        const currentParam = refreshParameterRef.current;
        if (currentParam) {
          // Check if parameters have actually changed before refreshing
          if (lastRefreshParamRef.current && JSON.stringify(lastRefreshParamRef.current) === JSON.stringify(currentParam)) {
            setNeedRefresh(false);
          } else {
            refreshInternal(currentParam);
            lastRefreshParamRef.current = currentParam;
            setNeedRefresh(false);
          }
        }
        // Note: If currentParam is undefined, we don't set needRefresh to false
        // This allows the component to refresh later when parameters become available
      }
    };

    const currentComponent = componentRef.current;
    observerRef.current = new IntersectionObserver(handleIntersection, {
      root: null,
      rootMargin: "0px",
      threshold: [0, 0.1], // Observe both when entering and when fully visible
    });

    if (currentComponent) {
      observerRef.current.observe(currentComponent);
    }

    return () => {
      if (currentComponent && observerRef.current) {
        observerRef.current.unobserve(currentComponent);
      }
    };
  }, [needRefresh, shouldRefresh, refreshInternal, isComponentInView]);

  return {
    componentRef,
    isCollapsed,
    setIsCollapsed,
    refresh,
    getLastRefreshParameter,
  };
}

