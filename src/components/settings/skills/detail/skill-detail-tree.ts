"use client";

export interface DirNode {
  name: string;
  path: string;
  isDir: boolean;
  children: DirNode[];
}

export function buildDirTree(paths: string[]): DirNode[] {
  const root: DirNode = { name: "", path: "", isDir: true, children: [] };

  for (const p of paths) {
    const parts = p.split("/");
    let current = root;
    for (let i = 0; i < parts.length; i++) {
      const part = parts[i];
      const isLast = i === parts.length - 1;
      const existing = current.children.find((c) => c.name === part);
      if (existing) {
        current = existing;
      } else {
        const nodePath = parts.slice(0, i + 1).join("/");
        const node: DirNode = {
          name: part,
          path: nodePath,
          isDir: !isLast,
          children: [],
        };
        current.children.push(node);
        current.children.sort((a, b) => {
          if (a.isDir !== b.isDir) return a.isDir ? -1 : 1;
          return a.name.localeCompare(b.name);
        });
        if (!isLast) {
          current = node;
        }
      }
    }
  }

  return root.children;
}
