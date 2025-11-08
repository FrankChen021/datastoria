import React, { type CSSProperties } from "react";
import { type Graphviz, graphviz, type GraphvizOptions } from "d3-graphviz";
import { select as d3_select, selectAll as d3_selectAll, type Selection } from "d3-selection";
import { zoomIdentity as d3_zoomIdentity, zoomTransform as d3_zoomTransform } from "d3-zoom";
import { ZoomIn, ZoomOut, Maximize, Minimize2 } from "lucide-react";
import { Button } from "@/components/ui/button";

/**
 * type: node | edge
 */
type OnGraphActionFn = (action: "click" | "r-click", x: number, y: number, type: string, key: string) => void;
type GraphvizEventHandler = () => void;
type RegisterGraphEventHandler = (handler: GraphvizEventHandler) => void;

// The Graphviz is based on react-graphviz @ https://github.com/DomParfitt/graphviz-react
//
// It uses a very old d3-graphviz version, and does not handle the zoom property well
interface IGraphvizProps {
  /**
   * A string containing a graph representation using the Graphviz DOT language.
   * @see https://graphviz.org/doc/info/lang.html
   */
  dot: string;
  /**
   * Options to pass to the Graphviz renderer.
   */
  options?: GraphvizOptions;
  /**
   * The classname to attach to this component for styling purposes.
   */
  className?: string;

  ref?: React.Ref<HTMLDivElement>;

  onGraphAction?: OnGraphActionFn;
  registerZoomInHandler?: RegisterGraphEventHandler;
  registerZoomOutHandler?: RegisterGraphEventHandler;
  registerZoomResetHandler?: RegisterGraphEventHandler;
}

let counter = 0;

class GraphvizComponentImpl extends React.Component<
  IGraphvizProps,
  {
    id: string;
  }
