import { cn } from "@/lib/utils";
import LinearProgress from "@mui/material/LinearProgress";
import React, { useEffect, useState } from "react";

interface FloatingProgressBarProps {
  className?: string;
  show: boolean;
}

const FloatingProgressBar: React.FC<FloatingProgressBarProps> = ({ show, className }) => {
  const [isVisible, setIsVisible] = useState<boolean>(show);

  useEffect(() => {
    let timeoutId: ReturnType<typeof setTimeout>;
    if (!show) {
      // Set some delay for better user experience
      timeoutId = setTimeout(() => {
        setIsVisible(false);
      }, 500);
    } else {
      setIsVisible(true);
    }
    return () => clearTimeout(timeoutId);
  }, [show]);

  if (!isVisible) {
    return null;
  }

  return (
    <div className={cn("absolute top-0 left-0 w-full z-50 rounded-sm", className)}>
      <LinearProgress color="primary" />
    </div>
  );
};

export default FloatingProgressBar;
