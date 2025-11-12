import type { TreeDataItem } from "@/components/ui/tree";
import React from "react";
import { TextHighlighter } from "../lib/text-highlighter";

export function substringMatch(text: string, pattern: string): { matches: boolean; start: number; end: number } {
  const textLower = text.toLowerCase();
  const patternLower = pattern.toLowerCase();
  const index = textLower.indexOf(patternLower);

  return {
    matches: index >= 0,
    start: index,
    end: index + pattern.length,
  };
}

// Build tree structure from flat dotted item list (e.g., class names)
export function buildTree(dottedItemList: string[]): TreeDataItem[] {
  const tree: TreeDataItem[] = [];
  const packageMap = new Map<string, TreeDataItem>();

  dottedItemList.forEach((itemName: string) => {
    const parts = itemName.split(".");
    let currentPath = "";

    // Create package nodes
    for (let i = 0; i < parts.length - 1; i++) {
      const part = parts[i];
      const parentPath = currentPath;
      currentPath = currentPath ? `${currentPath}.${part}` : part;

      if (!packageMap.has(currentPath)) {
        const packageNode: TreeDataItem = {
          id: currentPath,
          text: currentPath,
          displayText: part,
          search: part.toLowerCase(),
          children: [],
          type: "folder",
        };

        packageMap.set(currentPath, packageNode);

        if (parentPath) {
          const parentNode = packageMap.get(parentPath);
          if (parentNode && parentNode.children) {
            parentNode.children.push(packageNode);
          }
        } else {
          tree.push(packageNode);
        }
      }
    }

    // Create class/item node
    const simpleItemName = parts[parts.length - 1];
    const itemNode: TreeDataItem = {
      id: itemName,
      text: itemName,
      displayText: simpleItemName,
      search: simpleItemName.toLowerCase(),
      type: "leaf",
    };

    // Add item to its package
    const packagePath = parts.slice(0, -1).join(".");
    if (packagePath) {
      const packageNode = packageMap.get(packagePath);
      if (packageNode && packageNode.children) {
        packageNode.children.push(itemNode);
      }
    } else {
      // Item in default package
      tree.push(itemNode);
    }
  });

  return tree;
}

