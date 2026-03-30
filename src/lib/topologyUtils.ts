// Copyright (C) 2026 AnalyseDeCircuit
// SPDX-License-Identifier: GPL-3.0-only

/**
 * Topology Visualization Utilities
 *
 * 将 SessionTree 的扁平节点转换为树形结构用于可视化
 */

import * as d3Force from 'd3-force';
import type { FlatNode } from '../types';

/**
 * 树形节点（用于可视化）
 */
export interface TopologyNode {
  id: string;
  name: string;
  host: string;
  username: string;
  status: 'connected' | 'connecting' | 'disconnected' | 'failed' | 'pending';
  depth: number;
  children: TopologyNode[];
}

/**
 * 力导向布局节点（包含位置信息）
 */
export interface ForceLayoutNode extends TopologyNode {
  x: number;
  y: number;
  fx?: number | null;  // 固定 x 位置
  fy?: number | null;  // 固定 y 位置
  vx?: number;
  vy?: number;
  index?: number;
}

/**
 * 力导向布局连接
 */
export interface ForceLayoutLink {
  source: string | ForceLayoutNode;
  target: string | ForceLayoutNode;
}

// ============================================================================
// Topology Cache - 性能优化
// ============================================================================

/**
 * 拓扑缓存类 - 避免重复构建拓扑树
 * 
 * 使用哈希比对策略：
 * - 只有当节点数据实际变化时才重新构建
 * - 哈希只关注关键字段（id, parentId, status）
 */
class TopologyCache {
  private cachedTree: TopologyNode[] | null = null;
  private cachedHash: string = '';
  private hitCount: number = 0;
  private missCount: number = 0;

  /**
   * 使用缓存构建拓扑树
   * @param nodes 扁平节点列表
   * @returns 缓存的或新构建的树形结构
   */
  buildWithCache(nodes: FlatNode[]): TopologyNode[] {
    const newHash = this.computeHash(nodes);

    if (newHash === this.cachedHash && this.cachedTree !== null) {
      // 缓存命中
      this.hitCount++;
      return this.cachedTree;
    }

    // 缓存未命中，重新构建
    this.missCount++;
    const tree = buildTopologyTree(nodes);

    this.cachedHash = newHash;
    this.cachedTree = tree;

    return tree;
  }

  /**
   * 计算节点列表的快速哈希
   * 只关注影响拓扑结构的关键字段
   */
  private computeHash(nodes: FlatNode[]): string {
    if (nodes.length === 0) return '';
    
    // 按 id 排序确保顺序稳定
    const sorted = [...nodes].sort((a, b) => a.id.localeCompare(b.id));
    
    return sorted
      .map(n => `${n.id}|${n.parentId ?? 'root'}|${n.state.status}|${n.hasChildren}`)
      .join('::');
  }

  /**
   * 强制使缓存失效
   */
  invalidate(): void {
    this.cachedTree = null;
    this.cachedHash = '';
  }

  /**
   * 获取缓存统计信息（用于调试）
   */
  getStats(): { hitCount: number; missCount: number; hitRate: number } {
    const total = this.hitCount + this.missCount;
    return {
      hitCount: this.hitCount,
      missCount: this.missCount,
      hitRate: total > 0 ? (this.hitCount / total) * 100 : 0,
    };
  }

  /**
   * 重置统计计数器
   */
  resetStats(): void {
    this.hitCount = 0;
    this.missCount = 0;
  }
}

/** 全局拓扑缓存实例 */
export const topologyCache = new TopologyCache();

/**
 * 使用缓存构建拓扑树（推荐使用）
 * @param nodes 扁平节点列表
 * @returns 树形结构的根节点列表
 */
export function buildTopologyTreeCached(nodes: FlatNode[]): TopologyNode[] {
  return topologyCache.buildWithCache(nodes);
}

/**
 * 将扁平节点列表转换为树形结构
 * @param flatNodes 扁平节点列表
 * @returns 树形结构的根节点列表
 */
