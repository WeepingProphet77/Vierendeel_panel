import type { PanelGeometry, Opening, Supports, Node, Member, FrameModel } from '../types';

export function generateFrameModel(
  panel: PanelGeometry,
  openings: Opening[],
  supports: Supports,
  defaultThicknessIn: number,
  existingMembers?: Member[]
): FrameModel {
  const errors: string[] = [];
  const warnings: string[] = [];

  // Validate openings
  for (let i = 0; i < openings.length; i++) {
    const o = openings[i];
    const left = o.centerXFt - o.widthFt / 2;
    const right = o.centerXFt + o.widthFt / 2;
    const bottom = o.centerYFt - o.heightFt / 2;
    const top = o.centerYFt + o.heightFt / 2;

    if (left < 0 || right > panel.widthFt || bottom < 0 || top > panel.heightFt) {
      errors.push(`Opening ${i + 1} extends beyond panel boundary.`);
    }

    for (let j = i + 1; j < openings.length; j++) {
      const o2 = openings[j];
      const left2 = o2.centerXFt - o2.widthFt / 2;
      const right2 = o2.centerXFt + o2.widthFt / 2;
      const bottom2 = o2.centerYFt - o2.heightFt / 2;
      const top2 = o2.centerYFt + o2.heightFt / 2;

      if (left < right2 && right > left2 && bottom < top2 && top > bottom2) {
        errors.push(`Openings ${i + 1} and ${j + 1} overlap.`);
      }
    }
  }

  if (errors.length > 0) {
    return { nodes: [], members: [], validationErrors: errors, validationWarnings: warnings };
  }

  // Sort openings left to right
  const sortedOpenings = [...openings].sort((a, b) => a.centerXFt - b.centerXFt);

  // Compute horizontal strip boundaries (unique Y coordinates from openings)
  const yEdges = new Set<number>();
  yEdges.add(0);
  yEdges.add(panel.heightFt);
  for (const o of sortedOpenings) {
    yEdges.add(o.centerYFt - o.heightFt / 2);
    yEdges.add(o.centerYFt + o.heightFt / 2);
  }
  const sortedY = Array.from(yEdges).sort((a, b) => a - b);

  // Compute vertical strip boundaries (unique X coordinates from openings)
  const xEdges = new Set<number>();
  xEdges.add(0);
  xEdges.add(panel.widthFt);
  for (const o of sortedOpenings) {
    xEdges.add(o.centerXFt - o.widthFt / 2);
    xEdges.add(o.centerXFt + o.widthFt / 2);
  }
  const sortedX = Array.from(xEdges).sort((a, b) => a - b);

  // Create a grid of cells and mark which are openings
  // Cell [i][j] spans from sortedX[i] to sortedX[i+1] horizontally, sortedY[j] to sortedY[j+1] vertically
  const nCols = sortedX.length - 1;
  const nRows = sortedY.length - 1;
  const isOpening: boolean[][] = Array.from({ length: nCols }, () => Array(nRows).fill(false));

  for (const o of sortedOpenings) {
    const oLeft = o.centerXFt - o.widthFt / 2;
    const oRight = o.centerXFt + o.widthFt / 2;
    const oBottom = o.centerYFt - o.heightFt / 2;
    const oTop = o.centerYFt + o.heightFt / 2;

    for (let i = 0; i < nCols; i++) {
      for (let j = 0; j < nRows; j++) {
        const cellCx = (sortedX[i] + sortedX[i + 1]) / 2;
        const cellCy = (sortedY[j] + sortedY[j + 1]) / 2;
        if (cellCx > oLeft && cellCx < oRight && cellCy > oBottom && cellCy < oTop) {
          isOpening[i][j] = true;
        }
      }
    }
  }

  // Identify horizontal strips: rows of solid cells spanning between vertical edges
  // Identify vertical strips: columns of solid cells spanning between horizontal edges
  // Joint blocks: intersection of horizontal and vertical strips

  // For the frame model, we need nodes at intersections and members along strips.
  // Strategy: identify all solid "joint block" positions and create members connecting them.

  // Joint blocks are at intersections of solid horizontal and vertical strips.
  // A node exists at each intersection of a vertical pier centerline and horizontal strip centerline.

  // Identify pier (vertical strip) center X coordinates
  // Piers are vertical solid strips: columns in the grid that are solid from one horizontal strip to another
  const pierXRanges: { left: number; right: number }[] = [];

  // Left edge pier: from 0 to left edge of leftmost opening
  if (sortedOpenings.length > 0) {
    const leftEdge = Math.min(...sortedOpenings.map(o => o.centerXFt - o.widthFt / 2));
    if (leftEdge > 0) pierXRanges.push({ left: 0, right: leftEdge });

    // Intermediate piers: between adjacent openings (sorted left to right)
    for (let i = 0; i < sortedOpenings.length - 1; i++) {
      const rightOfCurrent = sortedOpenings[i].centerXFt + sortedOpenings[i].widthFt / 2;
      const leftOfNext = sortedOpenings[i + 1].centerXFt - sortedOpenings[i + 1].widthFt / 2;
      if (leftOfNext > rightOfCurrent) {
        pierXRanges.push({ left: rightOfCurrent, right: leftOfNext });
      }
    }

    // Right edge pier
    const rightEdge = Math.max(...sortedOpenings.map(o => o.centerXFt + o.widthFt / 2));
    if (rightEdge < panel.widthFt) pierXRanges.push({ left: rightEdge, right: panel.widthFt });
  } else {
    pierXRanges.push({ left: 0, right: panel.widthFt });
  }

  // Identify horizontal strip Y ranges
  const hStripYRanges: { bottom: number; top: number }[] = [];
  if (sortedOpenings.length > 0) {
    // Bottom spandrel
    const bottomEdge = Math.min(...sortedOpenings.map(o => o.centerYFt - o.heightFt / 2));
    if (bottomEdge > 0) hStripYRanges.push({ bottom: 0, top: bottomEdge });

    // Intermediate horizontal strips (between vertically stacked openings)
    // Collect all unique opening top/bottom edges, sorted
    const openingBottoms = sortedOpenings.map(o => o.centerYFt - o.heightFt / 2).sort((a, b) => a - b);
    const openingTops = sortedOpenings.map(o => o.centerYFt + o.heightFt / 2).sort((a, b) => a - b);

    // Find gaps between opening rows
    const allYBounds: { y: number; type: 'bottom' | 'top' }[] = [];
    for (const o of sortedOpenings) {
      allYBounds.push({ y: o.centerYFt - o.heightFt / 2, type: 'bottom' });
      allYBounds.push({ y: o.centerYFt + o.heightFt / 2, type: 'top' });
    }

    // Use unique sorted Y values from openings to find horizontal solid strips
    const uniqueOpeningYs = Array.from(new Set([...openingBottoms, ...openingTops])).sort((a, b) => a - b);

    for (let i = 0; i < uniqueOpeningYs.length - 1; i++) {
      const yBot = uniqueOpeningYs[i];
      const yTop = uniqueOpeningYs[i + 1];
      // Check if this band is entirely solid (no openings span through it)
      const midY = (yBot + yTop) / 2;
      const anyOpeningCoversThisBand = sortedOpenings.some(o => {
        const oBot = o.centerYFt - o.heightFt / 2;
        const oTop = o.centerYFt + o.heightFt / 2;
        return oBot < midY && oTop > midY;
      });
      if (!anyOpeningCoversThisBand && yTop > yBot) {
        hStripYRanges.push({ bottom: yBot, top: yTop });
      }
    }

    // Top spandrel
    const topEdge = Math.max(...sortedOpenings.map(o => o.centerYFt + o.heightFt / 2));
    if (topEdge < panel.heightFt) hStripYRanges.push({ bottom: topEdge, top: panel.heightFt });
  } else {
    hStripYRanges.push({ bottom: 0, top: panel.heightFt });
  }

  // Sort strips
  hStripYRanges.sort((a, b) => a.bottom - b.bottom);
  pierXRanges.sort((a, b) => a.left - b.left);

  // Validate strip dimensions
  for (const pier of pierXRanges) {
    const w = (pier.right - pier.left) * 12;
    if (w <= 0) errors.push(`A pier has zero or negative width.`);
    else if (w < 4) warnings.push(`Pier at x=[${pier.left.toFixed(1)}, ${pier.right.toFixed(1)}] ft has width ${w.toFixed(1)} in (< 4 in).`);
  }
  for (const strip of hStripYRanges) {
    const d = (strip.top - strip.bottom) * 12;
    if (d <= 0) errors.push(`A horizontal strip has zero or negative depth.`);
    else if (d < 4) warnings.push(`Horizontal strip at y=[${strip.bottom.toFixed(1)}, ${strip.top.toFixed(1)}] ft has depth ${d.toFixed(1)} in (< 4 in).`);
  }

  if (errors.length > 0) {
    return { nodes: [], members: [], validationErrors: errors, validationWarnings: warnings };
  }

  // Create nodes at intersections of pier centerlines and horizontal strip centerlines
  const nodes: Node[] = [];
  let nodeIdCounter = 1;
  const nodeMap = new Map<string, Node>(); // key: "x,y"

  function getOrCreateNode(x: number, y: number, restraints = { dx: false, dy: false, rz: false }): Node {
    const key = `${x.toFixed(6)},${y.toFixed(6)}`;
    if (nodeMap.has(key)) {
      const existing = nodeMap.get(key)!;
      // Merge restraints
      existing.restraints.dx = existing.restraints.dx || restraints.dx;
      existing.restraints.dy = existing.restraints.dy || restraints.dy;
      existing.restraints.rz = existing.restraints.rz || restraints.rz;
      return existing;
    }
    const node: Node = { id: nodeIdCounter++, x, y, restraints };
    nodes.push(node);
    nodeMap.set(key, node);
    return node;
  }

  // Create grid nodes
  for (const hStrip of hStripYRanges) {
    const cy = (hStrip.bottom + hStrip.top) / 2;
    for (const pier of pierXRanges) {
      const cx = (pier.left + pier.right) / 2;
      getOrCreateNode(cx, cy);
    }
  }

  // Create horizontal members connecting piers along each horizontal strip
  const members: Member[] = [];
  let memberIdCounter = 1;

  // Determine which piers are connected through each horizontal strip
  // A horizontal member exists between adjacent piers if there's a solid path at that strip level
  for (let si = 0; si < hStripYRanges.length; si++) {
    const hStrip = hStripYRanges[si];
    const cy = (hStrip.bottom + hStrip.top) / 2;
    const stripDepthFt = hStrip.top - hStrip.bottom;
    const stripDepthIn = stripDepthFt * 12;

    // Determine strip label
    let stripLabel = '';
    if (si === 0 && hStrip.bottom === 0) stripLabel = 'Bottom Spandrel';
    else if (si === hStripYRanges.length - 1 && Math.abs(hStrip.top - panel.heightFt) < 0.001) stripLabel = 'Top Spandrel';
    else stripLabel = `Horizontal Strip ${si + 1}`;

    for (let pi = 0; pi < pierXRanges.length - 1; pi++) {
      const pier1 = pierXRanges[pi];
      const pier2 = pierXRanges[pi + 1];
      const cx1 = (pier1.left + pier1.right) / 2;
      const cx2 = (pier2.left + pier2.right) / 2;

      // Check if the path between these piers is solid at this strip level
      // (no opening between them at this Y range)
      const midX = (pier1.right + pier2.left) / 2;
      const midY = cy;
      const blocked = sortedOpenings.some(o => {
        const oLeft = o.centerXFt - o.widthFt / 2;
        const oRight = o.centerXFt + o.widthFt / 2;
        const oBot = o.centerYFt - o.heightFt / 2;
        const oTop = o.centerYFt + o.heightFt / 2;
        return midX > oLeft && midX < oRight && midY > oBot && midY < oTop;
      });

      if (!blocked) {
        const node1 = nodeMap.get(`${cx1.toFixed(6)},${cy.toFixed(6)}`)!;
        const node2 = nodeMap.get(`${cx2.toFixed(6)},${cy.toFixed(6)}`)!;

        const clLength = cx2 - cx1;
        const offsetStart = (pier1.right - pier1.left) / 2;
        const offsetEnd = (pier2.right - pier2.left) / 2;
        const flexLength = clLength - offsetStart - offsetEnd;

        if (flexLength <= 0) {
          errors.push(`Horizontal member from pier ${pi + 1} to pier ${pi + 2} at ${stripLabel} has non-positive flexible length.`);
          continue;
        }

        const pierLabel1 = pi === 0 ? 'Left Edge' : `Pier ${pi}`;
        const pierLabel2 = pi + 1 === pierXRanges.length - 1 ? 'Right Edge' : `Pier ${pi + 2}`;
        const label = `${stripLabel}, ${pierLabel1} to ${pierLabel2}`;

        members.push({
          id: memberIdCounter++,
          label,
          startNodeId: node1.id,
          endNodeId: node2.id,
          centerlineLengthFt: clLength,
          rigidOffsetStartFt: offsetStart,
          rigidOffsetEndFt: offsetEnd,
          flexibleLengthFt: flexLength,
          thicknessIn: defaultThicknessIn,
          thicknessOverridden: false,
          depthIn: stripDepthIn,
          areaIn2: defaultThicknessIn * stripDepthIn,
          inertiaIn4: defaultThicknessIn * Math.pow(stripDepthIn, 3) / 12,
          orientation: 'horizontal',
        });
      }
    }
  }

  // Create vertical members connecting horizontal strips along each pier
  for (let pi = 0; pi < pierXRanges.length; pi++) {
    const pier = pierXRanges[pi];
    const cx = (pier.left + pier.right) / 2;
    const pierWidthFt = pier.right - pier.left;
    const pierWidthIn = pierWidthFt * 12;

    let pierLabel = '';
    if (pi === 0) pierLabel = 'Left Pier';
    else if (pi === pierXRanges.length - 1) pierLabel = 'Right Pier';
    else pierLabel = `Pier ${pi + 1}`;

    for (let si = 0; si < hStripYRanges.length - 1; si++) {
      const strip1 = hStripYRanges[si];
      const strip2 = hStripYRanges[si + 1];
      const cy1 = (strip1.bottom + strip1.top) / 2;
      const cy2 = (strip2.bottom + strip2.top) / 2;

      // Check if this vertical path is blocked by an opening
      const midY = (strip1.top + strip2.bottom) / 2;
      const blocked = sortedOpenings.some(o => {
        const oLeft = o.centerXFt - o.widthFt / 2;
        const oRight = o.centerXFt + o.widthFt / 2;
        const oBot = o.centerYFt - o.heightFt / 2;
        const oTop = o.centerYFt + o.heightFt / 2;
        return cx > oLeft && cx < oRight && midY > oBot && midY < oTop;
      });

      if (!blocked) {
        const node1 = nodeMap.get(`${cx.toFixed(6)},${cy1.toFixed(6)}`)!;
        const node2 = nodeMap.get(`${cx.toFixed(6)},${cy2.toFixed(6)}`)!;

        const clLength = cy2 - cy1;
        const offsetStart = (strip1.top - strip1.bottom) / 2;
        const offsetEnd = (strip2.top - strip2.bottom) / 2;
        const flexLength = clLength - offsetStart - offsetEnd;

        if (flexLength <= 0) {
          errors.push(`Vertical member ${pierLabel} between strip ${si + 1} and strip ${si + 2} has non-positive flexible length.`);
          continue;
        }

        const stripLabel1 = si === 0 && strip1.bottom === 0 ? 'Sill' : `Strip ${si + 1}`;
        const stripLabel2 = si + 1 === hStripYRanges.length - 1 && Math.abs(strip2.top - panel.heightFt) < 0.001 ? 'Header' : `Strip ${si + 2}`;
        const label = `${pierLabel}, ${stripLabel1} to ${stripLabel2}`;

        members.push({
          id: memberIdCounter++,
          label,
          startNodeId: node1.id,
          endNodeId: node2.id,
          centerlineLengthFt: clLength,
          rigidOffsetStartFt: offsetStart,
          rigidOffsetEndFt: offsetEnd,
          flexibleLengthFt: flexLength,
          thicknessIn: defaultThicknessIn,
          thicknessOverridden: false,
          depthIn: pierWidthIn,
          areaIn2: defaultThicknessIn * pierWidthIn,
          inertiaIn4: defaultThicknessIn * Math.pow(pierWidthIn, 3) / 12,
          orientation: 'vertical',
        });
      }
    }
  }

  // Add support nodes
  // Find the bottom spandrel centerline Y
  const bottomStripY = hStripYRanges.length > 0 ? (hStripYRanges[0].bottom + hStripYRanges[0].top) / 2 : 0;

  // Find nearest joint nodes along the bottom spandrel for each support
  const bottomStripDepthFt = hStripYRanges.length > 0 ? hStripYRanges[0].top - hStripYRanges[0].bottom : panel.heightFt;
  const bottomStripDepthIn = bottomStripDepthFt * 12;

  /** Helper: find the pier that a node belongs to (by its centerline x) */
  function findPierForNode(nodeX: number) {
    return pierXRanges.find(p => Math.abs((p.left + p.right) / 2 - nodeX) < 0.001);
  }

  /** Helper: create a horizontal bottom-strip member between two nodes */
  function makeBottomMember(
    startNodeId: number, endNodeId: number,
    dist: number, offsetStart: number, offsetEnd: number,
    memberLabel: string
  ) {
    const flexLen = dist - offsetStart - offsetEnd;
    if (flexLen <= 0.001) return; // skip degenerate members
    members.push({
      id: memberIdCounter++,
      label: memberLabel,
      startNodeId,
      endNodeId,
      centerlineLengthFt: dist,
      rigidOffsetStartFt: offsetStart,
      rigidOffsetEndFt: offsetEnd,
      flexibleLengthFt: flexLen,
      thicknessIn: defaultThicknessIn,
      thicknessOverridden: false,
      depthIn: bottomStripDepthIn,
      areaIn2: defaultThicknessIn * bottomStripDepthIn,
      inertiaIn4: defaultThicknessIn * Math.pow(bottomStripDepthIn, 3) / 12,
      orientation: 'horizontal',
    });
  }

  function addSupportWithConnector(supportXFt: number, restraints: { dx: boolean; dy: boolean; rz: boolean }, label: string) {
    // Case 1: Check if the support coincides with an existing pier centerline node
    for (const pier of pierXRanges) {
      const pierCx = (pier.left + pier.right) / 2;
      if (Math.abs(supportXFt - pierCx) < 0.001) {
        const pierNode = nodeMap.get(`${pierCx.toFixed(6)},${bottomStripY.toFixed(6)}`);
        if (pierNode) {
          pierNode.restraints.dx = pierNode.restraints.dx || restraints.dx;
          pierNode.restraints.dy = pierNode.restraints.dy || restraints.dy;
          pierNode.restraints.rz = pierNode.restraints.rz || restraints.rz;
          return;
        }
      }
    }

    // Create the support node
    const supportNode = getOrCreateNode(supportXFt, bottomStripY, restraints);

    // Case 2: Support is within a pier's rigid zone (but not at centerline)
    // Add a rigid-link member from pier centerline to support (zero rigid offsets;
    // the short length + full cross-section makes it naturally very stiff)
    const containingPier = pierXRanges.find(p => supportXFt >= p.left - 0.001 && supportXFt <= p.right + 0.001);
    if (containingPier) {
      const pierCx = (containingPier.left + containingPier.right) / 2;
      const pierNode = nodeMap.get(`${pierCx.toFixed(6)},${bottomStripY.toFixed(6)}`);
      if (pierNode && pierNode.id !== supportNode.id) {
        const dist = Math.abs(supportXFt - pierCx);
        const [startId, endId] = supportXFt < pierCx
          ? [supportNode.id, pierNode.id]
          : [pierNode.id, supportNode.id];
        members.push({
          id: memberIdCounter++,
          label: `${label} Rigid Link`,
          startNodeId: startId,
          endNodeId: endId,
          centerlineLengthFt: dist,
          rigidOffsetStartFt: 0,
          rigidOffsetEndFt: 0,
          flexibleLengthFt: dist,
          thicknessIn: defaultThicknessIn,
          thicknessOverridden: false,
          depthIn: bottomStripDepthIn,
          areaIn2: defaultThicknessIn * bottomStripDepthIn,
          inertiaIn4: defaultThicknessIn * Math.pow(bottomStripDepthIn, 3) / 12,
          orientation: 'horizontal',
        });
        return;
      }
    }

    // Case 3: Support is between piers (in or near the flexible span)
    // Find the bottom-strip member that spans across this x position and split it
    const spanningIdx = members.findIndex(m => {
      if (m.orientation !== 'horizontal') return false;
      const sn = nodes.find(n => n.id === m.startNodeId)!;
      const en = nodes.find(n => n.id === m.endNodeId)!;
      if (Math.abs(sn.y - bottomStripY) > 0.001 || Math.abs(en.y - bottomStripY) > 0.001) return false;
      const minX = Math.min(sn.x, en.x);
      const maxX = Math.max(sn.x, en.x);
      return supportXFt > minX + 0.001 && supportXFt < maxX - 0.001;
    });

    if (spanningIdx >= 0) {
      const spanning = members[spanningIdx];
      const sn = nodes.find(n => n.id === spanning.startNodeId)!;
      const en = nodes.find(n => n.id === spanning.endNodeId)!;
      const [leftNode, rightNode] = sn.x < en.x ? [sn, en] : [en, sn];

      const leftPier = findPierForNode(leftNode.x);
      const rightPier = findPierForNode(rightNode.x);
      const leftOffset = leftPier ? (leftPier.right - leftPier.left) / 2 : 0;
      const rightOffset = rightPier ? (rightPier.right - rightPier.left) / 2 : 0;

      // Remove the old spanning member
      members.splice(spanningIdx, 1);

      // Left sub-member: leftNode → support
      const distLeft = supportXFt - leftNode.x;
      makeBottomMember(leftNode.id, supportNode.id, distLeft, leftOffset, 0, `${label} Span Left`);

      // Right sub-member: support → rightNode
      const distRight = rightNode.x - supportXFt;
      makeBottomMember(supportNode.id, rightNode.id, distRight, 0, rightOffset, `${label} Span Right`);

      return;
    }

    // Case 4: Support is beyond the outermost pier nodes (cantilever/extension)
    // Connect to the nearest bottom-strip node
    const bottomNodes = nodes.filter(n =>
      Math.abs(n.y - bottomStripY) < 0.001 && n.id !== supportNode.id
    );
    if (bottomNodes.length === 0) return;

    const nearest = bottomNodes.reduce((best, n) =>
      Math.abs(n.x - supportXFt) < Math.abs(best.x - supportXFt) ? n : best
    );
    const dist = Math.abs(supportXFt - nearest.x);
    if (dist < 0.001) {
      // Coincident - merge restraints
      nearest.restraints.dx = nearest.restraints.dx || restraints.dx;
      nearest.restraints.dy = nearest.restraints.dy || restraints.dy;
      nearest.restraints.rz = nearest.restraints.rz || restraints.rz;
      const idx = nodes.indexOf(supportNode);
      if (idx >= 0 && supportNode.id !== nearest.id) nodes.splice(idx, 1);
      return;
    }

    const nearPier = findPierForNode(nearest.x);
    const nearOffset = nearPier ? (nearPier.right - nearPier.left) / 2 : 0;
    const [startId, endId] = supportXFt < nearest.x
      ? [supportNode.id, nearest.id]
      : [nearest.id, supportNode.id];
    const startOffset = supportXFt < nearest.x ? 0 : nearOffset;
    const endOffset = supportXFt < nearest.x ? nearOffset : 0;
    makeBottomMember(startId, endId, dist, startOffset, endOffset, `${label} Extension`);
  }

  // Left support: pin (dx, dy restrained)
  addSupportWithConnector(supports.leftXFt, { dx: true, dy: true, rz: false }, 'Left Support');
  // Right support: roller (dy restrained)
  addSupportWithConnector(supports.rightXFt, { dx: false, dy: true, rz: false }, 'Right Support');

  // Now handle the case where supports split an existing bottom spandrel member
  // Remove any duplicate/overlapping horizontal members on the bottom strip
  // This happens when the support connector replaces part of an existing member
  // Clean up: ensure no two horizontal members on the bottom strip share the same start/end pair
  // Apply thickness overrides from existing members (matching by label)
  if (existingMembers) {
    for (const member of members) {
      const existing = existingMembers.find(m => m.label === member.label && m.thicknessOverridden);
      if (existing) {
        member.thicknessIn = existing.thicknessIn;
        member.thicknessOverridden = true;
        member.areaIn2 = member.thicknessIn * member.depthIn;
        member.inertiaIn4 = member.thicknessIn * Math.pow(member.depthIn, 3) / 12;
      }
    }
  }

  if (errors.length > 0) {
    return { nodes: [], members: [], validationErrors: errors, validationWarnings: warnings };
  }

  // Renumber nodes and members sequentially
  nodes.sort((a, b) => a.y - b.y || a.x - b.x);
  const nodeIdMap = new Map<number, number>();
  nodes.forEach((n, i) => {
    nodeIdMap.set(n.id, i + 1);
    n.id = i + 1;
  });
  members.forEach((m, i) => {
    m.id = i + 1;
    m.startNodeId = nodeIdMap.get(m.startNodeId) ?? m.startNodeId;
    m.endNodeId = nodeIdMap.get(m.endNodeId) ?? m.endNodeId;
  });

  return { nodes, members, validationErrors: errors, validationWarnings: warnings };
}