> {
  private svg: Selection<SVGSVGElement, unknown, null, undefined>;
  private div: Selection<HTMLDivElement, unknown, null, undefined>;
  private graph0: Selection<SVGGElement, unknown, null, undefined>;
  private graphviz: Graphviz<HTMLDivElement, unknown, SVGSVGElement, SVGGElement> | null;
  private selectedComponents: Selection<SVGElement, unknown, null, undefined>;

  private onGraphAction?: OnGraphActionFn;

  // Pinch zoom state
  private lastTouchDistance: number = 0;
  private initialScale: number = 1;
  private touchStartHandler?: (e: TouchEvent) => void;
  private touchMoveHandler?: (e: TouchEvent) => void;
  private touchEndHandler?: (e: TouchEvent) => void;

  constructor(props: IGraphvizProps) {
    super(props);
    this.state = {
      id: `graphviz${counter++}`,
    };

    // Initialize with null and type assertions - will be set in componentDidMount
    this.selectedComponents = d3_selectAll<SVGElement, unknown>(null as any) as any;
    this.graph0 = d3_select<SVGGElement, unknown>(null as any) as any;
    this.svg = d3_select<SVGSVGElement, unknown>(null as any) as any;
    this.div = d3_select<HTMLDivElement, unknown>(null as any) as any;
    this.graphviz = null;
  }

  componentDidMount() {
    this.renderGraph(true, false);
    this.onGraphAction = this.props.onGraphAction;

    if (this.props.registerZoomInHandler !== undefined) this.props.registerZoomInHandler(this.zoomInHandler);

    if (this.props.registerZoomOutHandler !== undefined) this.props.registerZoomOutHandler(this.zoomOutHandler);

    if (this.props.registerZoomResetHandler !== undefined) this.props.registerZoomResetHandler(this.zoomResetHandler);

    // Observe the DIV size change to set the SVG size
    const divHtmlElement = this.div.node();
    if (!divHtmlElement) return;

    // Create a ResizeObserver instance
    // const resizeObserver = new ResizeObserver((entries) => {
    //   // Loop through the entries when the observed element's size changes
    //   for (const entry of entries) {
    //     if (entry.target === divHtmlElement) {
    //       // Get the new width of the parent <div>
    //       const parentDivWidth = entry.contentRect.width;

    //       const svgNode = this.svg.node();
    //       if (svgNode) {
    //         svgNode.setAttribute("width", parentDivWidth + "pt");
    //       }
    //     }
    //   }
    // });

    // // Start observing the parent <div> for size changes
    // resizeObserver.observe(divHtmlElement);
    
    // Note: pinch zoom setup happens in renderGraph's render callback
  }

  componentWillUnmount() {
    // Clean up pinch zoom handlers
    this.cleanupPinchZoom();
  }

  private getDistance(touch1: Touch, touch2: Touch): number {
    const dx = touch2.clientX - touch1.clientX;
    const dy = touch2.clientY - touch1.clientY;
    return Math.sqrt(dx * dx + dy * dy);
  }

  private getCurrentScale(): number {
    if (!this.graphviz) return 1;
    try {
      const zoomSelection = this.graphviz.zoomSelection();
      if (!zoomSelection) return 1;
      const node = (zoomSelection as any).node() as Element | null;
      if (!node) return 1;
      const transform = d3_zoomTransform(node as any);
      return transform.k || 1;
    } catch {
      return 1;
    }
  }

  private setupPinchZoom() {
    const divNode = this.div.node();
    if (!divNode) {
      return;
    }
    
    if (!this.graphviz) {
      return;
    }
    
    // Clean up existing handlers if any
    this.cleanupPinchZoom();

    this.touchStartHandler = (e: TouchEvent) => {
      if (e.touches.length === 2 && this.graphviz) {
        // Prevent default browser zoom behavior
        e.preventDefault();
        e.stopPropagation();
        e.stopImmediatePropagation();
        
        this.lastTouchDistance = this.getDistance(e.touches[0], e.touches[1]);
        this.initialScale = this.getCurrentScale();
        
        // Mark that we're handling the pinch
        (e.target as HTMLElement)?.setAttribute('data-pinch-active', 'true');
      }
    };

    this.touchMoveHandler = (e: TouchEvent) => {
      if (e.touches.length === 2 && this.graphviz) {
        // Always prevent default to stop page zoom
        e.preventDefault();
        e.stopPropagation();
        e.stopImmediatePropagation();
        
        const currentDistance = this.getDistance(e.touches[0], e.touches[1]);
        if (this.lastTouchDistance === 0) {
          this.lastTouchDistance = currentDistance;
          return;
        }
        
        const scaleChange = currentDistance / this.lastTouchDistance;
        const newScale = this.initialScale * scaleChange;

        // Clamp scale to reasonable bounds (0.1 to 10)
        const clampedScale = Math.max(0.1, Math.min(10, newScale));

        // Use the existing setZoomScale method which is proven to work
        // Just apply the scale change
        this.setZoomScale(clampedScale, false);
        
        this.lastTouchDistance = currentDistance;
        this.initialScale = clampedScale;
      } else if (e.touches.length === 2) {
        // Even if graphviz isn't ready, prevent page zoom
        e.preventDefault();
        e.stopPropagation();
      }
    };

    this.touchEndHandler = (e: TouchEvent) => {
      // Remove the pinch marker
      const target = e.target as HTMLElement;
      if (target) {
        target.removeAttribute('data-pinch-active');
      }
      
      this.lastTouchDistance = 0;
      this.initialScale = this.getCurrentScale();
    };

    // Use capture phase to intercept events before they bubble
    divNode.addEventListener("touchstart", this.touchStartHandler, { passive: false, capture: true });
    divNode.addEventListener("touchmove", this.touchMoveHandler, { passive: false, capture: true });
    divNode.addEventListener("touchend", this.touchEndHandler, { capture: true });
    divNode.addEventListener("touchcancel", this.touchEndHandler, { capture: true });
    
    // Also prevent gesture events (iOS Safari)
    divNode.addEventListener("gesturestart", (e) => {
      e.preventDefault();
      e.stopPropagation();
    }, { passive: false, capture: true });
    
    divNode.addEventListener("gesturechange", (e) => {
      e.preventDefault();
      e.stopPropagation();
    }, { passive: false, capture: true });
    
    divNode.addEventListener("gestureend", (e) => {
      e.preventDefault();
      e.stopPropagation();
    }, { passive: false, capture: true });
  }


  private cleanupPinchZoom() {
    const divNode = this.div.node();
    if (!divNode) return;

    if (this.touchStartHandler) {
      divNode.removeEventListener("touchstart", this.touchStartHandler, true); // capture phase
    }
    if (this.touchMoveHandler) {
      divNode.removeEventListener("touchmove", this.touchMoveHandler, true); // capture phase
    }
    if (this.touchEndHandler) {
      divNode.removeEventListener("touchend", this.touchEndHandler, true); // capture phase
      divNode.removeEventListener("touchcancel", this.touchEndHandler, true); // capture phase
    }
    
    // Note: Gesture handlers are anonymous functions, so we can't clean them up individually
    // They will be replaced on the next setupPinchZoom call
  }

  shouldComponentUpdate(
    nextProps: Readonly<IGraphvizProps>,
    _nextState: Readonly<{
      id: string;
    }>,
    _nextContext: unknown
  ): boolean {
    // Update handlers
    this.onGraphAction = nextProps.onGraphAction;

    if (nextProps.registerZoomInHandler !== undefined) nextProps.registerZoomInHandler(this.zoomInHandler);

    if (nextProps.registerZoomOutHandler !== undefined) nextProps.registerZoomOutHandler(this.zoomOutHandler);

    if (nextProps.registerZoomResetHandler !== undefined) nextProps.registerZoomResetHandler(this.zoomResetHandler);

    return this.props.dot !== nextProps.dot || this.props.options !== nextProps.options;
  }

  componentDidUpdate(
    prevProps: Readonly<IGraphvizProps>,
    _prevState: Readonly<{ id: string }>,
    _snapshot?: unknown
  ) {
    // Clean up and re-setup pinch zoom if the component is re-rendered
    this.cleanupPinchZoom();
    this.renderGraph(prevProps.dot !== this.props.dot, prevProps.options?.zoom !== this.props.options?.zoom);
    // Re-setup happens in renderGraph's render callback
  }

  zoomInHandler = () => {
    if (this.graphviz !== null) {
      const zoomSelection = this.graphviz.zoomSelection();
      if (!zoomSelection) return;
      const node = (zoomSelection as any).node();
      if (node) {
        const scale = d3_zoomTransform(node as any).k;
        this.setZoomScale(scale * 1.1);
      }
    }
  };

  zoomOutHandler = () => {
    if (this.graphviz !== null) {
      const zoomSelection = this.graphviz.zoomSelection();
      if (!zoomSelection) return;
      const node = (zoomSelection as any).node();
      if (node) {
        const scale = d3_zoomTransform(node as any).k;
        this.setZoomScale(scale / 1.1);
      }
    }
  };

  zoomResetHandler = () => {
    this.setZoomScale(1, true);
  };

  setZoomScale = (scale: number, center = false, reset = false) => {
    if (!this.graphviz) return;

    const viewBox = this.svg.attr("viewBox");
    if (!viewBox) return;

    const viewBoxParts = viewBox.split(" ");
    const width = parseFloat(viewBoxParts[2]);
    const height = parseFloat(viewBoxParts[3]);

    const graph0Node = this.graph0.node();
    if (!graph0Node) return;

    const bbox = graph0Node.getBBox();
    const zoomSelection = this.graphviz.zoomSelection();
    if (!zoomSelection) return;
    const node = (zoomSelection as any).node();
    if (!node) return;

    let { x, y, k } = d3_zoomTransform(node as any);
    let [x0, y0, scale0] = [x, y, k];
    let xOffset0 = x0 + bbox.x * scale0;
    let yOffset0 = y0 + bbox.y * scale0;
    let xCenter = width / 2;
    let yCenter = height / 2;
    let xOffset;
    let yOffset;
    if (center) {
      xOffset = (width - bbox.width * scale) / 2;
      yOffset = (height - bbox.height * scale) / 2;
    } else if (reset) {
      xOffset = 0;
      yOffset = 0;
    } else {
      xOffset = xCenter - (xCenter - xOffset0) * (scale / scale0);
      yOffset = yCenter - (yCenter - yOffset0) * (scale / scale0);
    }
    x = -bbox.x * scale + xOffset;
    y = -bbox.y * scale + yOffset;
    const transform = d3_zoomIdentity.translate(x, y).scale(scale);

    // @ts-expect-error - d3-graphviz types
    zoomSelection.call(this.graphviz.zoomBehavior().transform, transform);
  };

  private renderGraph(_renderGraph: boolean, resetZoom: boolean) {
    const divNode = this.div.node();
    if (!divNode) return;

    //
    // NOTE: Need to re-render the dot so that zoom reset can work correctly
    //
    this.graphviz = (graphviz(`#${this.state.id}`, {
      fit: true,
      zoom: true,
      width: divNode.offsetWidth,
      ...this.props.options,
    }) as any)
      .renderDot(this.props.dot)
      .render(() => {
        this.svg = this.div!.select<SVGSVGElement>("svg");
        this.graph0 = this.svg.select<SVGGElement>("g");

        // Remove the default wheel zoom event
        // This confuses the scroll down/up of the container on macOS by swiping the touchpad up/down
        this.svg.on("wheel.zoom", null);

        this.div.on("contextmenu", this.handleRightClickDiv.bind(this));

        const nodes = this.svg.selectAll<SVGElement, unknown>(".node");
        nodes.on("click", this.handleClickGraphNode.bind(this));
        nodes.on("contextmenu", this.handleRightClickGraphElement.bind(this));

        const edges = this.svg.selectAll<SVGElement, unknown>(".edge");
        edges.on("click", this.handleClickGraphEdge.bind(this));
        edges.on("contextmenu", this.handleRightClickGraphElement.bind(this));

        // Setup pinch zoom after graph is rendered
        setTimeout(() => {
          this.setupPinchZoom();
        }, 50);
      });

    // Reset zoom behaviour
    if (resetZoom && this.graphviz) {
      const zoomed = this.props.options?.zoom !== undefined ? this.props.options.zoom : false;
      const zoomSelection = this.graphviz.zoomSelection();
      if (!zoomSelection) return;
      const node = (zoomSelection as any).node();
      if (!zoomed && node) {
        this.graphviz.resetZoom();
      }
      try {
        this.graphviz.zoom(zoomed);
      } catch (e) {
        // Ignore errors
      }
    }
  }

  handleRightClickDiv(event: MouseEvent) {
    event.preventDefault();
    event.stopPropagation();
    this.unSelectComponents();
  }

  handleClickGraphNode(event: MouseEvent) {
    event.preventDefault();
    event.stopPropagation();

    const target = event.currentTarget as SVGElement;
    this.selectComponents(d3_select<SVGElement, unknown>(target));

    if (this.onGraphAction !== undefined) {
      const nodeData = (target as any).__data__;
      const nodeType = nodeData?.attributes?.class || "node";
      const nodeKey = target.id || "";

      this.onGraphAction("click", event.clientX, event.clientY, nodeType, nodeKey);
    }
  }

  handleClickGraphEdge(event: MouseEvent) {
    event.preventDefault();
    event.stopPropagation();

    const target = event.currentTarget as SVGElement;
    const edge = d3_select<SVGElement, unknown>(target);
    this.selectComponents(edge);

    if (this.onGraphAction !== undefined) {
      const nodeData = (target as any).__data__;
      const nodeType = nodeData?.attributes?.class || "edge";
      const nodeKey = target.id || "";

      this.onGraphAction("click", event.clientX, event.clientY, nodeType, nodeKey);
    }
  }

  handleRightClickGraphElement(event: MouseEvent) {
    event.preventDefault();
    event.stopPropagation();
    const target = event.currentTarget as SVGElement;
    this.selectComponents(d3_select<SVGElement, unknown>(target));

    if (this.onGraphAction !== undefined) {
      const nodeData = (target as any).__data__;
      const nodeType = nodeData?.attributes?.class || "node";
      const nodeKey = target.id || "";

      this.onGraphAction("r-click", event.clientX, event.clientY, nodeType, nodeKey);
    }
  }

  selectComponents(components: Selection<SVGElement, unknown, null, undefined>) {
    if (this.selectedComponents !== components) {
      this.unSelectComponents();

      components.each(function () {
        const component = d3_select<SVGElement, unknown>(this);
        component.style("stroke-width", "3px").style("font-weight", "bold");
      });
      this.selectedComponents = components;
    }
  }

  unSelectComponents() {
    this.selectedComponents.each(function () {
      const component = d3_select<SVGElement, unknown>(this);
      component.style("stroke-width", null).style("font-weight", null);
    });
  }

  render() {
    return (
      <div
        ref={(div) => {
          if (div) {
            this.div = d3_select(div);
            // Prevent browser default zoom behavior
            div.style.touchAction = "none";
          }
        }}
        className={this.props.className}
        id={this.state.id}
        style={{ touchAction: "none", height: "100%" }}
      />
    );
  }
}