export function buildTopologyTree(flatNodes: FlatNode[]): TopologyNode[] {
  const nodeMap = new Map<string, TopologyNode>();
  const roots: TopologyNode[] = [];

  // 第一遍：创建所有节点
  flatNodes.forEach(flatNode => {
    const status = extractStatus(flatNode);

    nodeMap.set(flatNode.id, {
      id: flatNode.id,
      name: flatNode.displayName || `${flatNode.username}@${flatNode.host}`,
      host: flatNode.host,
      username: flatNode.username,
      status,
      depth: flatNode.depth,
      children: [],
    });
  });

  // 第二遍：建立父子关系
  flatNodes.forEach(flatNode => {
    const node = nodeMap.get(flatNode.id)!;

    if (flatNode.parentId) {
      const parent = nodeMap.get(flatNode.parentId);
      if (parent) {
        parent.children.push(node);
      } else {
        // 父节点不存在，作为根节点
        roots.push(node);
      }
    } else {
      // 没有父节点，作为根节点
      roots.push(node);
    }
  });

  return roots;
}

/**
 * 从 FlatNode 提取状态
 */
function extractStatus(flatNode: FlatNode): TopologyNode['status'] {
  const state = flatNode.state.status;

  if (state === 'connected') return 'connected';
  if (state === 'connecting') return 'connecting';
  if (state === 'failed') return 'failed';
  if (state === 'pending') return 'pending';
  return 'disconnected';
}

/**
 * 获取节点颜色
 */
export function getNodeColor(status: TopologyNode['status']): string {
  switch (status) {
    case 'connected':
      return '#4CAF50';  // 绿色
    case 'connecting':
      return '#FFC107';  // 黄色
    case 'failed':
      return '#F44336';  // 红色
    case 'pending':
      return '#9E9E9E';  // 灰色
    case 'disconnected':
      return '#9E9E9E';  // 灰色
    default:
      return '#9E9E9E';
  }
}

/**
 * 计算树形布局
 * @param nodes 根节点列表
 * @param options 布局选项
 * @returns 包含位置信息的节点列表
 */
export interface LayoutNode extends Omit<TopologyNode, 'children'> {
  x: number;
  y: number;
  width: number;
  height: number;
  children: LayoutNode[];
}

export interface LayoutOptions {
  nodeWidth?: number;
  nodeHeight?: number;
  verticalGap?: number;
  horizontalGap?: number;
}

export function calculateTreeLayout(
  nodes: TopologyNode[],
  options: LayoutOptions = {}
): LayoutNode[][] {
  const {
    nodeWidth = 120,
    nodeHeight = 40,
    verticalGap = 80,
    horizontalGap = 140,
  } = options;

  const layers: LayoutNode[][] = [];

  // 递归计算每个节点的位置
  function layoutNode(
    node: TopologyNode,
    depth: number,
    xOffset: number
  ): LayoutNode {
    const result: LayoutNode = {
      ...node,
      x: xOffset,
      y: 50 + depth * verticalGap,
      width: nodeWidth,
      height: nodeHeight,
      children: [], // 初始化为空，稍后填充
    };

    // 确保当前层存在
    if (!layers[depth]) {
      layers[depth] = [];
    }
    layers[depth].push(result);

    // 递归布局子节点
    if (node.children.length > 0) {
      const totalWidth = (node.children.length - 1) * horizontalGap;
      const startX = xOffset - totalWidth / 2;

      result.children = node.children.map((child, index) => {
        const childX = startX + index * horizontalGap;
        return layoutNode(child, depth + 1, childX);
      });
    }

    return result;
  }

  // 布局所有根节点
  const totalRootWidth = (nodes.length - 1) * (horizontalGap * 2);
  const startRootX = 400 - totalRootWidth / 2; // 居中

  nodes.forEach((root, index) => {
    const rootX = startRootX + index * (horizontalGap * 2);
    layoutNode(root, 0, rootX);
  });

  return layers;
}

// ============================================================================
// Force-Directed Layout - 力导向布局
// ============================================================================

/**
 * 力导向布局选项
 */
export interface ForceLayoutOptions {
  /** 画布宽度 */
  width?: number;
  /** 画布高度 */
  height?: number;
  /** 节点互斥力强度（负值表示排斥）*/
  chargeStrength?: number;
  /** 碰撞检测半径 */
  collisionRadius?: number;
  /** 连接线理想长度 */
  linkDistance?: number;
  /** 模拟迭代次数 */
  iterations?: number;
  /** Y轴层级力强度（保持树形结构） */
  yStrength?: number;
}

/**
 * 使用 D3-force 计算力导向布局
 * 
 * 特点：
 * - 节点自动分散，避免重叠
 * - 保持父子层级关系（Y轴方向）
 * - 适合大规模节点（50+）
 */
