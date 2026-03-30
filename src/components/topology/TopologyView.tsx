// Copyright (C) 2026 AnalyseDeCircuit
// SPDX-License-Identifier: GPL-3.0-only

/**
 * Topology Visualization Component
 *
 * Cyber-Industrial Theme Implementation
 */

import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { TopologyNode, LayoutNode } from '../../lib/topologyUtils';
import { calculateTreeLayout } from '../../lib/topologyUtils';
import { cn } from '../../lib/utils';

interface TopologyViewProps {
  nodes: TopologyNode[];
}

// ------------------------------------------------------------------
// Theme Constants
// ------------------------------------------------------------------

const THEME = {
  colors: {
    active: '#22c55e',      // neon green
    connecting: '#eab308',  // neon yellow
    error: '#ef4444',       // neon red
    disconnected: '#71717a', // zinc-500
    idle: '#f59e0b',        // amber
  },
  node: {
    width: 140,
    height: 50,
  }
};

const getStatusColor = (status: string) => {
  switch (status) {
    case 'connected': return THEME.colors.active;
    case 'connecting': return THEME.colors.connecting;
    case 'disconnected':
    case 'closed': return THEME.colors.disconnected;
    case 'error': return THEME.colors.error;
    default: return THEME.colors.idle;
  }
};

// ------------------------------------------------------------------
// Sub-components
// ------------------------------------------------------------------

/**
 * Render a Connection Line with Gradient and Animation
 */
const ConnectionLine = ({
  start,
  end,
  startColor,
  endColor,
  isActive
}: {
  start: { x: number, y: number },
  end: { x: number, y: number },
  startColor: string,
  endColor: string,
  isActive: boolean
}) => {
  const gradientId = `grad-${start.x}-${start.y}-${end.x}-${end.y}`;

  // Calculate Cubic Bezier Control Points
  const deltaY = end.y - start.y;
  const cp1 = { x: start.x, y: start.y + deltaY * 0.5 };
  const cp2 = { x: end.x, y: end.y - deltaY * 0.5 };
  const pathData = `M ${start.x} ${start.y} C ${cp1.x} ${cp1.y}, ${cp2.x} ${cp2.y}, ${end.x} ${end.y}`;

  return (
    <g>
      <defs>
        <linearGradient id={gradientId} gradientUnits="userSpaceOnUse" x1={start.x} y1={start.y} x2={end.x} y2={end.y}>
          <stop offset="0%" stopColor={startColor} />
          <stop offset="100%" stopColor={endColor} />
        </linearGradient>
      </defs>

      {/* Glow effect for active lines */}
      {isActive && (
        <path
          d={pathData}
          fill="none"
          stroke={startColor}
          strokeWidth="4"
          strokeOpacity="0.1"
          strokeLinecap="round"
        />
      )}

      {/* Main Gradient Line */}
      <path
        d={pathData}
        fill="none"
        stroke={`url(#${gradientId})`}
        strokeWidth={isActive ? 2 : 1.5}
        strokeLinecap="round"
        strokeOpacity={isActive ? 1 : 0.4}
        className={cn(
          "transition-all duration-500",
          isActive && "animate-pulse-subtle" // Custom animation class defined in styles or handled below
        )}
      />

      {/* Flow Animation Particle */}
      {isActive && (
        <circle r="2" fill="white">
          <animateMotion dur="2s" repeatCount="indefinite" path={pathData} />
        </circle>
      )}
    </g>
  );
};


/**
 * Render Node using ForeignObject for HTML/Tailwind styling
 */
const NodeCard = ({
  node,
  isHovered,
  isDimmed,
  onMouseEnter,
  onMouseLeave
}: {
  node: LayoutNode,
  isHovered: boolean,
  isDimmed: boolean,
  onMouseEnter: () => void,
  onMouseLeave: () => void
}) => {
  const statusColor = getStatusColor(node.status);
  const halfWidth = node.width / 2;
  const halfHeight = node.height / 2;

  // Interactive States
  const isDown = node.status === 'disconnected' || node.status === 'failed';
  const isConnecting = node.status === 'connecting' || node.status === 'pending';

  return (
    <foreignObject
      x={node.x - halfWidth}
      y={node.y - halfHeight}
      width={node.width}
      height={node.height}
      style={{ overflow: 'visible' }} // Allow glow to spill out
    >
      <div
        className={cn(
          "w-full h-full rounded-lg transition-all duration-300 ease-out select-none",
          // Glassmorphism Base
          "bg-theme-bg-panel/20 backdrop-blur-md border border-theme-border/50",
          // Hover State
          isHovered && "border-theme-accent/50 shadow-[0_0_15px_color-mix(in srgb, var(--theme-accent) 15%, transparent)] scale-105",
          // Dimmed State (when another node is hovered and this one isn't related)
          isDimmed && "opacity-30 blur-[1px]",
          // LinkDown State
          isDown && "grayscale-[0.8] border-red-500/30",
          // Connecting State
          isConnecting && "animate-pulse"
        )}
        onMouseEnter={onMouseEnter}
        onMouseLeave={onMouseLeave}
      >
        <div className="flex flex-col justify-center items-center h-full w-full relative group">

          {/* Status Indicator (Neon Glow) */}
          <div className="flex items-center gap-2 mb-0.5">
            <div
              className={cn("w-1.5 h-1.5 rounded-full shadow-[0_0_8px]", isDown && "animate-ping")}
              style={{
                backgroundColor: statusColor,
                boxShadow: `0 0 8px ${statusColor}` // Neon glow
              }}
            />

            {/* Node Name */}
            <span className="text-theme-text text-[12px] font-semibold tracking-wide truncate max-w-[100px] drop-shadow-md">
              {node.name}
            </span>
          </div>

          {/* IP Address */}
          <span className="text-[10px] font-mono text-theme-text-muted opacity-60">
            {node.host}
          </span>

          {/* Error Pulse Border (if needed) */}
          {isDown && (
            <div className="absolute inset-0 rounded-lg border border-red-500/20 animate-pulse pointer-events-none" />
          )}
        </div>
      </div>
    </foreignObject>
  );
};


