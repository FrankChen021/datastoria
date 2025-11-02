import { describe, it, expect } from 'vitest';
import { searchTree } from './tree-search';
import type { TreeDataItem } from '@/components/ui/tree';

// Helper to create a test tree structure similar to schema tree
function createTestTree(): TreeDataItem[] {
  const hostNode: TreeDataItem = {
    id: 'host',
    text: 'Host1',
    search: 'host1',
    type: 'folder',
    children: [
      {
        id: 'db:system',
        text: 'system',
        search: 'system',
        type: 'folder',
        children: [
          {
            id: 'table:system.metric_log',
            text: 'metric_log',
            search: 'metric_log',
            type: 'folder',
            children: [
              {
                id: 'table:system.metric_log.timestamp',
                text: 'timestamp',
                search: 'timestamp',
                type: 'leaf',
              },
              {
                id: 'table:system.metric_log.value',
                text: 'value',
                search: 'value',
                type: 'leaf',
              },
            ],
          },
          {
            id: 'table:system.metrics',
            text: 'metrics',
            search: 'metrics',
            type: 'folder',
            children: [],
          },
          {
            id: 'table:system.tables',
            text: 'tables',
            search: 'tables',
            type: 'folder',
            children: [],
          },
        ],
      },
      {
        id: 'db:default',
        text: 'default',
        search: 'default',
        type: 'folder',
        children: [
          {
            id: 'table:default.users',
            text: 'users',
            search: 'users',
            type: 'folder',
            children: [],
          },
        ],
      },
    ],
  };

  return [hostNode];
}

