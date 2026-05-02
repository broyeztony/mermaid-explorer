import mermaid from "mermaid";

import { examples } from "./examples.js";
import "./styles.css";

const dom = {
  instructionsModal: document.querySelector("#instructionsModal"),
  instructionsCloseBtn: document.querySelector("#instructionsCloseBtn"),
  nodeSearchShell: document.querySelector("#nodeSearchShell"),
  nodeSearchInput: document.querySelector("#nodeSearchInput"),
  nodeSearchResults: document.querySelector("#nodeSearchResults"),
  subgraphQueryInput: document.querySelector("#subgraphQueryInput"),
  subgraphQueryClearBtn: document.querySelector("#subgraphQueryClearBtn"),
  subgraphQueryStatus: document.querySelector("#subgraphQueryStatus"),
  panModeBtn: document.querySelector("#panModeBtn"),
  boxModeBtn: document.querySelector("#boxModeBtn"),
  fitBtn: document.querySelector("#fitBtn"),
  sourceInput: document.querySelector("#sourceInput"),
  nodeCountBadge: document.querySelector("#nodeCountBadge"),
  edgeCountBadge: document.querySelector("#edgeCountBadge"),
  zoomBadge: document.querySelector("#zoomBadge"),
  viewerCaption: document.querySelector("#viewerCaption"),
  viewer: document.querySelector("#viewer"),
  viewportSurface: document.querySelector("#viewportSurface"),
  graphHost: document.querySelector("#graphHost"),
  selectionBox: document.querySelector("#selectionBox"),
  emptyState: document.querySelector("#emptyState"),
  minimapHost: document.querySelector("#minimapHost"),
};

const state = {
  mode: "pan",
  rawBounds: null,
  fitBounds: null,
  viewBox: null,
  svg: null,
  minimapSvg: null,
  minimapFrame: null,
  minimapFrameShadow: null,
  searchIndex: [],
  searchMatches: [],
  activeSearchIndex: -1,
  renderedSource: "",
  sourceGraphModel: null,
  subgraphQueryState: null,
  focusedNode: null,
  interaction: null,
  animationFrame: 0,
  renderDebounceTimer: 0,
  renderToken: 0,
  returnFocusTarget: null,
  spacePressed: false,
};

const fontsReady = document.fonts?.ready ?? Promise.resolve();

mermaid.initialize({
  startOnLoad: false,
  securityLevel: "strict",
  maxTextSize: 50000,
  maxEdges: 500,
  theme: "base",
  flowchart: {
    htmlLabels: true,
    nodeSpacing: 56,
    rankSpacing: 84,
    curve: "monotoneX",
    padding: 22,
  },
  themeVariables: {
    fontFamily: '"Manrope", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif',
    primaryColor: "#fffaf3",
    primaryBorderColor: "#565d76",
    primaryTextColor: "#283041",
    lineColor: "#766f93",
    secondaryColor: "#f4effa",
    tertiaryColor: "#fffaf3",
    clusterBkg: "#f4effa",
    clusterBorder: "#d5c7e7",
    edgeLabelBackground: "#faf7ff",
    background: "#ffffff",
  },
});

init();

function init() {
  wireEvents();
  applyMode("pan");
  loadExample(examples[0].id);
  requestAnimationFrame(() => openInstructionsModal());
}

function wireEvents() {
  dom.instructionsCloseBtn.addEventListener("click", () => closeInstructionsModal());
  dom.instructionsModal.addEventListener("click", (event) => {
    if (event.target === dom.instructionsModal) {
      closeInstructionsModal();
    }
  });

  dom.sourceInput.addEventListener("input", scheduleRenderDiagram);
  dom.sourceInput.addEventListener("keydown", onSourceInputKeyDown);
  dom.subgraphQueryInput.addEventListener("input", onSubgraphQueryInput);
  dom.subgraphQueryClearBtn.addEventListener("click", clearSubgraphQuery);
  dom.nodeSearchInput.addEventListener("input", syncNodeSearchResults);
  dom.nodeSearchInput.addEventListener("focus", syncNodeSearchResults);
  dom.nodeSearchInput.addEventListener("keydown", onNodeSearchKeyDown);
  dom.nodeSearchInput.addEventListener("blur", () => {
    requestAnimationFrame(() => {
      if (!dom.nodeSearchShell.matches(":focus-within")) {
        hideNodeSearchResults();
      }
    });
  });
  dom.nodeSearchResults.addEventListener("pointerdown", (event) => {
    event.preventDefault();
  });
  dom.nodeSearchResults.addEventListener("click", onNodeSearchResultClick);

  dom.panModeBtn.addEventListener("click", () => applyMode("pan"));
  dom.boxModeBtn.addEventListener("click", () => applyMode("box"));

  dom.fitBtn.addEventListener("click", () => fitToGraph(true));

  dom.viewportSurface.addEventListener("wheel", onWheel, { passive: false });
  dom.viewportSurface.addEventListener("dblclick", onDoubleClick);
  dom.viewportSurface.addEventListener("focus", flushRenderDiagram);
  dom.viewportSurface.addEventListener("pointerdown", onPointerDown);
  dom.viewportSurface.addEventListener("pointermove", onPointerMove);
  dom.viewportSurface.addEventListener("pointerup", onPointerUp);
  dom.viewportSurface.addEventListener("pointercancel", cancelInteraction);
  dom.viewportSurface.addEventListener("lostpointercapture", cancelInteraction);

  dom.minimapHost.addEventListener("pointerdown", onMinimapPointerDown);

  window.addEventListener("keydown", onKeyDown);
  window.addEventListener("keyup", onKeyUp);
  document.addEventListener("pointerdown", onDocumentPointerDown);

  const resizeObserver = new ResizeObserver(() => {
    if (!state.viewBox || !state.rawBounds) {
      return;
    }

    state.fitBounds = fitRectToViewport(state.rawBounds);
    state.viewBox = constrainViewBox(adjustRectToAspect(state.viewBox, getViewerAspect()));
    commitViewBox();
    rebuildMinimap();
  });

  resizeObserver.observe(dom.viewportSurface);
}

function loadExample(exampleId) {
  const example = examples.find((item) => item.id === exampleId);

  if (!example) {
    return;
  }

  dom.sourceInput.value = example.source;
  dom.subgraphQueryInput.value = "";
  syncSubgraphQueryUi(getInactiveSubgraphQueryState());
  renderDiagram();
}

function scheduleRenderDiagram() {
  window.clearTimeout(state.renderDebounceTimer);
  state.renderDebounceTimer = window.setTimeout(() => {
    state.renderDebounceTimer = 0;
    renderDiagram();
  }, 180);
}

function flushRenderDiagram() {
  if (!state.renderDebounceTimer) {
    return;
  }

  window.clearTimeout(state.renderDebounceTimer);
  state.renderDebounceTimer = 0;
  renderDiagram();
}

function onSourceInputKeyDown(event) {
  if (event.key !== "Escape") {
    return;
  }

  event.preventDefault();
  flushRenderDiagram();
  dom.sourceInput.blur();
  dom.viewportSurface.focus({ preventScroll: true });
}