interface GraphvizProps {
  dot: string;
  style?: CSSProperties | undefined;
  onGraphAction?: OnGraphActionFn;
  registerZoomInHandler?: RegisterGraphEventHandler;
  registerZoomOutHandler?: RegisterGraphEventHandler;
  registerZoomResetHandler?: RegisterGraphEventHandler;
}

interface GraphvizState {
  fit: boolean;
  useWorker: boolean;
  isFullscreen: boolean;
  isHovered: boolean;
}

export class GraphvizComponent extends React.PureComponent<GraphvizProps, GraphvizState> {
  private containerRef = React.createRef<HTMLDivElement>();
  private fullscreenContainerRef = React.createRef<HTMLDivElement>();
  private fixIntervalId?: ReturnType<typeof setInterval>;
  private fixTimeoutId?: ReturnType<typeof setTimeout>;
  private keyDownHandler?: (e: KeyboardEvent) => void;
  private fullscreenChangeHandler?: () => void;

  constructor(props: GraphvizProps) {
    super(props);
    this.state = { fit: false, useWorker: false, isFullscreen: false, isHovered: false };
  }

  componentDidMount() {
    this.fixSVGDimensions();
    this.setupFullscreenHandlers();
  }

  componentDidUpdate() {
    this.fixSVGDimensions();
  }

