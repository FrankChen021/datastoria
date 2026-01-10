"use client";

import { Input } from "@/components/ui/input";
import { Search, X } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { useDebouncedCallback } from "use-debounce";

interface DebouncedSearchInputProps {
  defaultValue: string;
  timeout?: number;
  placeholder: string;
  inputClassName?: string;
  autoFocus?: boolean;
  onSearch: (value: string) => void;
}

export default function DebouncedSearchInput({
  defaultValue,
  timeout,
  placeholder,
  inputClassName,
  autoFocus = false,
  onSearch,
}: DebouncedSearchInputProps) {
  const [showClear, setShowClear] = useState<boolean>(() => defaultValue.length > 0);
  const inputRef = useRef<HTMLInputElement>(null);

  // Handle auto-focus when component is first rendered
  useEffect(() => {
    if (autoFocus && inputRef.current) {
      // Use a small delay to ensure the component is fully rendered
      const timer = setTimeout(() => {
        inputRef.current?.focus();
      }, 100);
      return () => clearTimeout(timer);
    }
  }, [autoFocus]);

  const debounced = useDebouncedCallback(
    (inputText: string) => {
      onSearch(inputText);
    },
    timeout ? timeout : 300,
    {
      leading: false,
      trailing: true,
      maxWait: 1000,
    }
  );

  const onChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const shouldShowClear = e.target.value.length > 0;
      if (shouldShowClear !== showClear) {
        setShowClear(shouldShowClear);
      }

      debounced(e.target.value);
    },
    [showClear, debounced]
  );

  const onClear = useCallback(() => {
    if (inputRef.current) {
      inputRef.current.value = "";
      inputRef.current.focus();
    }
    setShowClear(false);
    debounced("");
  }, [debounced]);

  return (
    <div className="relative flex">
      <Search className="h-4 w-4 text-muted-foreground absolute left-2 top-1/2 transform -translate-y-1/2" />
      <Input
        ref={inputRef}
        placeholder={placeholder}
        className={`pl-8 pr-8 ${inputClassName || ""}`}
        defaultValue={defaultValue}
        onChange={onChange}
      />

      {showClear && (
        <X
          className="h-4 w-4 text-muted-foreground absolute right-2 top-1/2 transform -translate-y-1/2 cursor-pointer hover:text-foreground"
          onClick={onClear}
        />
      )}
    </div>
  );
}
