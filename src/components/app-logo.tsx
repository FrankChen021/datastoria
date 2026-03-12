import { BasePath } from "@/lib/base-path";
import Image from "next/image";

interface AppLogoProps {
  width?: number;
  height?: number;
  className?: string;
}

export function AppLogo({ width = 64, height = 64, className }: AppLogoProps) {
  return (
    <Image
      src={BasePath.getURL("/logo.png")}
      alt="DataStoria"
      width={width}
      height={height}
      priority
      className={className}
    />
  );
}
