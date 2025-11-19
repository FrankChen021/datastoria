/**
 * Tree Search Algorithm
 *
 * This module implements a position-based tree search algorithm that supports:
 * - Exact path matching for non-terminal segments
 * - Fuzzy (substring) matching for the last segment
 * - Trailing dot expansion (empty last segment expands matched parent)
 *
 * ## Algorithm Overview
 *
 * The search query is split by a separator (default: ".") into segments.
 * Only leading empty strings are filtered out; trailing empty strings are preserved
 * to indicate trailing dot expansion.
 *
 * ### Segment Splitting Examples:
 * - "text" → ["text"]
 * - "system.pos" → ["system", "pos"]
 * - "system.pos." → ["system", "pos", ""] (trailing empty indicates expansion)
 *
 * ### Search Process:
 *
 * The `searchNodes` function processes nodes recursively with a position parameter
 * indicating which segment to match:
 *
 * 1. **Non-terminal segments** (position < length - 1):
 *    - Require exact match (case-insensitive)
 *    - If current node matches exactly, recurse to children with position + 1
 *    - If current node doesn't match, return null (no children search)
 *    - Only include nodes that have matching children (enforce complete path)
 *    - Example: For "system.metric", position 0 requires exact match of "system"
 *
 * 2. **Last segment** (position === length - 1):
 *    - If empty string (trailing dot): The previous segment was matched exactly, expand to show all children
 *      - Example: "system.query." → matches "system" AND "query" exactly, then expands "query" to show all children
 *      - The trailing dot converts the last non-empty segment to exact match mode
 *    - If not empty: Perform fuzzy (substring) search recursively on ALL descendants
 *      - Searches the entire subtree below the matched path
 *      - Example: "system.query" → matches "system" exactly, then fuzzy matches "query" in all descendants
 *      - This will match: system->query, system->query_log, system->metric->query, etc.
 *
 * ### Examples:
 *
 * **Example 1: "system"**
 * - Segments: ["system"]
 * - Position 0: Last segment, not empty → fuzzy search for "system"
 * - Result: Matches any node containing "system" as substring
 *
 * **Example 2: "system.pos"**
 * - Segments: ["system", "pos"]
 * - Position 0: Exact match "system" → recurse with position 1
 * - Position 1: Last segment, not empty → fuzzy search for "pos" in children
 * - Result: Matches "system" exactly, then fuzzy matches "pos" in its children
 *
 * **Example 3: "system.pos."**
 * - Segments: ["system", "pos", ""]
 * - Position 0: Exact match "system" → recurse with position 1
 * - Position 1: Exact match "pos" → recurse with position 2
 * - Position 2: Last segment is empty → expand matched parent
 * - Result: Matches "system" and "pos" exactly, then expands to show all children of "pos"
 *
 * **Example 4: "system.metric"**
 * - Segments: ["system", "metric"]
 * - Position 0: Exact match "system" → recurse with position 1
 * - Position 1: Last segment, not empty → fuzzy search for "metric" in children
 * - Result: Matches "system" exactly, then fuzzy matches "metric" in "metric_log" and "metrics"
 */

import type { TreeDataItem } from "@/components/ui/tree";
import React from "react";
import { TextHighlighter } from "../lib/text-highlighter";

interface SearchContext {
  /**
   * The segments of the search query.
   * For example, if the search query is "system.query_log", the segments are ["system", "query_log"].
   */
  segments: string[];
  hasTrailingDot: boolean;
  highlight: (text: string, start: number, end: number) => React.ReactNode;
  /**
   * Function to perform substring matching (case-insensitive).
   * Returns match information including start and end indices.
   */
  match: (node: TreeDataItem, pattern: string) => { matches: boolean; start: number; end: number };
}