// ------------------------------------------------------------------
// Main Component
// ------------------------------------------------------------------

export const TopologyView: React.FC<TopologyViewProps> = ({ nodes }) => {
  const { t } = useTranslation();
  const [hoveredNodeId, setHoveredNodeId] = useState<string | null>(null);

  if (nodes.length === 0) {
    return (
      <div className="flex items-center justify-center h-[400px] text-theme-text-muted">
        <div className="text-center">
          <div className="text-4xl mb-4 opacity-20">❄️</div>
          <p className="text-sm font-mono tracking-widest uppercase">{t('topology.view.no_matrix')}</p>
        </div>
      </div>
    );
  }

  // 1. Calculate Layout
  const layers = calculateTreeLayout(nodes, {
    nodeWidth: THEME.node.width,
    nodeHeight: THEME.node.height,
    verticalGap: 80,
    horizontalGap: 160,
  });

  // 2. Flatten nodes for easier rendering
  const allNodes: LayoutNode[] = [];
  layers.forEach(layer => layer.forEach(node => allNodes.push(node)));

  // 3. Determine Canvas Size
  let maxX = 0;
  let maxY = 0;
  allNodes.forEach(node => {
    maxX = Math.max(maxX, node.x + node.width / 2);
    maxY = Math.max(maxY, node.y + node.height / 2);
  });

  const width = Math.max(800, maxX + 100);
  const height = Math.max(500, maxY + 100);

  // 4. Helper to determine connection relevance for dimming
  // Currently using simplified dimming logic inline, this helper is reserved for future enhancement
  // const isNodeRelevant = (nodeId: string) => {
  //     if (!hoveredNodeId) return false;
  //     if (nodeId === hoveredNodeId) return true;
  //     return false;
  // };

  return (
    <div className="w-full h-full overflow-auto bg-theme-bg rounded-lg shadow-inner relative">
      <svg
        width={width}
        height={height}
        viewBox={`0 0 ${width} ${height}`}
        className="block"
      >
        <defs>
          {/* 1. Background Gradient */}
          <radialGradient id="cyber-bg" cx="50%" cy="50%" r="50%" fx="50%" fy="50%">
            <stop offset="0%" stopColor="var(--theme-bg-panel)" />
            <stop offset="100%" stopColor="var(--theme-bg)" />
          </radialGradient>

          {/* 2. Dot Pattern Grid */}
          <pattern id="cyber-grid" x="0" y="0" width="30" height="30" patternUnits="userSpaceOnUse">
            <circle cx="1" cy="1" r="1" fill="var(--theme-text-muted)" opacity="0.1" />
          </pattern>
        </defs>

        {/* Background Components */}
        <rect width="100%" height="100%" fill="url(#cyber-bg)" />
        <rect width="100%" height="100%" fill="url(#cyber-grid)" />

        {/* Connections Layer */}
        {allNodes.map(node => {
          if (!node.children || node.children.length === 0) return null;
          return node.children.map(child => {
            const isHoveredInteraction = hoveredNodeId === node.id || hoveredNodeId === child.id;
            const isActive = node.status === 'connected' && child.status === 'connected';

            // Fade out inactive connections if something is hovered
            const isDimmed = hoveredNodeId !== null && !isHoveredInteraction;

            return (
              <g key={`${node.id}-${child.id}`} style={{ opacity: isDimmed ? 0.1 : 1, transition: 'opacity 0.3s' }}>
                <ConnectionLine
                  start={{ x: node.x, y: node.y + node.height / 2 }}
                  end={{ x: child.x, y: child.y - child.height / 2 }}
                  startColor={getStatusColor(node.status)}
                  endColor={getStatusColor(child.status)}
                  isActive={isActive}
                />
              </g>
            );
          });
        })}

        {/* Nodes Layer */}
        {allNodes.map(node => {
          const isHovered = hoveredNodeId === node.id;

          // Simplified dim logic: If any node hovered, dim all others except self
          const simplisticDim = hoveredNodeId !== null && hoveredNodeId !== node.id;

          return (
            <NodeCard
              key={node.id}
              node={node}
              isHovered={isHovered}
              isDimmed={simplisticDim}
              onMouseEnter={() => setHoveredNodeId(node.id)}
              onMouseLeave={() => setHoveredNodeId(null)}
            />
          );
        })}

      </svg>
    </div>
  );
};