// Search tree nodes by given input following the PRD rules.
export function searchTree(
  tree: TreeDataItem[] | undefined,
  search: string,
  options?: {
    pathSeparator?: string;
    highlighter?: (text: string, start: number, end: number) => React.ReactNode;
    startLevel?: number; // Level to start searching from (0 = root, 1 = children of root, etc.)
  }
): TreeDataItem[] {
  if (search === "") {
    return tree ?? [];
  }
  if (tree === undefined) {
    return [];
  }

  // Parse input segments, filtering out empty ones
  const pathSeparator = options?.pathSeparator ?? ".";
  const startLevel = options?.startLevel ?? 0;
  const highlight =
    options?.highlighter ??
    ((text: string, start: number, end: number) => TextHighlighter.highlight2(text, start, end, "text-yellow-500"));
  const segments = search.split(pathSeparator).filter((segment) => segment.trim() !== "");
  const hasTrailingDot = search.endsWith(pathSeparator);

  if (segments.length === 0) {
    return tree;
  }

  function matchesPath(
    nodePath: string[],
    segments: string[],
    requireCompleteMatch: boolean = false
  ): {
    matches: boolean;
    matchedSegments: Array<{ segmentIndex: number; nodeIndex: number; matchedIndices: number[] }>;
  } {
    const matchedSegments: Array<{ segmentIndex: number; nodeIndex: number; matchedIndices: number[] }> = [];

    // Find consecutive matching starting from any position in nodePath
    for (let startIndex = 0; startIndex <= nodePath.length - segments.length; startIndex++) {
      let allMatch = true;
      const tempMatchedSegments: Array<{ segmentIndex: number; nodeIndex: number; matchedIndices: number[] }> = [];

      for (let i = 0; i < segments.length; i++) {
        const segment = segments[i];
        const nodePathPart = nodePath[startIndex + i];

        let matches = false;
        const matchedIndices: number[] = [];

        if (requireCompleteMatch) {
          // For complete matching (e.g., trailing dot), the segment must exactly match the nodePathPart
          if (nodePathPart.toLowerCase() === segment.toLowerCase()) {
            matches = true;
            // All indices match
            for (let j = 0; j < nodePathPart.length; j++) {
              matchedIndices.push(j);
            }
          }
        } else {
          // Substring matching (default behavior)
          const substringResult = substringMatch(nodePathPart, segment);
          if (substringResult.matches) {
            matches = true;
            for (let j = substringResult.start; j < substringResult.end; j++) {
              matchedIndices.push(j);
            }
          }
        }

        if (matches) {
          tempMatchedSegments.push({
            segmentIndex: i,
            nodeIndex: startIndex + i,
            matchedIndices,
          });
        } else {
          allMatch = false;
          break;
        }
      }

      if (allMatch) {
        matchedSegments.push(...tempMatchedSegments);
        return {
          matches: true,
          matchedSegments,
        };
      }
    }

    return {
      matches: false,
      matchedSegments: [],
    };
  }

  function getNodePath(node: TreeDataItem, currentPath: string[] = []): string[] {
    // Build the full path from currentPath + current node
    // If node.text contains the separator, it might already be a path, but typically it's just the node name
    const nodeName = String(node.displayText || node.text);
    // When startLevel > 0, currentPath is already adjusted (empty at startLevel, then builds from there)
    // So we just need to add nodeName to currentPath
    return [...currentPath, nodeName];
  }

  function searchNode(node: TreeDataItem, currentPath: string[] = [], depth: number = 0): TreeDataItem | null {
    const nodeName = String(node.displayText || node.text);
    
    // If this node is before the start level, just pass through and search children
    // Don't match the node itself, but include it if it has matching children
    if (depth < startLevel) {
      const children: TreeDataItem[] = [];
      if (node.children) {
        for (const child of node.children) {
          // Build path for children: if we're at depth < startLevel, continue building path
          // When we reach startLevel, the path should start fresh from there
          const childDepth = depth + 1;
          const childPath = childDepth === startLevel
            ? []  // Child is at startLevel, path starts from here
            : [...currentPath, nodeName];  // Continue building path
          const childResult = searchNode(child, childPath, childDepth);
          if (childResult) {
            children.push(childResult);
          }
        }
      }
      
      // Include node if it has matching children, but don't match the node itself
      if (children.length > 0) {
        return {
          ...node,
          children,
        };
      }
      return null;
    }
    const isFolderNode = node.type ? node.type === "folder" : node.children !== undefined && node.children.length > 0;
    const nodePath = getNodePath(node, currentPath);
    const displayText = String(node.displayText || node.text);

    let matches = false;
    let highlightedText: React.ReactNode = displayText;
    const isSingleSegment = !hasTrailingDot && segments.length === 1;
    const lastSegment = segments[segments.length - 1];

    // Check if this node matches the search pattern
    if (hasTrailingDot) {
      // For trailing dot, show all nodes under the matched path
      // The text before the dot must completely match the node name (not substring)
      // Check if the last N segments of nodePath match the search segments exactly
      if (nodePath.length >= segments.length) {
        const pathTail = nodePath.slice(-segments.length);
        let pathMatches = true;
        for (let i = 0; i < segments.length; i++) {
          if (pathTail[i].toLowerCase() !== segments[i].toLowerCase()) {
            pathMatches = false;
            break;
          }
        }
        
        if (pathMatches) {
          if (isFolderNode) {
            // For trailing dot, match nodes whose path ends with the segments
            // This means the last N segments of the path exactly match the search segments
            // where N = segments.length
            // The pathTail already matches, so if pathTail.length === segments.length, 
            // it means the path ends exactly at the segments
            if (pathTail.length === segments.length && nodePath.length >= segments.length) {
              // Check if this node's name is the last segment (i.e., path ends here)
              // This ensures we match "system" in path ["Host1", "system"] when searching "system."
              const nodeNameMatchesLastSegment = displayText.toLowerCase() === segments[segments.length - 1].toLowerCase();
              if (nodeNameMatchesLastSegment) {
                matches = true;
                // Highlight the entire displayText since it's a complete match
                highlightedText = highlight(displayText, 0, displayText.length);
              }
            }
            // Nodes with nodePath.length > segments.length are children under the matched path
            // They will be included via the hasTrailingDot && matches logic when processing children
          } else {
            // For leaf nodes, check if their parent path matches
            const packagePath = nodePath.slice(0, -1);
            if (packagePath.length >= segments.length) {
              const packagePathTail = packagePath.slice(-segments.length);
              let packageMatches = true;
              for (let i = 0; i < segments.length; i++) {
                if (packagePathTail[i].toLowerCase() !== segments[i].toLowerCase()) {
                  packageMatches = false;
                  break;
                }
              }
              if (packageMatches) {
                matches = true;
                // Don't highlight leaf nodes when using trailing dot - they're just shown as children
              }
            }
          }
        }
      }
    } else {
      // Regular matching
      if (isSingleSegment) {
        // Single segment: only direct name matches
        const directMatch = substringMatch(displayText, lastSegment);
        matches = directMatch.matches;
        if (matches) {
          highlightedText = highlight(displayText, directMatch.start, directMatch.end);
        }
      } else {
        // Multi-segment: segments before last dot need complete match, last segment uses substring match
        // Example: "system.metric" -> "system" must match completely, "metric" can be substring in "metric_log"
        const allButLastSegments = segments.slice(0, -1);
        
        // Check if the path ends with the segments (except last) - supports nested paths like ["host", "system"]
        if (nodePath.length >= allButLastSegments.length) {
          const pathTail = nodePath.slice(-allButLastSegments.length);
          let pathTailMatches = true;
          for (let i = 0; i < allButLastSegments.length; i++) {
            if (pathTail[i].toLowerCase() !== allButLastSegments[i].toLowerCase()) {
              pathTailMatches = false;
              break;
            }
          }
          
          if (pathTailMatches) {
            // Path matches, now check this node
            // The pathTail matched means the last N segments of nodePath match allButLastSegments
            // We need to check if this node is at the boundary where the path matches
            if (isFolderNode) {
              // Check if this node is the one at the end of the matching path tail
              // The pathTail already matched, now check if this node's displayText is the last segment
              // This means: the last segment of pathTail (which is this node) matches the last segment of allButLastSegments
              const pathTail = nodePath.slice(-allButLastSegments.length);
              const isPathNode = pathTail.length === allButLastSegments.length &&
                pathTail.every((seg, idx) => seg.toLowerCase() === allButLastSegments[idx].toLowerCase()) &&
                displayText.toLowerCase() === allButLastSegments[allButLastSegments.length - 1].toLowerCase();
              
              if (isPathNode) {
                // This is the path node (e.g., "system" in "system.metric")
                // Mark as matching - children will be filtered by last segment during children processing
                matches = true;
                highlightedText = highlight(displayText, 0, displayText.length);
              } else if (nodePath.length > allButLastSegments.length) {
                // This is a child node - check if its name matches the last segment as substring
                const nodeName = displayText;
                const lastSegmentMatch = substringMatch(nodeName, lastSegment);
                if (lastSegmentMatch.matches) {
                  matches = true;
                  highlightedText = highlight(displayText, lastSegmentMatch.start, lastSegmentMatch.end);
                }
              }
            } else {
              // For leaf nodes: check if name matches last segment as substring
              // But only if parent path matches
              const simpleClassName = displayText;
              const substringResult = substringMatch(simpleClassName, lastSegment);
              if (substringResult.matches) {
                matches = true;
                highlightedText = highlight(simpleClassName, substringResult.start, substringResult.end);
              }
            }
          }
        }
      }
    }

    // Process children first to determine if this node should be highlighted
    const children: TreeDataItem[] = [];
    if (node.children) {
      // Build the path for children - this is the currentPath + this node's name
      const childCurrentPath = [...currentPath, displayText];
      const childDepth = depth + 1;
      for (const child of node.children) {
        const childResult = searchNode(child, childCurrentPath, childDepth);
        if (childResult) {
          children.push(childResult);
        } else if (hasTrailingDot && matches) {
          // For trailing dot searches, if this node matches, include all children even if they don't match
          // This ensures "system." shows all children of "system"
          children.push(child);
        } else if (!hasTrailingDot && segments.length > 1 && matches) {
          // For multi-segment searches where this node matches the path,
          // include children that match the last segment
          const childPath = getNodePath(child, childCurrentPath);
          // Check if child is directly under this matched node
          if (childPath.length === nodePath.length + 1) {
            const childName = String(child.displayText || child.text);
            const lastSegmentMatch = substringMatch(childName, lastSegment);
            if (lastSegmentMatch.matches) {
              // Child matches the last segment, include it
              children.push({
                ...child,
                displayText: highlight(childName, lastSegmentMatch.start, lastSegmentMatch.end),
              });
            }
          }
        }
      }
    }

    // Additional highlighting logic for package nodes that are part of a matching path
    if (!matches && isFolderNode && children.length > 0) {
      // Check if this package node matches any of the search segments
      // Only highlight if it's a complete match (the entire displayText matches the segment)
      // This prevents highlighting "com" in "commons" when searching for "com"
      for (let i = 0; i < segments.length; i++) {
        const segment = segments[i];
        const substringResult = substringMatch(displayText, segment);
        if (substringResult.matches && substringResult.start === 0 && substringResult.end === displayText.length) {
          // Only highlight if the match covers the entire displayText (complete word match)
          matches = true;
          highlightedText = highlight(displayText, substringResult.start, substringResult.end);
          break; // Found a match, no need to check other segments
        }
      }
    }

    // Include node if it matches or has matching children
    if (matches || children.length > 0) {
      // Determine if this node should be expanded
      let shouldExpand = false;

      if (matches) {
        // If this node matches, determine if it should be expanded based on search criteria
        if (hasTrailingDot) {
          // For trailing dot searches, expand if this node exactly matches the search path
          // OR if it directly matches one of the search segments
          const isAtExactSearchDepth = nodePath.length === segments.length;
          const directlyMatchesSegment = segments.some((segment) => substringMatch(displayText, segment).matches);
          shouldExpand = isAtExactSearchDepth || directlyMatchesSegment;
        } else {
          if (segments.length > 1) {
            // Multi-segment: expand if this node matches the path (all segments except last)
            // This expands parents to reveal the matched child, but the matched child itself
            // will not be expanded (its state remains unchanged)
            const allButLastSegments = segments.slice(0, -1);
            if (nodePath.length === allButLastSegments.length) {
              const pathMatch = matchesPath(nodePath, allButLastSegments, true);
              shouldExpand = pathMatch.matches;
            } else {
              // Also expand if this node directly matches a search segment (parent expansion)
              const directlyMatchesSegment = segments.some((segment) => substringMatch(displayText, segment).matches);
              shouldExpand = directlyMatchesSegment;
            }
          } else {
            // Single segment: do NOT expand the matched node itself
            // The matched node should remain in its current expanded/collapsed state
            // Only expand if it has matching children that need to be shown
            shouldExpand = false;
          }
        }
      }

      // For nodes that don't match but have matching children
      if (!matches && children.length > 0) {
        // Always expand nodes that have matching children, regardless of search type
        // This ensures users can see the matched nodes (e.g., host node when searching "system.")
        // or when searching "level" to show collapsed children "level1" and "level2"
        shouldExpand = true;
      }
      
      // Special case: if a matched node has matching children that are collapsed,
      // we need to expand it to show them (e.g., searching "level" to show "level1" and "level2")
      if (matches && children.length > 0 && isSingleSegment) {
        // The node itself matches, and it has matching children
        // We need to expand it to show the matching children
        shouldExpand = true;
      }

      // For single-segment search, only return matching children (not all children)
      // This preserves the expanded state when there are no matching children (rule 2.1)
      let returnedChildren = children;
      
      // For trailing dot searches where this node matches, include all children
      if (hasTrailingDot && matches && isFolderNode && node.children) {
        // Include all original children, not just matching ones
        const childCurrentPath = [...currentPath, displayText];
        returnedChildren = node.children.map(child => {
          const childResult = searchNode(child, childCurrentPath);
          return childResult || child;
        });
      }
      
      // For multi-segment searches (like "system.m"), expand nodes that match the path
      // and show children that match the last segment
      if (!hasTrailingDot && segments.length > 1 && matches && isFolderNode) {
        // Make sure children are properly included
        if (returnedChildren.length === 0 && node.children) {
          // Re-check children for multi-segment search
          const childCurrentPath = [...currentPath, displayText];
          for (const child of node.children) {
            const childResult = searchNode(child, childCurrentPath);
            if (childResult) {
              returnedChildren.push(childResult);
            }
          }
        }
      }

      return {
        ...node,
        _expanded: shouldExpand,
        displayText: matches ? highlightedText : node.displayText,
        children: returnedChildren.length > 0 ? returnedChildren : node.children ? [] : undefined,
      };
    }

    return null;
  }

  const result: TreeDataItem[] = [];
  for (const node of tree) {
    // Start from depth 0 for root nodes
    const nodeResult = searchNode(node, [], 0);
    if (nodeResult) {
      result.push(nodeResult);
    }
  }

  return result;
}