function onSubgraphQueryInput() {
  syncSubgraphQueryUi();
  scheduleRenderDiagram();
}

function clearSubgraphQuery() {
  if (!dom.subgraphQueryInput.value) {
    return;
  }

  dom.subgraphQueryInput.value = "";
  syncSubgraphQueryUi(getInactiveSubgraphQueryState());
  renderDiagram();
  dom.subgraphQueryInput.focus({ preventScroll: true });
}

async function renderDiagram() {
  const fullSource = dom.sourceInput.value.trim();

  if (!fullSource) {
    clearDiagramState();
    syncSubgraphQueryUi(getInactiveSubgraphQueryState());
    setStatus("Paste Mermaid text to render.", "Awaiting diagram");
    return;
  }

  const queryState = buildSubgraphQueryState(fullSource, dom.subgraphQueryInput.value);
  const source = queryState.mode === "active"
    ? queryState.source
    : fullSource;

  const renderToken = ++state.renderToken;
  cancelAnimation();
  setStatus("Rendering diagram...", "Rendering");
  syncSubgraphQueryUi(queryState);

  try {
    await fontsReady;

    const renderId = `mermaid-explorer-${renderToken}`;
    const { svg } = await mermaid.render(renderId, source);

    if (renderToken !== state.renderToken) {
      return;
    }

    const svgElement = parseAndSanitizeSvg(svg);

    if (!svgElement) {
      throw new Error("Mermaid did not return an SVG.");
    }

    dom.graphHost.replaceChildren(svgElement);
    prepareSvg(svgElement);
    await nextFrame();

    const graphBounds = computeGraphBounds(svgElement);
    state.rawBounds = padRect(graphBounds, Math.max(graphBounds.width, graphBounds.height) * 0.06 + 24);
    state.fitBounds = fitRectToViewport(state.rawBounds);
    state.viewBox = { ...state.fitBounds };
    state.renderedSource = source;
    state.sourceGraphModel = queryState.graphModel ?? extractFlowchartModel(fullSource);
    state.subgraphQueryState = queryState;
    commitViewBox();
    indexDiagramNodes();
    updateDiagramMetrics();
    rebuildMinimap();
    setViewerEmpty(false);
    syncNodeSearchResults();
    setStatus("Ready for navigation.", "Ready");
  } catch (error) {
    console.error(error);
    clearDiagramState();
    state.subgraphQueryState = queryState;
    syncSubgraphQueryUi({
      ...queryState,
      mode: "invalid",
      message: error.message,
      source: fullSource,
    });
    setStatus(error.message, "Render failed");
  }
}

function clearDiagramState() {
  setViewerEmpty(true);
  state.svg = null;
  state.rawBounds = null;
  state.fitBounds = null;
  state.viewBox = null;
  state.minimapSvg = null;
  state.minimapFrame = null;
  state.minimapFrameShadow = null;
  state.renderedSource = "";
  state.sourceGraphModel = null;
  state.subgraphQueryState = null;
  dom.graphHost.innerHTML = "";
  dom.minimapHost.innerHTML = "";
  setDiagramMetrics(0, 0);
  dom.zoomBadge.textContent = "100%";
  clearNodeSearchIndex();
}

function getInactiveSubgraphQueryState() {
  return {
    mode: "inactive",
    source: "",
    graphModel: null,
    message: 'Filter the viewport with a flowchart query. Defaults: direction:out depth:1.',
  };
}

function syncSubgraphQueryUi(queryState = null) {
  const nextState = queryState ?? buildSubgraphQueryState(dom.sourceInput.value.trim(), dom.subgraphQueryInput.value);
  const hasValue = Boolean(dom.subgraphQueryInput.value.trim());

  dom.subgraphQueryClearBtn.hidden = !hasValue;
  dom.subgraphQueryInput.classList.toggle("is-active", nextState.mode === "active");
  dom.subgraphQueryInput.classList.toggle("is-invalid", nextState.mode === "invalid");
  dom.subgraphQueryStatus.textContent = nextState.message;
  dom.subgraphQueryStatus.classList.toggle("is-active", nextState.mode === "active");
  dom.subgraphQueryStatus.classList.toggle("is-error", nextState.mode === "invalid");
}

function buildSubgraphQueryState(source, rawQuery) {
  const inactiveState = getInactiveSubgraphQueryState();

  if (!source) {
    return inactiveState;
  }

  const parsedQuery = parseSubgraphQuery(rawQuery);

  if (parsedQuery.mode === "inactive") {
    return {
      ...inactiveState,
      source,
    };
  }

  if (parsedQuery.mode !== "active") {
    return {
      ...parsedQuery,
      source,
      graphModel: null,
    };
  }

  const graphModel = extractFlowchartModel(source);

  if (!graphModel) {
    return {
      mode: "invalid",
      source,
      graphModel: null,
      message: "Subgraph query currently supports Mermaid flowcharts only.",
    };
  }

  const seedNodeIds = findSeedNodeIds(graphModel, parsedQuery.seed);

  if (!seedNodeIds.length) {
    return {
      mode: "invalid",
      source,
      graphModel,
      message: `No node matches "${parsedQuery.seed}".`,
    };
  }

  const selection = selectSubgraph(graphModel, seedNodeIds, parsedQuery.direction, parsedQuery.depth);
  const filteredSource = buildFilteredFlowchartSource(graphModel, selection);

  return {
    mode: "active",
    source: filteredSource,
    graphModel,
    seed: parsedQuery.seed,
    direction: parsedQuery.direction,
    depth: parsedQuery.depth,
    nodeCount: selection.nodeIds.size,
    edgeCount: selection.edges.length,
    message: `Showing ${selection.nodeIds.size} nodes and ${selection.edges.length} edges from "${parsedQuery.seed}".`,
  };
}

function parseSubgraphQuery(rawQuery) {
  const query = `${rawQuery ?? ""}`.trim();

  if (!query) {
    return getInactiveSubgraphQueryState();
  }

  const tokenPattern = /([a-z]+)\s*:\s*(?:"([^"]*)"|'([^']*)'|([^\s]+))/gi;
  const tokens = new Map();

  for (const match of query.matchAll(tokenPattern)) {
    const key = match[1].toLowerCase();
    const value = `${match[2] ?? match[3] ?? match[4] ?? ""}`.trim();

    if (tokens.has(key)) {
      return {
        mode: "invalid",
        message: `Duplicate "${key}" in query.`,
      };
    }

    tokens.set(key, value);
  }

  const leftovers = query.replace(tokenPattern, " ").trim();

  if (leftovers) {
    return {
      mode: "draft",
      message: 'Use seed:"Customer Web". Optional: direction:out|in|both depth:1.',
    };
  }

  const seed = tokens.get("seed");
  const direction = `${tokens.get("direction") ?? "out"}`.toLowerCase();
  const depthRaw = `${tokens.get("depth") ?? "1"}`.trim();

  if (!seed) {
    return {
      mode: "draft",
      message: 'Use seed:"Customer Web". Optional: direction:out|in|both depth:1.',
    };
  }

  if (!["out", "in", "both"].includes(direction)) {
    return {
      mode: "invalid",
      message: 'Direction must be "out", "in", or "both".',
    };
  }

  const depth = Number.parseInt(depthRaw, 10);

  if (!Number.isFinite(depth) || depth < 0) {
    return {
      mode: "invalid",
      message: "Depth must be a whole number starting at 0.",
    };
  }

  return {
    mode: "active",
    seed,
    direction,
    depth,
    message: "",
  };
}

