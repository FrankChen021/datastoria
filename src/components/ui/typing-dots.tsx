import { cn } from "@/lib/utils";

interface TypingDotsProps {
  className?: string;
}

/**
 * Animated typing indicator with 3 dots that fade in sequentially
 */
export function TypingDots({ className }: TypingDotsProps) {
  return (
    <div className={cn("inline-flex items-center gap-1", className)}>
      <span
        className="w-0.5 h-0.5 bg-current rounded-full animate-pulse"
        style={{
          animationDelay: "0ms",
          animationDuration: "1.4s",
        }}
      />
      <span
        className="w-0.5 h-0.5 bg-current rounded-full animate-pulse"
        style={{
          animationDelay: "200ms",
          animationDuration: "1.4s",
        }}
      />
      <span
        className="w-0.5 h-0.5 bg-current rounded-full animate-pulse"
        style={{
          animationDelay: "400ms",
          animationDuration: "1.4s",
        }}
      />
    </div>
  );
}
