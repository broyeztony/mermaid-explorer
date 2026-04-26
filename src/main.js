import mermaid from "mermaid";

import { examples } from "./examples.js";
import "./styles.css";

const dom = {
  instructionsModal: document.querySelector("#instructionsModal"),
  instructionsCloseBtn: document.querySelector("#instructionsCloseBtn"),
  nodeSearchShell: document.querySelector("#nodeSearchShell"),
  nodeSearchInput: document.querySelector("#nodeSearchInput"),
  nodeSearchResults: document.querySelector("#nodeSearchResults"),
  panModeBtn: document.querySelector("#panModeBtn"),
  boxModeBtn: document.querySelector("#boxModeBtn"),
  fitBtn: document.querySelector("#fitBtn"),
  sourceInput: document.querySelector("#sourceInput"),
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
  securityLevel: "loose",
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
  renderDiagram();
}

function scheduleRenderDiagram() {
  window.clearTimeout(state.renderDebounceTimer);
  state.renderDebounceTimer = window.setTimeout(() => {
    state.renderDebounceTimer = 0;
    renderDiagram();
  }, 180);
}

async function renderDiagram() {
  const source = dom.sourceInput.value.trim();

  if (!source) {
    clearDiagramState();
    setStatus("Paste Mermaid text to render.", "Awaiting diagram");
    return;
  }

  const renderToken = ++state.renderToken;
  cancelAnimation();
  setStatus("Rendering diagram...", "Rendering");

  try {
    await fontsReady;

    const renderId = `mermaid-explorer-${renderToken}`;
    const { svg } = await mermaid.render(renderId, source);

    if (renderToken !== state.renderToken) {
      return;
    }

    dom.graphHost.innerHTML = svg;

    const svgElement = dom.graphHost.querySelector("svg");

    if (!svgElement) {
      throw new Error("Mermaid did not return an SVG.");
    }

    prepareSvg(svgElement);
    await nextFrame();

    const graphBounds = computeGraphBounds(svgElement);
    state.rawBounds = padRect(graphBounds, Math.max(graphBounds.width, graphBounds.height) * 0.06 + 24);
    state.fitBounds = fitRectToViewport(state.rawBounds);
    state.viewBox = { ...state.fitBounds };
    commitViewBox();
    indexDiagramNodes();
    rebuildMinimap();
    setViewerEmpty(false);
    syncNodeSearchResults();
    setStatus("Ready for navigation.", "Ready");
  } catch (error) {
    console.error(error);
    clearDiagramState();
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
  dom.graphHost.innerHTML = "";
  dom.minimapHost.innerHTML = "";
  dom.zoomBadge.textContent = "100%";
  clearNodeSearchIndex();
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

  state.searchIndex = Array.from(state.svg.querySelectorAll(".node"))
    .map((element, index) => {
      const label = extractNodeLabel(element);
      const searchText = normalizeSearchText(label);

      if (!searchText) {
        return null;
      }

      return {
        key: `${element.id || "node"}-${index}`,
        id: element.id || `node-${index + 1}`,
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

function extractNodeLabel(element) {
  return `${element.textContent ?? ""}`
    .replace(/\s+/g, " ")
    .trim();
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
