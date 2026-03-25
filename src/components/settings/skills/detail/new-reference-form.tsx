"use client";

import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { FieldDescription } from "@/components/ui/field-description";
import { Input } from "@/components/ui/input";
import { useEffect, useState, type MutableRefObject } from "react";

export interface NewReferenceFormController {
  getFileName: () => string;
  setError: (value: string | null) => void;
}

export function NewReferenceForm({
  controllerRef,
  folderPath,
}: {
  controllerRef: MutableRefObject<NewReferenceFormController | null>;
  folderPath: string;
}) {
  const [fileName, setFileName] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    controllerRef.current = {
      getFileName: () => fileName,
      setError,
    };
    return () => {
      controllerRef.current = null;
    };
  }, [controllerRef, fileName]);

  return (
    <FieldGroup className="pb-8">
      <Field>
        <FieldLabel htmlFor="new-reference-path">File name</FieldLabel>
        <Input
          id="new-reference-path"
          value={fileName}
          onChange={(event) => {
            setFileName(event.target.value);
            if (error) {
              setError(null);
            }
          }}
          placeholder="115.md"
        />
        {error ? <FieldDescription className="text-destructive">{error}</FieldDescription> : null}
      </Field>
    </FieldGroup>
  );
}