  componentWillUnmount() {
    if (this.fixIntervalId) {
      clearInterval(this.fixIntervalId);
    }
    if (this.fixTimeoutId) {
      clearTimeout(this.fixTimeoutId);
    }
    this.cleanupFullscreenHandlers();
  }

  private fixSVGDimensions = () => {
    const container = this.containerRef.current;
    if (!container || !this.props.dot) return;

    const fixSVG = () => {
      const svg = container.querySelector("svg");
      if (!svg) return;

      // Remove fixed width/height attributes to let CSS and viewBox handle sizing
      // This allows the SVG to fill its parent container
      const svgWidth = parseFloat(svg.getAttribute("width") || "0");
      if (svgWidth > 100000 || svgWidth === 0) {
        // Remove fixed width/height to let viewBox handle it
        svg.removeAttribute("width");
        svg.removeAttribute("height");

        // Ensure viewBox is present
        const existingViewBox = svg.getAttribute("viewBox");
        if (!existingViewBox) {
          // Try to calculate reasonable dimensions from the SVG content
          try {
            const bbox = (svg as SVGElement & { getBBox?: () => DOMRect })?.getBBox?.();
            if (bbox) {
              svg.setAttribute("viewBox", `${bbox.x} ${bbox.y} ${bbox.width} ${bbox.height}`);
            }
          } catch {
            // getBBox might fail if SVG is not rendered yet, ignore
          }
        }
      } else {
        // For normal-sized SVGs, remove height attribute to allow CSS height: 100% to work
        // Keep width if it's reasonable, but remove height so it can expand
        svg.removeAttribute("height");
        // Also remove width to let CSS handle it, but preserve viewBox for aspect ratio
        const viewBox = svg.getAttribute("viewBox");
        if (viewBox) {
          svg.removeAttribute("width");
        }
      }
    };

    // Fix after a short delay to allow Graphviz to render
    if (this.fixTimeoutId) {
      clearTimeout(this.fixTimeoutId);
    }
    this.fixTimeoutId = setTimeout(fixSVG, 100);
    
    if (this.fixIntervalId) {
      clearInterval(this.fixIntervalId);
    }
    this.fixIntervalId = setInterval(fixSVG, 500); // Check periodically
  };

