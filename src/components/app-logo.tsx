import Image from "next/image";

interface AppLogoProps {
  width?: number;
  height?: number;
  className?: string;
}

export function AppLogo({ width = 64, height = 64, className }: AppLogoProps) {
  return (
    <Image
      src="/logo.png"
      alt="Data Storia"
      width={width}
      height={height}
      priority
      className={className}
    />
  );
}