function extractFlowchartModel(source) {
  const lines = `${source ?? ""}`.split("\n");
  const header = lines.find((line) => /^\s*(flowchart|graph)\b/i.test(line))?.trim();

  if (!header) {
    return null;
  }

  const model = {
    header,
    nodeMap: new Map(),
    nodeOrder: [],
    edges: [],
  };

  for (const rawLine of lines) {
    const line = rawLine.trim();

    if (
      !line
      || line.startsWith("%%")
      || /^(flowchart|graph)\b/i.test(line)
      || /^subgraph\b/i.test(line)
      || /^direction\b/i.test(line)
      || line === "end"
    ) {
      continue;
    }

    const edgeChain = parseEdgeChain(line);

    if (edgeChain) {
      for (const ref of edgeChain.refs) {
        registerGraphNode(model, ref);
      }

      for (const edge of edgeChain.edges) {
        model.edges.push({
          ...edge,
          key: `edge-${model.edges.length}`,
        });
      }

      continue;
    }

    const nodeRef = parseNodeReferenceAt(line, 0);

    if (nodeRef && line.slice(nodeRef.end).trim() === "") {
      registerGraphNode(model, nodeRef);
    }
  }

  return model;
}

function registerGraphNode(model, ref) {
  const existing = model.nodeMap.get(ref.id);
  const explicit = ref.hasShape;
  const definition = explicit
    ? ref.definition
    : defaultNodeDefinition(ref.id, ref.label || ref.id);
  const label = ref.label || existing?.label || ref.id;

  if (!existing) {
    model.nodeMap.set(ref.id, {
      id: ref.id,
      label,
      definition,
      explicit,
    });
    model.nodeOrder.push(ref.id);
    return;
  }

  if (explicit && !existing.explicit) {
    existing.label = label;
    existing.definition = definition;
    existing.explicit = true;
    return;
  }

  if (!existing.label && label) {
    existing.label = label;
  }
}

function parseEdgeChain(line) {
  const refs = [];
  const first = parseNodeReferenceAt(line, 0);

  if (!first) {
    return null;
  }

  refs.push(first);

  let current = first;
  let cursor = first.end;
  const edges = [];

  while (true) {
    const link = findNextEdgeLink(line, cursor);

    if (!link) {
      break;
    }

    refs.push(link.node);
    edges.push({
      leftId: current.id,
      rightId: link.node.id,
      sourceId: link.direction === "reverse" ? link.node.id : current.id,
      targetId: link.direction === "reverse" ? current.id : link.node.id,
      operator: link.operator,
      direction: link.direction,
    });
    current = link.node;
    cursor = link.node.end;
  }

  return edges.length ? { refs, edges } : null;
}

function findNextEdgeLink(line, fromIndex) {
  const remainder = line.slice(fromIndex);
  const operatorPatterns = [
    /^\s*(<?[ox]?[-.=]+\s+[^<>|]+?\s+[-.=]+[ox]?>)\s*/,
    /^\s*(<?[ox]?[-.=]+[ox]?>\|[^|]+\|)\s*/,
    /^\s*(<?[ox]?[-.=]+[ox]?>)\s*/,
  ];

  for (const pattern of operatorPatterns) {
    const match = remainder.match(pattern);

    if (!match) {
      continue;
    }

    const operator = normalizeEdgeOperator(match[1]);
    const nodeStart = fromIndex + match[0].length;
    const node = parseNodeReferenceAt(line, nodeStart);

    if (!node || !isValidEdgeOperator(operator)) {
      continue;
    }

    return {
      node,
      operator,
      direction: getEdgeDirection(operator),
    };
  }

  return null;
}

function parseNodeReferenceAt(line, startIndex) {
  const leadingLength = line.slice(startIndex).match(/^\s*/)?.[0].length ?? 0;
  const cursor = startIndex + leadingLength;
  const idMatch = /^[A-Za-z_][\w-]*/.exec(line.slice(cursor));

  if (!idMatch) {
    return null;
  }

  const id = idMatch[0];
  const afterId = cursor + id.length;
  const shape = parseNodeShape(line, afterId);
  const end = shape?.end ?? afterId;

  return {
    id,
    label: shape?.label ?? "",
    definition: line.slice(cursor, end).trim(),
    start: cursor,
    end,
    hasShape: Boolean(shape),
  };
}

function parseNodeShape(line, startIndex) {
  const spacing = line.slice(startIndex).match(/^\s*/)?.[0].length ?? 0;
  const cursor = startIndex + spacing;
  const shapePairs = [
    ["((", "))"],
    ["[[", "]]"],
    ["{{", "}}"],
    ["[", "]"],
    ["(", ")"],
    ["{", "}"],
  ];

  for (const [open, close] of shapePairs) {
    if (!line.startsWith(open, cursor)) {
      continue;
    }

    const closeIndex = line.indexOf(close, cursor + open.length);

    if (closeIndex < 0) {
      return null;
    }

    const end = closeIndex + close.length;
    const rawInner = line.slice(cursor + open.length, closeIndex).trim();

    return {
      end,
      label: unwrapNodeLabel(rawInner),
    };
  }

  return null;
}

function unwrapNodeLabel(value) {
  const label = `${value ?? ""}`.trim();

  if (
    (label.startsWith('"') && label.endsWith('"'))
    || (label.startsWith("'") && label.endsWith("'"))
  ) {
    return label.slice(1, -1).trim();
  }

  return label;
}

function normalizeEdgeOperator(value) {
  return `${value ?? ""}`
    .replace(/\s+/g, " ")
    .trim();
}

function isValidEdgeOperator(operator) {
  return (
    /[<>]/.test(operator)
    && (
      /^(?:<?[ox]?[-.=]+[ox]?>)$/.test(operator)
      || /^(?:<?[ox]?[-.=]+[ox]?>\|[^|]+\|)$/.test(operator)
      || /^(?:<?[ox]?[-.=]+\s+[^<>|]+?\s+[-.=]+[ox]?>)$/.test(operator)
    )
  );
}

function getEdgeDirection(operator) {
  const hasLeftArrow = operator.includes("<");
  const hasRightArrow = operator.includes(">");

  if (hasLeftArrow && hasRightArrow) {
    return "both";
  }

  return hasLeftArrow ? "reverse" : "forward";
}

function defaultNodeDefinition(id, label) {
  return `${id}["${escapeMermaidLabel(label)}"]`;
}