  zoomInHandler = () => {};
  zoomOutHandler = () => {};
  zoomResetHandler = () => {};

  registerZoomInButtonClick = (eventHandler: GraphvizEventHandler) => {
    this.zoomInHandler = eventHandler;
    // Call external handler if provided
    if (this.props.registerZoomInHandler) {
      this.props.registerZoomInHandler(eventHandler);
    }
  };

  registerZoomOutButtonClick = (eventHandler: GraphvizEventHandler) => {
    this.zoomOutHandler = eventHandler;
    // Call external handler if provided
    if (this.props.registerZoomOutHandler) {
      this.props.registerZoomOutHandler(eventHandler);
    }
  };

  registerZoomResetEventHandler = (eventHandler: GraphvizEventHandler) => {
    this.zoomResetHandler = eventHandler;
    // Call external handler if provided
    if (this.props.registerZoomResetHandler) {
      this.props.registerZoomResetHandler(eventHandler);
    }
  };

  private setupFullscreenHandlers = () => {
    // Handle ESC key to exit fullscreen
    this.keyDownHandler = (e: KeyboardEvent) => {
      if (e.key === "Escape" && this.state.isFullscreen) {
        this.exitFullscreen();
      }
    };

    // Handle fullscreen change events (user might exit via browser controls)
    this.fullscreenChangeHandler = () => {
      const container = this.fullscreenContainerRef.current;
      const isCurrentlyFullscreen = !!(
        (document.fullscreenElement === container) ||
        ((document as any).webkitFullscreenElement === container) ||
        ((document as any).mozFullScreenElement === container) ||
        ((document as any).msFullscreenElement === container)
      );

      // Sync state with actual fullscreen status
      if (isCurrentlyFullscreen !== this.state.isFullscreen) {
        this.setState({ isFullscreen: isCurrentlyFullscreen });
      }
    };

    document.addEventListener("keydown", this.keyDownHandler);
    document.addEventListener("fullscreenchange", this.fullscreenChangeHandler);
    document.addEventListener("webkitfullscreenchange", this.fullscreenChangeHandler);
    document.addEventListener("mozfullscreenchange", this.fullscreenChangeHandler);
    document.addEventListener("MSFullscreenChange", this.fullscreenChangeHandler);
  };