function searchNodes(
  node: TreeDataItem,
  context: SearchContext,
  position: number = 0,
  currentPath: string[] = []
): TreeDataItem | null {
  const { segments, highlight } = context;
  const isFolderNode = node.type ? node.type === "folder" : node.children !== undefined && node.children.length > 0;
  const labelText = String(node.labelContent);

  // Check if we're at the last segment
  const isLastSegment = position === segments.length - 1;
  const currentSegment = segments[position];

  let matches = false;
  let highlightedLabel: React.ReactNode = labelText;

  // Non-terminal segment: require exact match
  if (!isLastSegment) {
    // Check if current node matches the segment exactly (case-insensitive)
    const exactMatch = labelText.toLowerCase() === currentSegment.toLowerCase();

    if (exactMatch) {
      matches = true;
      highlightedLabel = highlight(labelText, 0, labelText.length);

      // Check if next segment is empty AND it's the last segment (trailing dot case)
      const nextSegment = segments[position + 1];
      const isNextSegmentEmpty = nextSegment === "";
      const isNextSegmentLast = position + 1 === segments.length - 1;

      if (isNextSegmentEmpty && isNextSegmentLast) {
        // Trailing dot: show all children without processing them
        // Only the current node should be highlighted and expanded
        if (node.children) {
          const unprocessedChildren = node.children.map((child) => ({
            ...child,
            _expanded: false, // Children should not be expanded
          }));

          return {
            ...node,
            labelContent: highlightedLabel,
            _originalLabel: labelText,
            children: unprocessedChildren,
            _expanded: true, // Only the matched parent is expanded
          } as TreeDataItem;
        }

        return {
          ...node,
          labelContent: highlightedLabel,
          _originalLabel: labelText,
          children: node.children ? [] : undefined,
          _expanded: true,
        } as TreeDataItem;
      }

      // Recurse to children with next position
      const children: TreeDataItem[] = [];
      if (node.children) {
        const childCurrentPath = [...currentPath, labelText];
        for (const child of node.children) {
          const childResult = searchNodes(child, context, position + 1, childCurrentPath);
          if (childResult) {
            children.push(childResult);
          }
        }
      }

      // Include node only if it has matching children
      if (children.length > 0) {
        return {
          ...node,
          labelContent: highlightedLabel,
          _originalLabel: labelText,
          children,
          _expanded: true, // Expand nodes that match non-terminal segments
        } as TreeDataItem;
      }

      // Node matches but has no matching children - return null for non-terminal segments
      // This ensures that paths like "system.nonexistent." don't match
      return null;
    }

    // Current node doesn't match at non-terminal position
    // For exact path matching, we should NOT search children
    // If the path segment doesn't match, this branch is invalid
    return null;
  }

  // Last segment: handle fuzzy search or expansion
  const isLastSegmentEmpty = currentSegment === "";

  if (isLastSegmentEmpty) {
    // Trailing dot: expand matched parent node (show all children)
    // The parent should have matched all previous segments exactly
    // Only the matched parent should be highlighted and expanded
    // Children should be shown but NOT highlighted or expanded
    if (isFolderNode && node.children) {
      matches = true;
      highlightedLabel = highlight(labelText, 0, labelText.length);

      // Include all children without searching them, ensuring they are not highlighted or expanded
      const unprocessedChildren = node.children.map((child) => ({
        ...child,
        _expanded: false, // Children should not be expanded
      }));

      return {
        ...node,
        labelContent: highlightedLabel,
        _originalLabel: labelText,
        children: unprocessedChildren,
        _expanded: true, // Only the matched parent is expanded
      } as TreeDataItem;
    }

    // For leaf nodes with trailing dot, check if parent path matches
    return {
      ...node,
      _expanded: false,
    };
  }

  // Last segment is not empty: perform fuzzy (substring) search recursively
  const fuzzyMatch = context.match(node, currentSegment);

  if (fuzzyMatch.matches) {
    matches = true;
    highlightedLabel = highlight(labelText, fuzzyMatch.start, fuzzyMatch.end);
  }

  // For last segment fuzzy matching, recursively search ALL descendants
  // This allows matching deep paths like system -> metric -> query for "system.query"
  const children: TreeDataItem[] = [];
  if (node.children) {
    const childCurrentPath = [...currentPath, labelText];
    for (const child of node.children) {
      // Recursively search children with same position (fuzzy search continues)
      const childResult = searchNodes(child, context, position, childCurrentPath);
      if (childResult) {
        children.push(childResult);
      }
    }
  }

  // Include node if it matches or has matching children
  if (matches || children.length > 0) {
    return {
      ...node,
      _expanded: matches || children.length > 0,
      labelContent: matches ? highlightedLabel : labelText,
      _originalLabel: matches ? labelText : undefined,
      children: children.length > 0 ? children : undefined,
    } as TreeDataItem;
  }

  return null;
}