function escapeMermaidLabel(label) {
  return `${label ?? ""}`.replace(/"/g, '\\"');
}

function findSeedNodeIds(graphModel, rawSeed) {
  const seed = normalizeSearchText(rawSeed);
  const exactLabelMatches = graphModel.nodeOrder
    .map((id) => graphModel.nodeMap.get(id))
    .filter((node) => normalizeSearchText(node.label) === seed)
    .map((node) => node.id);

  if (exactLabelMatches.length) {
    return exactLabelMatches;
  }

  return graphModel.nodeOrder.filter((id) => normalizeSearchText(id) === seed);
}

function selectSubgraph(graphModel, seedNodeIds, direction, depth) {
  const outgoing = new Map();
  const incoming = new Map();

  for (const edge of graphModel.edges) {
    pushAdjacency(outgoing, edge.sourceId, { edge, nextId: edge.targetId });
    pushAdjacency(incoming, edge.targetId, { edge, nextId: edge.sourceId });

    if (edge.direction === "both") {
      pushAdjacency(outgoing, edge.targetId, { edge, nextId: edge.sourceId });
      pushAdjacency(incoming, edge.sourceId, { edge, nextId: edge.targetId });
    }
  }

  const nodeIds = new Set(seedNodeIds);
  const seenDepth = new Map(seedNodeIds.map((id) => [id, 0]));
  const traversedEdgeKeys = new Set();
  const queue = seedNodeIds.map((id) => ({ id, depth: 0 }));

  while (queue.length) {
    const current = queue.shift();

    if (!current || current.depth >= depth) {
      continue;
    }

    const nextSteps = [];

    if (direction === "out" || direction === "both") {
      nextSteps.push(...(outgoing.get(current.id) ?? []));
    }

    if (direction === "in" || direction === "both") {
      nextSteps.push(...(incoming.get(current.id) ?? []));
    }

    for (const step of nextSteps) {
      const nextDepth = current.depth + 1;
      const previousDepth = seenDepth.get(step.nextId);

      if (nextDepth <= depth) {
        traversedEdgeKeys.add(step.edge.key);
      }

      if (previousDepth != null && previousDepth <= nextDepth) {
        continue;
      }

      seenDepth.set(step.nextId, nextDepth);
      nodeIds.add(step.nextId);
      queue.push({ id: step.nextId, depth: nextDepth });
    }
  }

  const edges = graphModel.edges.filter((edge) => traversedEdgeKeys.has(edge.key));
  return { nodeIds, edges };
}

function pushAdjacency(map, key, value) {
  if (!map.has(key)) {
    map.set(key, []);
  }

  map.get(key).push(value);
}

function buildFilteredFlowchartSource(graphModel, selection) {
  const lines = [graphModel.header, ""];
  const selectedNodeIds = graphModel.nodeOrder.filter((id) => selection.nodeIds.has(id));

  for (const id of selectedNodeIds) {
    const node = graphModel.nodeMap.get(id);
    lines.push(`  ${node.definition}`);
  }

  if (selection.edges.length) {
    lines.push("");

    for (const edge of selection.edges) {
      lines.push(`  ${edge.leftId} ${edge.operator} ${edge.rightId}`);
    }
  }

  return lines.join("\n");
}

function parseAndSanitizeSvg(svgMarkup) {
  const parser = new DOMParser();
  const documentRoot = parser.parseFromString(svgMarkup, "image/svg+xml");
  let svgElement = null;

  if (!documentRoot.querySelector("parsererror")) {
    svgElement = documentRoot.documentElement;
  }

  // Mermaid labels can legitimately contain HTML that browsers accept inside
  // foreignObject, while an XML parser rejects it as invalid SVG.
  if (!svgElement || svgElement.nodeName.toLowerCase() !== "svg") {
    const htmlDocument = parser.parseFromString(svgMarkup, "text/html");
    svgElement = htmlDocument.querySelector("svg");
  }

  if (!svgElement || svgElement.nodeName.toLowerCase() !== "svg") {
    throw new Error("Mermaid returned invalid SVG.");
  }

  sanitizeSvgElement(svgElement);
  return document.importNode(svgElement, true);
}

function sanitizeSvgElement(root) {
  const blockedSelectors = [
    "script",
    "iframe",
    "object",
    "embed",
  ];

  for (const blockedNode of root.querySelectorAll(blockedSelectors.join(","))) {
    blockedNode.remove();
  }

  const urlAttributes = ["href", "xlink:href"];

  for (const element of root.querySelectorAll("*")) {
    for (const attribute of Array.from(element.attributes)) {
      const name = attribute.name.toLowerCase();
      const value = attribute.value.trim();

      if (name.startsWith("on")) {
        element.removeAttribute(attribute.name);
        continue;
      }

      if (urlAttributes.includes(name) && /^javascript:/i.test(value)) {
        element.removeAttribute(attribute.name);
      }
    }
  }
}

function prepareSvg(svg) {
  state.svg = svg;
  svg.classList.add("diagram-svg");
  svg.removeAttribute("width");
  svg.removeAttribute("height");
  svg.setAttribute("preserveAspectRatio", "xMidYMid meet");
  svg.setAttribute("role", "img");
  svg.setAttribute("aria-label", "Rendered Mermaid diagram");
  svg.setAttribute("shape-rendering", "geometricPrecision");
  svg.setAttribute("text-rendering", "optimizeLegibility");
  polishDiagramGeometry(svg);
}

function polishDiagramGeometry(svg) {
  for (const rect of svg.querySelectorAll(".node rect")) {
    rect.setAttribute("rx", "14");
    rect.setAttribute("ry", "14");
  }

  for (const rect of svg.querySelectorAll(".cluster rect")) {
    rect.setAttribute("rx", "18");
    rect.setAttribute("ry", "18");
  }

  for (const rect of svg.querySelectorAll(".edgeLabel rect, .labelBkg")) {
    rect.setAttribute("rx", "8");
    rect.setAttribute("ry", "8");
  }

  for (const path of svg.querySelectorAll(".edgePath path, .flowchart-link")) {
    path.setAttribute("stroke-linecap", "round");
    path.setAttribute("stroke-linejoin", "round");
  }
}

function indexDiagramNodes() {
  clearFocusedNode();
  state.searchMatches = [];
  state.activeSearchIndex = -1;

  if (!state.svg) {
    state.searchIndex = [];
    return;
  }

  const sourceNodes = extractSourceNodes(state.renderedSource);
  const renderedNodes = Array.from(state.svg.querySelectorAll(".node"));

  state.searchIndex = sourceNodes
    .map((node, index) => {
      const element = renderedNodes.find((candidate) => matchesRenderedNodeId(candidate.id, node.id));
      const label = node.label || extractNodeLabel(element);
      const searchText = normalizeSearchText(label);

      if (!element || !searchText) {
        return null;
      }

      return {
        key: `${node.id}-${index}`,
        id: node.id,
        label,
        searchText,
        words: searchText.split(/\s+/),
        element,
      };
    })
    .filter(Boolean);
}

function clearNodeSearchIndex() {
  state.searchIndex = [];
  state.searchMatches = [];
  state.activeSearchIndex = -1;
  clearFocusedNode();
  hideNodeSearchResults();
}

function updateDiagramMetrics() {
  if (!state.svg) {
    setDiagramMetrics(0, 0);
    return;
  }

  const nodeCount = state.svg.querySelectorAll(".node").length;
  const edgeCount = state.svg.querySelectorAll(".edgePath").length
    || state.svg.querySelectorAll(".flowchart-link").length;

  setDiagramMetrics(nodeCount, edgeCount);
}

function setDiagramMetrics(nodeCount, edgeCount) {
  dom.nodeCountBadge.textContent = `${formatMetricCount(nodeCount, "node")}`;
  dom.edgeCountBadge.textContent = `${formatMetricCount(edgeCount, "edge")}`;
}

function formatMetricCount(value, label) {
  return `${value} ${label}${value === 1 ? "" : "s"}`;
}

function extractNodeLabel(element) {
  return `${element.textContent ?? ""}`
    .replace(/\s+/g, " ")
    .trim();
}

function extractSourceNodes(source) {
  const seen = new Set();
  const nodes = [];
  const lines = `${source ?? ""}`.split("\n");
  const patterns = [
    /([A-Za-z_][\w-]*)\s*\(\(\s*"([^"]+)"\s*\)\)/g,
    /([A-Za-z_][\w-]*)\s*\(\(\s*([^()\n]+?)\s*\)\)/g,
    /([A-Za-z_][\w-]*)\s*\[\[\s*"([^"]+)"\s*\]\]/g,
    /([A-Za-z_][\w-]*)\s*\[\[\s*([^\]\n]+?)\s*\]\]/g,
    /([A-Za-z_][\w-]*)\s*\[\s*"([^"]+)"\s*\]/g,
    /([A-Za-z_][\w-]*)\s*\[\s*([^\]\n"]+?)\s*\]/g,
    /([A-Za-z_][\w-]*)\s*\(\s*"([^"]+)"\s*\)/g,
    /([A-Za-z_][\w-]*)\s*\(\s*([^()\n"]+?)\s*\)/g,
    /([A-Za-z_][\w-]*)\s*\{\{\s*"([^"]+)"\s*\}\}/g,
    /([A-Za-z_][\w-]*)\s*\{\{\s*([^}\n"]+?)\s*\}\}/g,
    /([A-Za-z_][\w-]*)\s*\{\s*"([^"]+)"\s*\}/g,
    /([A-Za-z_][\w-]*)\s*\{\s*([^}\n"]+?)\s*\}/g,
  ];

  for (const rawLine of lines) {
    const line = rawLine.trim();

    if (!line || line.startsWith("%%") || line.startsWith("subgraph ") || line === "end") {
      continue;
    }

    for (const pattern of patterns) {
      pattern.lastIndex = 0;

      for (const match of line.matchAll(pattern)) {
        const id = match[1];
        const label = `${match[2] ?? ""}`.trim();

        if (!id || !label || seen.has(id)) {
          continue;
        }

        seen.add(id);
        nodes.push({ id, label });
      }
    }
  }

  return nodes;
}

function matchesRenderedNodeId(renderedId, sourceId) {
  return `${renderedId ?? ""}`.includes(`-${sourceId}-`);
}

function normalizeSearchText(value) {
  return `${value ?? ""}`
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

function syncNodeSearchResults() {
  const query = normalizeSearchText(dom.nodeSearchInput.value);

  if (!query || !state.searchIndex.length) {
    state.searchMatches = [];
    state.activeSearchIndex = -1;
    hideNodeSearchResults();
    return;
  }

  state.searchMatches = getNodeSearchMatches(query);
  state.activeSearchIndex = state.searchMatches.length ? 0 : -1;
  renderNodeSearchResults(state.searchMatches);
}

function getNodeSearchMatches(query) {
  return state.searchIndex
    .filter((item) => item.searchText.includes(query))
    .sort((left, right) => {
      const leftRank = getNodeSearchRank(left, query);
      const rightRank = getNodeSearchRank(right, query);

      if (leftRank !== rightRank) {
        return leftRank - rightRank;
      }

      return left.label.localeCompare(right.label);
    })
    .slice(0, 12);
}

function getNodeSearchRank(item, query) {
  if (item.searchText === query) {
    return 0;
  }

  if (item.searchText.startsWith(query)) {
    return 1;
  }

  if (item.words.some((word) => word.startsWith(query))) {
    return 2;
  }

  return 3;
}

function renderNodeSearchResults(matches) {
  dom.nodeSearchResults.replaceChildren();

  const fragment = document.createDocumentFragment();

  if (!matches.length) {
    const empty = document.createElement("p");
    empty.className = "search-empty";
    empty.textContent = `No nodes match "${dom.nodeSearchInput.value.trim()}".`;
    fragment.append(empty);
  } else {
    for (const [index, match] of matches.entries()) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "search-result";
      button.id = `search-result-${index}`;
      button.dataset.nodeKey = match.key;
      button.dataset.resultIndex = `${index}`;
      button.setAttribute("aria-selected", index === state.activeSearchIndex ? "true" : "false");

      if (index === state.activeSearchIndex) {
        button.classList.add("is-active");
      }

      const label = document.createElement("span");
      label.className = "search-result-text";
      label.textContent = match.label;
      button.append(label);
      fragment.append(button);
    }
  }

  dom.nodeSearchResults.append(fragment);
  dom.nodeSearchResults.hidden = false;
  dom.nodeSearchShell.classList.add("is-open");
  dom.nodeSearchInput.setAttribute("aria-expanded", "true");
  updateActiveSearchResult(false);
}

function hideNodeSearchResults() {
  dom.nodeSearchResults.hidden = true;
  dom.nodeSearchResults.replaceChildren();
  dom.nodeSearchShell.classList.remove("is-open");
  dom.nodeSearchInput.setAttribute("aria-expanded", "false");
  dom.nodeSearchInput.removeAttribute("aria-activedescendant");
  state.activeSearchIndex = -1;
}

function updateActiveSearchResult(shouldScroll = true) {
  const results = Array.from(dom.nodeSearchResults.querySelectorAll(".search-result"));

  for (const [index, result] of results.entries()) {
    const isActive = index === state.activeSearchIndex;
    result.classList.toggle("is-active", isActive);
    result.setAttribute("aria-selected", isActive ? "true" : "false");

    if (isActive) {
      dom.nodeSearchInput.setAttribute("aria-activedescendant", result.id);

      if (shouldScroll) {
        result.scrollIntoView({ block: "nearest" });
      }
    }
  }

  if (state.activeSearchIndex < 0) {
    dom.nodeSearchInput.removeAttribute("aria-activedescendant");
  }
}

function onNodeSearchKeyDown(event) {
  if (event.key === "ArrowDown") {
    if (!state.searchMatches.length) {
      return;
    }

    event.preventDefault();

    if (dom.nodeSearchResults.hidden) {
      renderNodeSearchResults(state.searchMatches);
    }

    state.activeSearchIndex = Math.min(state.activeSearchIndex + 1, state.searchMatches.length - 1);
    updateActiveSearchResult();
    return;
  }

  if (event.key === "ArrowUp") {
    if (!state.searchMatches.length) {
      return;
    }

    event.preventDefault();

    if (dom.nodeSearchResults.hidden) {
      renderNodeSearchResults(state.searchMatches);
    }

    state.activeSearchIndex = state.activeSearchIndex <= 0
      ? state.searchMatches.length - 1
      : state.activeSearchIndex - 1;
    updateActiveSearchResult();
    return;
  }

  if (event.key === "Enter" && state.searchMatches.length) {
    event.preventDefault();
    const match = state.searchMatches[Math.max(state.activeSearchIndex, 0)];
    focusNodeMatch(match);
    return;
  }

  if (event.key === "Escape") {
    hideNodeSearchResults();
    dom.nodeSearchInput.blur();
  }
}

function onNodeSearchResultClick(event) {
  const button = event.target instanceof Element
    ? event.target.closest(".search-result")
    : null;

  if (!button) {
    return;
  }

  const match = state.searchMatches.find((item) => item.key === button.dataset.nodeKey);

  if (!match) {
    return;
  }

  state.activeSearchIndex = Number(button.dataset.resultIndex ?? -1);
  focusNodeMatch(match);
}

function onDocumentPointerDown(event) {
  if (!(event.target instanceof Node)) {
    return;
  }

  if (dom.nodeSearchShell.contains(event.target)) {
    return;
  }

  hideNodeSearchResults();
}

function focusNodeMatch(match) {
  if (!match) {
    return;
  }

  const target = match.element?.isConnected
    ? match
    : state.searchIndex.find((item) => item.key === match.key);

  if (!target?.element) {
    return;
  }

  const bounds = getNodeBounds(target.element);

  if (!bounds) {
    return;
  }

  setFocusedNode(target.element);
  setViewBox(buildNodeFocusRect(bounds), true);
  dom.nodeSearchInput.value = target.label;
  hideNodeSearchResults();
}

function buildNodeFocusRect(bounds) {
  const aspect = getViewerAspect();
  const centerX = bounds.x + bounds.width / 2;
  const centerY = bounds.y + bounds.height / 2;
  const minWidth = state.fitBounds ? state.fitBounds.width * 0.2 : bounds.width * 7;
  const contextualWidth = Math.max(bounds.width * 7, minWidth);
  const contextualHeight = Math.max(bounds.height * 5.5, contextualWidth / aspect);

  return adjustRectToAspect(
    {
      x: centerX - contextualWidth / 2,
      y: centerY - contextualHeight / 2,
      width: contextualWidth,
      height: contextualHeight,
    },
    aspect,
  );
}

function getNodeBounds(element) {
  if (!state.svg || !state.viewBox) {
    return null;
  }

  try {
    const svgRect = state.svg.getBoundingClientRect();
    const elementRect = element.getBoundingClientRect();

    if (
      svgRect.width > 0
      && svgRect.height > 0
      && elementRect.width > 0
      && elementRect.height > 0
    ) {
      const left = state.viewBox.x + ((elementRect.left - svgRect.left) / svgRect.width) * state.viewBox.width;
      const right = state.viewBox.x + ((elementRect.right - svgRect.left) / svgRect.width) * state.viewBox.width;
      const top = state.viewBox.y + ((elementRect.top - svgRect.top) / svgRect.height) * state.viewBox.height;
      const bottom = state.viewBox.y + ((elementRect.bottom - svgRect.top) / svgRect.height) * state.viewBox.height;

      return normalizeRect({
        x: Math.min(left, right),
        y: Math.min(top, bottom),
        width: Math.abs(right - left),
        height: Math.abs(bottom - top),
      });
    }
  } catch {}

  return null;
}

function setFocusedNode(element) {
  clearFocusedNode();

  if (!element) {
    return;
  }

  state.focusedNode = element;
  state.focusedNode.classList.add("is-search-target");
}

function clearFocusedNode() {
  if (!state.focusedNode?.isConnected) {
    state.focusedNode = null;
    return;
  }

  state.focusedNode.classList.remove("is-search-target");
  state.focusedNode = null;
}

function rebuildMinimap() {
  dom.minimapHost.innerHTML = "";
  state.minimapSvg = null;
  state.minimapFrame = null;
  state.minimapFrameShadow = null;

  if (!state.svg || !state.fitBounds) {
    return;
  }

  const minimapSvg = state.svg.cloneNode(true);
  minimapSvg.removeAttribute("aria-label");
  minimapSvg.setAttribute("viewBox", rectToString(state.fitBounds));
  minimapSvg.setAttribute("preserveAspectRatio", "xMidYMid meet");
  minimapSvg.classList.add("minimap-svg");

  const shadow = document.createElementNS("http://www.w3.org/2000/svg", "rect");
  shadow.setAttribute("class", "minimap-frame-shadow");
  shadow.setAttribute("rx", "16");
  shadow.setAttribute("ry", "16");

  const frame = document.createElementNS("http://www.w3.org/2000/svg", "rect");
  frame.setAttribute("class", "minimap-frame");
  frame.setAttribute("rx", "16");
  frame.setAttribute("ry", "16");

  minimapSvg.append(shadow, frame);
  dom.minimapHost.append(minimapSvg);

  state.minimapSvg = minimapSvg;
  state.minimapFrame = frame;
  state.minimapFrameShadow = shadow;
  updateMinimapFrame();
}

function commitViewBox() {
  if (!state.svg || !state.viewBox) {
    return;
  }

  state.svg.setAttribute("viewBox", rectToString(state.viewBox));
  updateZoomBadge();
  updateMinimapFrame();
}

function updateZoomBadge() {
  if (!state.fitBounds || !state.viewBox) {
    dom.zoomBadge.textContent = "100%";
    return;
  }

  const zoom = Math.round((state.fitBounds.width / state.viewBox.width) * 100);
  dom.zoomBadge.textContent = `${zoom}%`;
}

function updateMinimapFrame() {
  if (!state.minimapFrame || !state.minimapFrameShadow || !state.viewBox) {
    return;
  }

  for (const element of [state.minimapFrameShadow, state.minimapFrame]) {
    element.setAttribute("x", `${state.viewBox.x}`);
    element.setAttribute("y", `${state.viewBox.y}`);
    element.setAttribute("width", `${state.viewBox.width}`);
    element.setAttribute("height", `${state.viewBox.height}`);
  }
}

function fitToGraph(animate = false) {
  if (!state.fitBounds) {
    return;
  }

  setViewBox(state.fitBounds, animate);
}

function applyMode(mode) {
  state.mode = mode;
  dom.panModeBtn.classList.toggle("is-active", mode === "pan");
  dom.boxModeBtn.classList.toggle("is-active", mode === "box");
  updateViewerCursor();
  hideViewerCaption();
}

function updateViewerCursor() {
  const mode = state.interaction?.type === "pan"
    ? "panning"
    : shouldUseBoxMode()
      ? "box"
      : "pan";

  dom.viewportSurface.dataset.cursorMode = mode;
}

function updateHintLine() {
  hideViewerCaption();
}

function setStatus(message, badge = "Ready") {
  if (badge === "Render failed") {
    dom.viewerCaption.textContent = message;
    dom.viewerCaption.hidden = false;
    return;
  }

  hideViewerCaption();
}

function hideViewerCaption() {
  dom.viewerCaption.hidden = true;
  dom.viewerCaption.textContent = "";
}

function openInstructionsModal() {
  if (!dom.instructionsModal.hidden) {
    return;
  }

  state.returnFocusTarget = document.activeElement instanceof HTMLElement
    ? document.activeElement
    : null;
  dom.instructionsModal.hidden = false;
  document.body.classList.add("has-modal");
  dom.instructionsCloseBtn.focus();
}

function closeInstructionsModal() {
  if (dom.instructionsModal.hidden) {
    return;
  }

  dom.instructionsModal.hidden = true;
  document.body.classList.remove("has-modal");

  if (state.returnFocusTarget?.isConnected) {
    state.returnFocusTarget.focus();
  }

  state.returnFocusTarget = null;
}

function isInstructionsOpen() {
  return !dom.instructionsModal.hidden;
}

function setViewerEmpty(isEmpty) {
  dom.viewer.classList.toggle("is-empty", isEmpty);
  dom.viewportSurface.classList.toggle("is-empty", isEmpty);
  dom.graphHost.classList.toggle("is-empty", isEmpty);
  dom.emptyState.hidden = !isEmpty;
}

function onPointerDown(event) {
  if (!state.viewBox || event.button !== 0) {
    return;
  }

  event.preventDefault();
  dom.viewportSurface.focus({ preventScroll: true });

  const rect = dom.viewportSurface.getBoundingClientRect();
  const origin = {
    x: event.clientX - rect.left,
    y: event.clientY - rect.top,
  };

  state.interaction = {
    pointerId: event.pointerId,
    type: shouldUseBoxMode(event) ? "box" : "pan",
    startClientX: event.clientX,
    startClientY: event.clientY,
    origin,
    startViewBox: { ...state.viewBox },
  };

  dom.viewportSurface.setPointerCapture(event.pointerId);

  if (state.interaction.type === "box") {
    updateSelectionBox(origin, origin);
  }

  updateViewerCursor();
}

function onPointerMove(event) {
  if (!state.interaction || event.pointerId !== state.interaction.pointerId) {
    return;
  }

  const rect = dom.viewportSurface.getBoundingClientRect();
  const current = {
    x: clamp(event.clientX - rect.left, 0, rect.width),
    y: clamp(event.clientY - rect.top, 0, rect.height),
  };

  if (state.interaction.type === "pan") {
    const dx = event.clientX - state.interaction.startClientX;
    const dy = event.clientY - state.interaction.startClientY;

    const nextViewBox = constrainViewBox({
      x: state.interaction.startViewBox.x - (dx / rect.width) * state.interaction.startViewBox.width,
      y: state.interaction.startViewBox.y - (dy / rect.height) * state.interaction.startViewBox.height,
      width: state.interaction.startViewBox.width,
      height: state.interaction.startViewBox.height,
    });

    state.viewBox = nextViewBox;
    commitViewBox();
    return;
  }

  updateSelectionBox(state.interaction.origin, current);
}

function onPointerUp(event) {
  if (!state.interaction || event.pointerId !== state.interaction.pointerId) {
    return;
  }

  const interaction = state.interaction;
  const rect = dom.viewportSurface.getBoundingClientRect();
  const release = {
    x: clamp(event.clientX - rect.left, 0, rect.width),
    y: clamp(event.clientY - rect.top, 0, rect.height),
  };

  dom.selectionBox.hidden = true;
  state.interaction = null;
  updateViewerCursor();

  if (interaction.type !== "box") {
    return;
  }

  const screenRect = normalizeScreenRect(interaction.origin, release);

  if (screenRect.width < 12 || screenRect.height < 12) {
    zoomAtViewportAnchor(
      {
        x: release.x / rect.width,
        y: release.y / rect.height,
      },
      0.64,
      true,
    );
    return;
  }

  const target = normalizeRect({
    x: state.viewBox.x + (screenRect.x / rect.width) * state.viewBox.width,
    y: state.viewBox.y + (screenRect.y / rect.height) * state.viewBox.height,
    width: (screenRect.width / rect.width) * state.viewBox.width,
    height: (screenRect.height / rect.height) * state.viewBox.height,
  });

  const paddedTarget = padRect(target, Math.max(target.width, target.height) * 0.06);
  setViewBox(fitRectToViewport(paddedTarget), true);
}

function cancelInteraction() {
  dom.selectionBox.hidden = true;
  state.interaction = null;
  updateViewerCursor();
}

function updateSelectionBox(origin, current) {
  const rect = normalizeScreenRect(origin, current);
  dom.selectionBox.hidden = false;
  dom.selectionBox.style.left = `${rect.x}px`;
  dom.selectionBox.style.top = `${rect.y}px`;
  dom.selectionBox.style.width = `${rect.width}px`;
  dom.selectionBox.style.height = `${rect.height}px`;
}

function onWheel(event) {
  if (!state.viewBox) {
    return;
  }

  event.preventDefault();
  const direction = Math.exp(event.deltaY * 0.0012);
  const rect = dom.viewportSurface.getBoundingClientRect();
  const anchor = {
    x: clamp((event.clientX - rect.left) / rect.width, 0, 1),
    y: clamp((event.clientY - rect.top) / rect.height, 0, 1),
  };

  zoomAtViewportAnchor(anchor, direction, false);
}

function onDoubleClick(event) {
  if (!state.viewBox) {
    return;
  }

  const rect = dom.viewportSurface.getBoundingClientRect();
  zoomAtViewportAnchor(
    {
      x: clamp((event.clientX - rect.left) / rect.width, 0, 1),
      y: clamp((event.clientY - rect.top) / rect.height, 0, 1),
    },
    event.altKey ? 1.35 : 0.58,
    true,
  );
}

function zoomAtViewportAnchor(anchor, factor, animate) {
  if (!state.viewBox) {
    return;
  }

  const aspect = getViewerAspect();
  const current = state.viewBox;
  const nextWidth = clamp(
    current.width * factor,
    state.fitBounds.width * 0.04,
    state.fitBounds.width * 1.4,
  );
  const nextHeight = nextWidth / aspect;

  const focusX = current.x + current.width * anchor.x;
  const focusY = current.y + current.height * anchor.y;
  const nextRect = constrainViewBox({
    x: focusX - nextWidth * anchor.x,
    y: focusY - nextHeight * anchor.y,
    width: nextWidth,
    height: nextHeight,
  });

  setViewBox(nextRect, animate);
}

function onMinimapPointerDown(event) {
  if (!state.minimapSvg || !state.viewBox) {
    return;
  }

  event.preventDefault();

  const svgPoint = state.minimapSvg.createSVGPoint();
  svgPoint.x = event.clientX;
  svgPoint.y = event.clientY;

  const graphPoint = svgPoint.matrixTransform(state.minimapSvg.getScreenCTM().inverse());

  setViewBox(
    constrainViewBox({
      x: graphPoint.x - state.viewBox.width / 2,
      y: graphPoint.y - state.viewBox.height / 2,
      width: state.viewBox.width,
      height: state.viewBox.height,
    }),
    true,
  );
}

function onKeyDown(event) {
  if (isInstructionsOpen()) {
    if (event.key === "Escape") {
      event.preventDefault();
      closeInstructionsModal();
    }

    return;
  }

  if (isEditableTarget(event.target)) {
    return;
  }

  if (!event.metaKey && !event.ctrlKey && !event.altKey && (event.key === "i" || event.key === "I")) {
    event.preventDefault();
    openInstructionsModal();
    return;
  }

  if (!event.metaKey && !event.ctrlKey && !event.altKey && (event.key === "s" || event.key === "S")) {
    event.preventDefault();
    dom.nodeSearchInput.focus();
    dom.nodeSearchInput.select();
    syncNodeSearchResults();
    return;
  }

  if (event.code === "Space") {
    state.spacePressed = true;
    updateViewerCursor();
    return;
  }

  if (event.key === "b" || event.key === "B") {
    event.preventDefault();
    applyMode("box");
    return;
  }

  if (event.key === "h" || event.key === "H") {
    event.preventDefault();
    applyMode("pan");
    return;
  }

  if (event.key === "f" || event.key === "F") {
    event.preventDefault();
    fitToGraph(true);
    return;
  }

  if (event.key === "0") {
    event.preventDefault();
    fitToGraph(true);
    return;
  }

  if (event.key === "+" || event.key === "=") {
    event.preventDefault();
    zoomAtViewportAnchor({ x: 0.5, y: 0.5 }, 0.78, true);
    return;
  }

  if (event.key === "-") {
    event.preventDefault();
    zoomAtViewportAnchor({ x: 0.5, y: 0.5 }, 1.28, true);
    return;
  }

  if (event.key === "Escape") {
    cancelInteraction();
  }
}

function onKeyUp(event) {
  if (event.code === "Space") {
    state.spacePressed = false;
    updateViewerCursor();
  }
}

function setViewBox(targetRect, animate) {
  const nextRect = constrainViewBox(targetRect);

  if (!animate) {
    cancelAnimation();
    state.viewBox = nextRect;
    commitViewBox();
    return;
  }

  animateViewBox(nextRect);
}

function animateViewBox(target) {
  cancelAnimation();

  const start = { ...state.viewBox };
  const startedAt = performance.now();
  const duration = 360;

  const tick = (now) => {
    const progress = clamp((now - startedAt) / duration, 0, 1);
    const eased = easeInOutCubic(progress);

    state.viewBox = {
      x: lerp(start.x, target.x, eased),
      y: lerp(start.y, target.y, eased),
      width: lerp(start.width, target.width, eased),
      height: lerp(start.height, target.height, eased),
    };

    commitViewBox();

    if (progress < 1) {
      state.animationFrame = requestAnimationFrame(tick);
      return;
    }

    state.animationFrame = 0;
    state.viewBox = target;
    commitViewBox();
  };

  state.animationFrame = requestAnimationFrame(tick);
}

function cancelAnimation() {
  if (!state.animationFrame) {
    return;
  }

  cancelAnimationFrame(state.animationFrame);
  state.animationFrame = 0;
}

function shouldUseBoxMode(event) {
  if (state.mode === "box") {
    return !state.spacePressed;
  }

  return Boolean(event?.shiftKey);
}

function computeGraphBounds(svg) {
  const content = svg.querySelector("g") ?? svg;
  const box = content.getBBox();

  if (box.width > 0 && box.height > 0) {
    return normalizeRect(box);
  }

  return parseViewBox(svg.getAttribute("viewBox"));
}

function fitRectToViewport(rect) {
  return expandRectToAspect(rect, getViewerAspect());
}

function adjustRectToAspect(rect, aspect) {
  return expandRectToAspect(rect, aspect);
}

function expandRectToAspect(rect, aspect) {
  const normalized = normalizeRect(rect);
  const currentAspect = normalized.width / normalized.height;

  if (Math.abs(currentAspect - aspect) < 0.0001) {
    return normalized;
  }

  if (currentAspect > aspect) {
    const height = normalized.width / aspect;
    return {
      x: normalized.x,
      y: normalized.y - (height - normalized.height) / 2,
      width: normalized.width,
      height,
    };
  }

  const width = normalized.height * aspect;
  return {
    x: normalized.x - (width - normalized.width) / 2,
    y: normalized.y,
    width,
    height: normalized.height,
  };
}

function constrainViewBox(viewBox) {
  if (!state.rawBounds || !state.fitBounds) {
    return viewBox;
  }

  const aspect = getViewerAspect();
  const width = clamp(
    viewBox.width,
    state.fitBounds.width * 0.04,
    state.fitBounds.width * 1.4,
  );
  const height = width / aspect;
  const paddedBounds = expandRectToAspect(
    padRect(state.rawBounds, Math.max(state.rawBounds.width, state.rawBounds.height) * 0.08),
    aspect,
  );

  let x = viewBox.x;
  let y = viewBox.y;

  const minX = paddedBounds.x;
  const maxX = paddedBounds.x + paddedBounds.width - width;
  const minY = paddedBounds.y;
  const maxY = paddedBounds.y + paddedBounds.height - height;

  x = minX <= maxX ? clamp(x, minX, maxX) : paddedBounds.x + (paddedBounds.width - width) / 2;
  y = minY <= maxY ? clamp(y, minY, maxY) : paddedBounds.y + (paddedBounds.height - height) / 2;

  return { x, y, width, height };
}

function getViewerAspect() {
  const width = Math.max(dom.viewportSurface.clientWidth, 1);
  const height = Math.max(dom.viewportSurface.clientHeight, 1);
  return width / height;
}

function rectToString(rect) {
  return `${rect.x} ${rect.y} ${rect.width} ${rect.height}`;
}

function parseViewBox(viewBox) {
  const [x = 0, y = 0, width = 1000, height = 800] = `${viewBox ?? ""}`
    .trim()
    .split(/\s+/)
    .map(Number);

  return { x, y, width, height };
}

function padRect(rect, padding) {
  return {
    x: rect.x - padding,
    y: rect.y - padding,
    width: rect.width + padding * 2,
    height: rect.height + padding * 2,
  };
}

function normalizeRect(rect) {
  return {
    x: rect.x,
    y: rect.y,
    width: Math.max(rect.width, 1),
    height: Math.max(rect.height, 1),
  };
}

function normalizeScreenRect(start, end) {
  return {
    x: Math.min(start.x, end.x),
    y: Math.min(start.y, end.y),
    width: Math.abs(start.x - end.x),
    height: Math.abs(start.y - end.y),
  };
}

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function lerp(start, end, t) {
  return start + (end - start) * t;
}

function easeInOutCubic(t) {
  return t < 0.5
    ? 4 * t * t * t
    : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

function nextFrame() {
  return new Promise((resolve) => requestAnimationFrame(resolve));
}

function isEditableTarget(target) {
  return target instanceof HTMLElement
    && (target.isContentEditable
      || target.tagName === "TEXTAREA"
      || target.tagName === "INPUT"
      || target.tagName === "SELECT");
}