export function calculateForceLayout(
  nodes: TopologyNode[],
  options: ForceLayoutOptions = {}
): { nodes: ForceLayoutNode[]; links: ForceLayoutLink[] } {
  const {
    width = 800,
    height = 600,
    chargeStrength = -400,
    collisionRadius = 80,
    linkDistance = 120,
    iterations = 300,
    yStrength = 0.3,
  } = options;

  // 1. 扁平化树节点
  const flatNodes: ForceLayoutNode[] = [];
  const links: ForceLayoutLink[] = [];
  const nodeMap = new Map<string, ForceLayoutNode>();

  function flattenTree(node: TopologyNode, parentId?: string) {
    const forceNode: ForceLayoutNode = {
      ...node,
      x: width / 2 + (Math.random() - 0.5) * 200,  // 初始位置带随机偏移
      y: 80 + node.depth * 150,  // 按层级初始化 Y 位置
      children: [],  // 清空，避免循环引用
    };
    
    flatNodes.push(forceNode);
    nodeMap.set(node.id, forceNode);

    if (parentId) {
      links.push({ source: parentId, target: node.id });
    }

    node.children.forEach(child => flattenTree(child, node.id));
  }

  nodes.forEach(root => flattenTree(root));

  if (flatNodes.length === 0) {
    return { nodes: [], links: [] };
  }

  // 2. 创建 D3 力模拟
  const simulation = d3Force.forceSimulation<ForceLayoutNode>(flatNodes)
    // 节点互斥力（排斥）
    .force('charge', d3Force.forceManyBody<ForceLayoutNode>()
      .strength(chargeStrength)
      .distanceMax(400)
    )
    // 居中力
    .force('center', d3Force.forceCenter<ForceLayoutNode>(width / 2, height / 2)
      .strength(0.05)
    )
    // 碰撞检测（防止重叠）
    .force('collision', d3Force.forceCollide<ForceLayoutNode>()
      .radius(collisionRadius)
      .strength(0.8)
    )
    // 连接线力
    .force('link', d3Force.forceLink<ForceLayoutNode, ForceLayoutLink>(links)
      .id(d => d.id)
      .distance(linkDistance)
      .strength(0.7)
    )
    // Y轴层级力（保持树形结构）
    .force('y', d3Force.forceY<ForceLayoutNode>()
      .y(d => 80 + d.depth * 150)
      .strength(yStrength)
    )
    // X轴居中力（较弱）
    .force('x', d3Force.forceX<ForceLayoutNode>()
      .x(width / 2)
      .strength(0.02)
    )
    .stop();

  // 3. 运行模拟
  for (let i = 0; i < iterations; i++) {
    simulation.tick();
  }

  // 4. 边界约束（确保节点在画布内）
  const padding = 80;
  flatNodes.forEach(node => {
    node.x = Math.max(padding, Math.min(width - padding, node.x));
    node.y = Math.max(padding, Math.min(height - padding, node.y));
  });

  // 5. 重建 children 引用（用于渲染连接线）
  links.forEach(link => {
    const sourceId = typeof link.source === 'string' ? link.source : link.source.id;
    const targetId = typeof link.target === 'string' ? link.target : link.target.id;
    const sourceNode = nodeMap.get(sourceId);
    const targetNode = nodeMap.get(targetId);
    if (sourceNode && targetNode) {
      sourceNode.children.push(targetNode);
    }
  });

  return { nodes: flatNodes, links };
}

/**
 * 力导向布局缓存
 */
class ForceLayoutCache {
  private cachedResult: { nodes: ForceLayoutNode[]; links: ForceLayoutLink[] } | null = null;
  private cachedHash: string = '';

  compute(
    treeNodes: TopologyNode[],
    options: ForceLayoutOptions = {}
  ): { nodes: ForceLayoutNode[]; links: ForceLayoutLink[] } {
    const hash = this.computeHash(treeNodes);
    
    if (hash === this.cachedHash && this.cachedResult) {
      return this.cachedResult;
    }

    const result = calculateForceLayout(treeNodes, options);
    this.cachedHash = hash;
    this.cachedResult = result;
    
    return result;
  }

  private computeHash(nodes: TopologyNode[]): string {
    const flatten = (n: TopologyNode): string => {
      const childHashes = n.children.map(flatten).join(',');
      return `${n.id}:${n.status}:[${childHashes}]`;
    };
    return nodes.map(flatten).join('|');
  }

  invalidate(): void {
    this.cachedResult = null;
    this.cachedHash = '';
  }
}

export const forceLayoutCache = new ForceLayoutCache();