// Search nodes but skip matching nodes above the start level
// This ensures parent nodes (above startLevel) are included for structure but not matched/highlighted
function searchTreeFromGivenLevel(
  nodes: TreeDataItem[],
  context: SearchContext,
  startLevel: number,
  currentLevel: number = 0
): TreeDataItem[] {
  // If we're above the start level, don't search nodes at this level
  // Just include them if they have matching children at deeper levels
  if (currentLevel < startLevel) {
    const result: TreeDataItem[] = [];
    for (const node of nodes) {
      if (node.children) {
        const matchedChildren = searchTreeFromGivenLevel(node.children, context, startLevel, currentLevel + 1);
        if (matchedChildren.length > 0) {
          // Although we search from given level, we only show parent nodes when there's match
          // So that we can show some text to indicate no match found
          result.push({
            ...node,
            children: matchedChildren,
          });
        }
      }
    }
    return result;
  }

  // We're at or below the start level - search all nodes normally
  const result: TreeDataItem[] = [];
  for (const node of nodes) {
    const nodeResult = searchNodes(node, context, 0, []);
    if (nodeResult) {
      result.push(nodeResult);
    }
  }
  return result;
}

// Search tree nodes by given input following the PRD rules.
export function searchTree(
  tree: TreeDataItem[] | undefined,
  search: string,
  options?: {
    pathSeparator?: string;
    highlighter?: (text: string, start: number, end: number) => React.ReactNode;
    startLevel?: number; // Level to start searching from (0 = root, 1 = children of root, etc.)
    match?: (node: TreeDataItem, pattern: string) => { matches: boolean; start: number; end: number };
  }
): TreeDataItem[] {
  if (search === "") {
    return tree ?? [];
  }
  if (tree === undefined) {
    return [];
  }

  // Parse input segments: only skip leading empty strings, preserve trailing empty for expansion
  const pathSeparator = options?.pathSeparator ?? ".";
  const startLevel = options?.startLevel ?? 0;
  const highlight =
    options?.highlighter ??
    ((text: string, start: number, end: number) => TextHighlighter.highlight2(text, start, end, "text-yellow-500"));

  // Default substringMatch implementation (case-sensitive)
  const substringMatch =
    options?.match ??
    ((node: TreeDataItem, pattern: string) => {
      const index = node.search.indexOf(pattern);

      return {
        matches: index >= 0,
        start: index,
        end: index + pattern.length,
      };
    });

  // Split by separator: skip only leading empty strings, preserve all others
  const rawSegments = search.split(pathSeparator);
  const segments: string[] = [];
  
  // Skip leading empty strings, but preserve all middle and trailing empty strings
  let foundFirstNonEmpty = false;
  for (const segment of rawSegments) {
    if (segment.trim() !== "") {
      foundFirstNonEmpty = true;
      segments.push(segment);
    } else if (foundFirstNonEmpty) {
      // After finding first non-empty, preserve ALL empty strings (middle and trailing)
      segments.push("");
    }
    // Skip only leading empty strings
  }

  const hasTrailingDot = search.endsWith(pathSeparator);

  if (segments.length === 0) {
    return tree;
  }

  const context: SearchContext = {
    segments,
    hasTrailingDot,
    highlight,
    match: substringMatch,
  };

  // Use searchTreeFromGivenLevel for all cases - it handles startLevel === 0 correctly
  // (when currentLevel < startLevel is false, it searches normally)
  return searchTreeFromGivenLevel(tree, context, startLevel);
}

