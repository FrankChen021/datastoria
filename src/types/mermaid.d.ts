declare module "mermaid" {
  interface MermaidConfig {
    startOnLoad?: boolean;
    securityLevel?: "strict" | "loose" | "antiscript" | "sandbox";
    theme?: string;
  }

  interface MermaidRenderResult {
    svg: string;
    bindFunctions?: (element: Element) => void;
  }

  interface Mermaid {
    initialize(config: MermaidConfig): void;
    render(id: string, text: string): Promise<MermaidRenderResult>;
  }

  const mermaid: Mermaid;
  export default mermaid;
}
