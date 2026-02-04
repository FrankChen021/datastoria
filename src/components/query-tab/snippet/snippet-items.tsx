import { SnippetItem } from "./snippet-item";
import type { UISnippet } from "./ui-snippet";

interface SnippetItemsProps {
  snippets: UISnippet[];
  title: string;
}

export function SnippetItems({ snippets, title }: SnippetItemsProps) {
  if (snippets.length === 0) return null;

  return (
    <div>
      <div className="text-xs font-semibold text-muted-foreground px-2 py-1 tracking-wider">
        {title}
      </div>
      <div className="space-y-0.5">
        {snippets.map((s) => (
          <SnippetItem key={s.snippet.caption} uiSnippet={s} />
        ))}
      </div>
    </div>
  );
}