  private cleanupFullscreenHandlers = () => {
    if (this.keyDownHandler) {
      document.removeEventListener("keydown", this.keyDownHandler);
    }
    if (this.fullscreenChangeHandler) {
      document.removeEventListener("fullscreenchange", this.fullscreenChangeHandler);
      document.removeEventListener("webkitfullscreenchange", this.fullscreenChangeHandler);
      document.removeEventListener("mozfullscreenchange", this.fullscreenChangeHandler);
      document.removeEventListener("MSFullscreenChange", this.fullscreenChangeHandler);
    }
  };

  private enterFullscreen = async () => {
    const container = this.fullscreenContainerRef.current;
    if (!container) return;

    try {
      if (container.requestFullscreen) {
        await container.requestFullscreen();
      } else if ((container as any).webkitRequestFullscreen) {
        await (container as any).webkitRequestFullscreen();
      } else if ((container as any).mozRequestFullScreen) {
        await (container as any).mozRequestFullScreen();
      } else if ((container as any).msRequestFullscreen) {
        await (container as any).msRequestFullscreen();
      } else {
        return;
      }
      this.setState({ isFullscreen: true });
    } catch (error) {
      // Silently handle fullscreen errors
    }
  };

  private exitFullscreen = async () => {
    try {
      if (document.exitFullscreen) {
        await document.exitFullscreen();
      } else if ((document as any).webkitExitFullscreen) {
        await (document as any).webkitExitFullscreen();
      } else if ((document as any).mozCancelFullScreen) {
        await (document as any).mozCancelFullScreen();
      } else if ((document as any).msExitFullscreen) {
        await (document as any).msExitFullscreen();
      }
      this.setState({ isFullscreen: false });
    } catch (error) {
      // Silently handle fullscreen errors
    }
  };

