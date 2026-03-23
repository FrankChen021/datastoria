"use client";

import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Textarea } from "@/components/ui/textarea";
import type { AppUIMessage, ToolPart } from "@/lib/ai/chat-types";
import {
  CLIENT_TOOL_NAMES,
  type AskUserQuestionInput,
  type AskUserQuestionOutput,
} from "@/lib/ai/tools/client/client-tools";
import { cn } from "@/lib/utils";
import { CircleAlert, HelpCircle, Loader2 } from "lucide-react";
import { memo, useMemo, useState } from "react";
import { useChatAction } from "../chat-action-context";

function previewValue(value: string) {
  const trimmed = value.trim();
  if (trimmed.length <= 120) return trimmed;
  return `${trimmed.slice(0, 117)}...`;
}

export const MessageToolAskUserQuestion = memo(function MessageToolAskUserQuestion({
  part,
  isRunning = true,
}: {
  part: AppUIMessage["parts"][0];
  isRunning?: boolean;
}) {
  const toolPart = part as ToolPart;
  const toolCallId =
    (toolPart as { toolCallId?: string }).toolCallId ||
    (toolPart as { id?: string }).id ||
    (toolPart as unknown as { toolCall?: { toolCallId?: string } }).toolCall?.toolCallId ||
    "";
  const input = toolPart.input as AskUserQuestionInput | undefined;
  const output = toolPart.output as AskUserQuestionOutput | undefined;
  const { onToolOutput } = useChatAction();
  const [selectedOptionId, setSelectedOptionId] = useState("");
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [hasSubmitted, setHasSubmitted] = useState(false);
  const [draftValue, setDraftValue] = useState("");
  const questionKey = toolCallId || "ask-user-question";

  const question = input?.questions?.[0];
  const singleOption = question?.options.length === 1 ? question.options[0] : undefined;
  const selectedOption = useMemo(
    () =>
      singleOption
        ? singleOption
        : question?.options.find((option) => option.id === selectedOptionId),
    [question?.options, selectedOptionId, singleOption]
  );

  const submitAnswer = async (
    answer: AskUserQuestionOutput
  ): Promise<{ success: true } | { success: false; error: string }> => {
    if (!toolCallId) {
      return { success: false, error: "Question is missing a tool call id." };
    }
    if (isSubmitting || hasSubmitted) {
      return { success: false, error: "Answer submission is already in progress." };
    }
    setSubmitError(null);
    setIsSubmitting(true);
    try {
      await onToolOutput({
        tool: CLIENT_TOOL_NAMES.ASK_USER_QUESTION,
        toolCallId,
        output: answer,
      });
      setHasSubmitted(true);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to submit answer.";
      setSubmitError(message);
      setIsSubmitting(false);
      return { success: false, error: message };
    }
    setIsSubmitting(false);
    return { success: true };
  };

  const handleOptionChange = (optionId: string) => {
    if (output || isSubmitting || hasSubmitted) return;
    const option = question?.options.find((item) => item.id === optionId);
    if (!option) return;
    setSubmitError(null);
    setSelectedOptionId(option.id);
    setDraftValue("");
  };

  const handleSubmitSelectedOption = async () => {
    if (!selectedOption || !question) return;

    const normalizedValue = draftValue.trim();
    if (!normalizedValue) {
      setSubmitError("Please enter a value before submitting.");
      return;
    }

    const result = await submitAnswer({
      optionId: selectedOption.id,
      label: selectedOption.label,
      type: selectedOption.type,
      value: normalizedValue,
    });

    if (!result.success) {
      setSubmitError(result.error);
    }
  };

  if (!question) {
    if (isRunning) {
      return (
        <div className="flex items-start gap-2">
          <Loader2 className="mt-0.5 h-4 w-4 animate-spin text-muted-foreground" />
          <div className="text-sm text-muted-foreground">Preparing question...</div>
        </div>
      );
    }

    return (
      <div className="mt-2 rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm">
        <div className="flex items-center gap-2 font-medium text-destructive">
          <CircleAlert className="h-4 w-4" />
          Ask User Question
        </div>
        <div className="mt-2 text-muted-foreground">Question unavailable.</div>
      </div>
    );
  }

  return (
    <div className="py-1">
      <div className="flex items-start items-center gap-2">
        {output ? (
          <HelpCircle className="mt-0.5 h-3 w-3" />
        ) : isSubmitting ? (
          <Loader2 className="mt-0.5 h-3 w-3 animate-spin" />
        ) : (
          <HelpCircle className="mt-0.5 h-3 w-3 text-muted-foreground" />
        )}
        <div className="text-xs font-medium text-foreground">{question.header}</div>
      </div>
      <div className={cn("mt-1 space-y-2", output && "pl-5")}>
        {output ? (
          <div className="rounded-md border border-border/50 bg-background/70 px-3 py-2 text-sm">
            <div className="whitespace-pre-wrap break-all font-mono text-xs text-muted-foreground">
              {previewValue(output.value)}
            </div>
          </div>
        ) : (
          <>
            {!singleOption && (
              <RadioGroup
                className="flex flex-wrap gap-2"
                value={selectedOptionId}
                onValueChange={handleOptionChange}
                disabled={isSubmitting || hasSubmitted}
              >
                {question.options.map((option) => {
                  const itemId = `ask-user-question-${questionKey}-${option.id}`;
                  return (
                    <div
                      key={option.id}
                      className={cn(
                        "inline-flex items-center gap-2 bg-background/50 pl-0 pr-3 text-sm transition-colors hover:bg-background/80",
                        selectedOptionId === option.id && "bg-background",
                        (isSubmitting || hasSubmitted) && "cursor-not-allowed opacity-60"
                      )}
                    >
                      <RadioGroupItem
                        id={itemId}
                        value={option.id}
                        className="data-[state=checked]:border-transparent h-3 w-3"
                      />
                      <Label htmlFor={itemId} className="cursor-pointer text-xs font-normal">
                        {option.label}
                      </Label>
                    </div>
                  );
                })}
              </RadioGroup>
            )}

            {selectedOption && (
              <>
                {selectedOption.type === "select" ? (
                  <div className="flex flex-wrap gap-2">
                    {selectedOption.choices.map((choice) => {
                      const isSelected = draftValue === choice;
                      return (
                        <Button
                          key={choice}
                          type="button"
                          size="sm"
                          variant={isSelected ? "secondary" : "outline"}
                          className={cn("text-xs", isSelected && "ring-1 ring-ring")}
                          onClick={() => {
                            setSubmitError(null);
                            setDraftValue(choice);
                          }}
                          disabled={isSubmitting || hasSubmitted}
                        >
                          {choice}
                        </Button>
                      );
                    })}
                  </div>
                ) : (
                  <Textarea
                    className="min-h-[150px] font-mono text-xs focus-visible:ring-0 focus-visible:ring-offset-0 focus-visible:border-input"
                    placeholder={selectedOption.label}
                    value={draftValue}
                    onChange={(e) => {
                      setSubmitError(null);
                      setDraftValue(e.target.value);
                    }}
                    disabled={isSubmitting || hasSubmitted}
                  />
                )}

                <div className="flex items-center gap-2">
                  <Button
                    type="button"
                    size="sm"
                    className="h-8"
                    onClick={() => void handleSubmitSelectedOption()}
                    disabled={isSubmitting || hasSubmitted}
                  >
                    {isSubmitting || hasSubmitted ? (
                      <>
                        <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
                        Submitting
                      </>
                    ) : (
                      "Submit"
                    )}
                  </Button>
                  {!singleOption && (
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      className="h-8"
                      onClick={() => {
                        setSelectedOptionId("");
                        setDraftValue("");
                        setSubmitError(null);
                      }}
                      disabled={isSubmitting || hasSubmitted}
                    >
                      Cancel
                    </Button>
                  )}
                </div>
              </>
            )}
          </>
        )}

        {submitError && (
          <div className="text-xs text-destructive" role="alert">
            {submitError}
          </div>
        )}
      </div>
    </div>
  );
});