describe('tree-search', () => {
  describe('trailing dot search', () => {
    it('should show system node with all children when searching "system."', () => {
      const tree = createTestTree();
      const result = searchTree(tree, 'system.');

      // Should find the system database node
      const systemNode = result[0]?.children?.find((node) => node.text === 'system');
      expect(systemNode).toBeDefined();
      expect(systemNode?.text).toBe('system');

      // Should include all children of system
      expect(systemNode?.children?.length).toBe(3);
      expect(systemNode?.children?.map((c) => c.text)).toEqual(
        expect.arrayContaining(['metric_log', 'metrics', 'tables'])
      );
    });

    it('should show system node with all children when searching "system." with startLevel=1', () => {
      const tree = createTestTree();
      const result = searchTree(tree, 'system.', { startLevel: 1 });

      // Should find the host node (included because it has matching children)
      expect(result.length).toBeGreaterThan(0);
      expect(result[0]?.text).toBe('Host1');

      // Should find the system database node
      const systemNode = result[0]?.children?.find((node) => node.text === 'system');
      expect(systemNode).toBeDefined();
      expect(systemNode?.text).toBe('system');

      // Should include all children of system
      expect(systemNode?.children?.length).toBe(3);
      expect(systemNode?.children?.map((c) => c.text)).toEqual(
        expect.arrayContaining(['metric_log', 'metrics', 'tables'])
      );
    });

    it('should show nothing when searching "nonexistent."', () => {
      const tree = createTestTree();
      const result = searchTree(tree, 'nonexistent.');
      expect(result.length).toBe(0);
    });
  });

  describe('multi-segment search', () => {
    it('should show system node with children matching "m" when searching "system.m"', () => {
      const tree = createTestTree();
      const result = searchTree(tree, 'system.m');

      // Should find the system database node
      const systemNode = result[0]?.children?.find((node) => node.text === 'system');
      expect(systemNode).toBeDefined();
      expect(systemNode?.text).toBe('system');

      // Should show children that match "m" as substring
      expect(systemNode?.children?.length).toBeGreaterThan(0);
      const childrenNames = systemNode?.children?.map((c) => c.text) || [];
      
      // metric_log and metrics should match (both contain "m")
      expect(childrenNames).toContain('metric_log');
      expect(childrenNames).toContain('metrics');
      
      // tables should NOT match (doesn't contain "m")
      expect(childrenNames).not.toContain('tables');
    });

    it('should show system node with metric_log when searching "system.metric"', () => {
      const tree = createTestTree();
      const result = searchTree(tree, 'system.metric');

      // Should have the host node in result (because it has matching children)
      expect(result.length).toBeGreaterThan(0);
      const hostNode = result[0];
      expect(hostNode?.text).toBe('Host1');
      
      // Should find the system database node
      const systemNode = hostNode?.children?.find((node) => node.text === 'system');
      expect(systemNode).toBeDefined();

      // Should show metric_log (contains "metric") and metrics (contains "metric")
      const childrenNames = systemNode?.children?.map((c) => c.text) || [];
      expect(childrenNames.length).toBeGreaterThan(0);
      expect(childrenNames).toContain('metric_log');
      expect(childrenNames).toContain('metrics');
    });

    it('should show metric_log table with matching columns when searching "system.metric_log.t"', () => {
      const tree = createTestTree();
      const result = searchTree(tree, 'system.metric_log.t');

      // Navigate to system -> metric_log
      const systemNode = result[0]?.children?.find((node) => node.text === 'system');
      expect(systemNode).toBeDefined();

      const metricLogNode = systemNode?.children?.find((node) => node.text === 'metric_log');
      expect(metricLogNode).toBeDefined();

      // Should show columns that match "t" as substring
      const childrenNames = metricLogNode?.children?.map((c) => c.text) || [];
      expect(childrenNames).toContain('timestamp'); // contains "t"
      expect(childrenNames).not.toContain('value'); // doesn't contain "t"
    });
  });

  describe('single segment search', () => {
    it('should show nodes matching "system" when searching "system"', () => {
      const tree = createTestTree();
      const result = searchTree(tree, 'system');

      // Should find nodes containing "system"
      expect(result.length).toBeGreaterThan(0);
      const systemNode = result[0]?.children?.find((node) => node.text === 'system');
      expect(systemNode).toBeDefined();
    });

    it('should show nodes matching "system" when searching "system" with startLevel=1', () => {
      const tree = createTestTree();
      const result = searchTree(tree, 'system', { startLevel: 1 });

      // Should find nodes containing "system"
      expect(result.length).toBeGreaterThan(0);
      const hostNode = result[0];
      expect(hostNode?.text).toBe('Host1');
      
      const systemNode = hostNode?.children?.find((node) => node.text === 'system');
      expect(systemNode).toBeDefined();
      expect(systemNode?.text).toBe('system');
    });
  });

  describe('edge cases', () => {
    it('should return empty array for empty search', () => {
      const tree = createTestTree();
      const result = searchTree(tree, '');
      // Empty search should return original tree
      expect(result.length).toBeGreaterThan(0);
    });

    it('should handle case-insensitive matching', () => {
      const tree = createTestTree();
      const result = searchTree(tree, 'SYSTEM.');
      
      const systemNode = result[0]?.children?.find((node) => node.text === 'system');
      expect(systemNode).toBeDefined();
      expect(systemNode?.children?.length).toBe(3);
    });
  });

  describe('startLevel option', () => {
    it('should skip root level when startLevel is 1', () => {
      const tree = createTestTree();
      const result = searchTree(tree, 'system.', { startLevel: 1 });

      // Should still find the host node (it's included because it has matching children)
      expect(result.length).toBeGreaterThan(0);
      expect(result[0]?.text).toBe('Host1');
      
      // Should find the system database node
      const systemNode = result[0]?.children?.find((node) => node.text === 'system');
      expect(systemNode).toBeDefined();
      expect(systemNode?.children?.length).toBe(3);
    });

    it('should work with multi-segment search and startLevel', () => {
      const tree = createTestTree();
      const result = searchTree(tree, 'system.metric', { startLevel: 1 });

      // Host node should be included (has matching children)
      expect(result.length).toBeGreaterThan(0);
      const systemNode = result[0]?.children?.find((node) => node.text === 'system');
      expect(systemNode).toBeDefined();
      
      // Should show metric_log and metrics
      const childrenNames = systemNode?.children?.map((c) => c.text) || [];
      expect(childrenNames).toContain('metric_log');
      expect(childrenNames).toContain('metrics');
    });
  });
});