  private handleMouseEnter = () => {
    this.setState({ isHovered: true });
  };

  private handleMouseLeave = () => {
    this.setState({ isHovered: false });
  };

  render() {
    const containerStyle: CSSProperties = {
      position: "relative",
      width: "100%",
      height: "100%",
      ...this.props.style,
    };

    const fullscreenContainerStyle: CSSProperties = this.state.isFullscreen
      ? {
          position: "fixed",
          top: 0,
          left: 0,
          width: "100vw",
          height: "100vh",
          zIndex: 9999,
          backgroundColor: "var(--background)",
        }
      : containerStyle;
    
    return (
      <div 
        ref={this.fullscreenContainerRef} 
        style={fullscreenContainerStyle}
        onMouseEnter={this.handleMouseEnter}
        onMouseLeave={this.handleMouseLeave}
      >
        {/* Scrollable container */}
        <div
          className="w-full h-full overflow-auto"
          style={{
            scrollBehavior: "smooth",
            position: "relative",
            overflowX: "auto",
            overflowY: "auto",
            ...(this.state.isFullscreen ? { height: "100vh", width: "100vw" } : {}),
          }}
        >
          {/* Inner wrapper divs to enable horizontal scrolling */}
          <div
            style={{
              minWidth: "100%",
              height: "100%",
              position: "relative",
              display: "inline-block",
            }}
          >
            <div
              style={{
                minWidth: "100%",
                height: "100%",
                position: "relative",
                display: "inline-block",
              }}
            >
              {/* SVG styling */}
              <style>{`
                [data-graphviz-container] svg {
                  height: 100% !important;
                  width: 100% !important;
                  display: block !important;
                }
              `}</style>
              <div 
                ref={this.containerRef}
                data-graphviz-container 
                style={{ display: "inline-block", minWidth: "100%", height: "100%" }}
              >
                <GraphvizComponentImpl
                  dot={this.props.dot}
                  options={this.state}
                  onGraphAction={this.props.onGraphAction}
                  registerZoomInHandler={this.registerZoomInButtonClick}
                  registerZoomOutHandler={this.registerZoomOutButtonClick}
                  registerZoomResetHandler={this.registerZoomResetEventHandler}
                  className="dark"
                />
              </div>
            </div>
          </div>
        </div>
        {/* Floating zoom buttons */}
        <div 
          className={`absolute top-2 right-2 flex flex-row gap-2 z-10 transition-opacity duration-200 ${
            this.state.isHovered ? "opacity-100" : "opacity-0"
          }`}
        >
          <Button
            variant="outline"
            size="icon"
            onClick={() => {
              if (this.zoomInHandler) {
                this.zoomInHandler();
              }
            }}
            className="h-8 w-8 bg-background/90 backdrop-blur-sm shadow-md hover:bg-background"
            title="Zoom In"
          >
            <ZoomIn className="h-4 w-4" />
          </Button>
          <Button
            variant="outline"
            size="icon"
            onClick={() => {
              if (this.zoomOutHandler) {
                this.zoomOutHandler();
              }
            }}
            className="h-8 w-8 bg-background/90 backdrop-blur-sm shadow-md hover:bg-background"
            title="Zoom Out"
          >
            <ZoomOut className="h-4 w-4" />
          </Button>
          {!this.state.isFullscreen ? (
            <Button
              variant="outline"
              size="icon"
              onClick={this.enterFullscreen}
              className="h-8 w-8 bg-background/90 backdrop-blur-sm shadow-md hover:bg-background"
              title="Enter Fullscreen"
            >
              <Maximize className="h-4 w-4" />
            </Button>
          ) : (
            <Button
              variant="outline"
              size="icon"
              onClick={this.exitFullscreen}
              className="h-8 w-8 bg-background/90 backdrop-blur-sm shadow-md hover:bg-background"
              title="Exit Fullscreen (ESC)"
            >
              <Minimize2 className="h-4 w-4" />
            </Button>
          )}
        </div>
      </div>
    );
  }
}

