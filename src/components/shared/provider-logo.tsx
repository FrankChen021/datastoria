import { PROVIDERS } from "@/lib/ai/llm/llm-provider-factory";
import { BasePath } from "@/lib/base-path";
import { cn } from "@/lib/utils";

export function getProviderLogoUrl(provider: string): string | undefined {
  const logo = PROVIDERS[provider]?.logo;
  return logo ? BasePath.getURL(`/provider-logos/${logo}`) : undefined;
}

export function ProviderLogo({ provider, className }: { provider: string; className?: string }) {
  const url = getProviderLogoUrl(provider);

  if (!url) {
    return null;
  }

  return (
    <span
      aria-hidden="true"
      className={cn("inline-block shrink-0 bg-current", className ?? "h-4 w-4")}
      style={{
        mask: `url("${url}") center / contain no-repeat`,
        WebkitMask: `url("${url}") center / contain no-repeat`,
      }}
    />
  );
}
