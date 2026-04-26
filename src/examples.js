const regionalCells = [
  { key: "na", short: "NA", label: "North America" },
  { key: "eu", short: "EU", label: "Europe" },
  { key: "apac", short: "APAC", label: "Asia Pacific" },
  { key: "latam", short: "LATAM", label: "Latin America" },
];

const regionalNodes = [
  { key: "store", label: "Storefront" },
  { key: "catalog", label: "Catalog" },
  { key: "search", label: "Search" },
  { key: "pricing", label: "Pricing" },
  { key: "cart", label: "Cart" },
  { key: "checkout", label: "Checkout" },
  { key: "orders", label: "Orders" },
  { key: "fulfillment", label: "Fulfillment" },
  { key: "returns", label: "Returns" },
  { key: "cache", label: "Redis" },
  { key: "postgres", label: "Postgres" },
  { key: "queue", label: "Work Queue" },
];

function buildSubgraphLines(id, label, nodes, indent = "  ", direction = "TB") {
  const lines = [`${indent}subgraph ${id}["${label}"]`, `${indent}  direction ${direction}`];

  for (const [nodeId, nodeLabel] of nodes) {
    lines.push(`${indent}  ${nodeId}["${nodeLabel}"]`);
  }

  lines.push(`${indent}end`);
  return lines;
}

function buildRegionalCellLines(region) {
  const lines = [`    subgraph ${region.key}_cell["${region.label}"]`, "      direction TB"];

  for (const node of regionalNodes) {
    lines.push(`      ${region.key}_${node.key}["${region.short} ${node.label}"]`);
  }

  lines.push("    end");
  return lines;
}

function buildMegaDemoSource() {
  const lines = ["flowchart LR", ""];

  const sharedSubgraphs = [
    {
      id: "touchpoints",
      label: "Touchpoints",
      nodes: [
        ["customer_web", "Customer Web"],
        ["ios_app", "iOS App"],
        ["android_app", "Android App"],
        ["partner_api", "Partner API"],
        ["seller_hub", "Seller Hub"],
        ["support_desk", "Support Desk"],
      ],
    },
    {
      id: "edge",
      label: "Edge Fabric",
      nodes: [
        ["global_dns", "Global DNS"],
        ["cdn", "CDN"],
        ["waf", "WAF"],
        ["bot_filter", "Bot Filter"],
        ["api_gateway", "API Gateway"],
        ["websocket_edge", "Realtime Edge"],
      ],
    },
    {
      id: "identity",
      label: "Identity And Trust",
      nodes: [
        ["identity_api", "Identity API"],
        ["session_bus", "Session Bus"],
        ["policy_engine", "Policy Engine"],
        ["mfa_service", "MFA Service"],
        ["consent_store", "Consent Store"],
        ["fraud_graph", "Fraud Graph"],
        ["audit_trail", "Audit Trail"],
      ],
    },
    {
      id: "merch_ops",
      label: "Merch And Supply",
      nodes: [
        ["supplier_portal", "Supplier Portal"],
        ["inventory_master", "Inventory Master"],
        ["assortment_hub", "Assortment Hub"],
        ["content_studio", "Content Studio"],
        ["promo_studio", "Promo Studio"],
        ["pricing_control", "Pricing Control"],
      ],
    },
    {
      id: "async_fabric",
      label: "Async Backbone",
      nodes: [
        ["event_mesh", "Event Mesh"],
        ["task_orchestrator", "Task Orchestrator"],
        ["notification_hub", "Notification Hub"],
        ["sla_monitor", "SLA Monitor"],
        ["replay_console", "Replay Console"],
      ],
    },
    {
      id: "finance",
      label: "Payments And Finance",
      nodes: [
        ["payment_router", "Payment Router"],
        ["tax_engine", "Tax Engine"],
        ["ledger_core", "Ledger Core"],
        ["settlements", "Settlements"],
        ["refund_router", "Refund Router"],
        ["invoice_store", "Invoice Store"],
      ],
    },
    {
      id: "intelligence",
      label: "Data And AI",
      nodes: [
        ["cdc_bus", "CDC Bus"],
        ["lakehouse", "Lakehouse"],
        ["warehouse", "Warehouse"],
        ["feature_store", "Feature Store"],
        ["vector_index", "Vector Index"],
        ["model_router", "Model Router"],
        ["demand_forecast", "Demand Forecast"],
        ["recommendations", "Recommendations"],
      ],
    },
    {
      id: "platform",
      label: "Platform And Reliability",
      nodes: [
        ["service_mesh", "Service Mesh"],
        ["feature_flags", "Feature Flags"],
        ["secrets_vault", "Secrets Vault"],
        ["metrics", "Metrics"],
        ["traces", "Traces"],
        ["alert_router", "Alert Router"],
        ["status_page", "Status Page"],
        ["deploy_orchestrator", "Deploy Orchestrator"],
      ],
    },
  ];

  for (const subgraph of sharedSubgraphs.slice(0, 4)) {
    lines.push(...buildSubgraphLines(subgraph.id, subgraph.label, subgraph.nodes));
    lines.push("");
  }

  lines.push('  subgraph regional_cells["Regional Commerce Cells"]');
  lines.push("    direction LR");

  for (const region of regionalCells) {
    lines.push(...buildRegionalCellLines(region));
    lines.push("");
  }

  lines.push("  end");
  lines.push("");

  for (const subgraph of sharedSubgraphs.slice(4)) {
    lines.push(...buildSubgraphLines(subgraph.id, subgraph.label, subgraph.nodes));
    lines.push("");
  }

  const edges = [
    "  customer_web --> global_dns --> cdn --> waf --> bot_filter --> api_gateway",
    "  ios_app --> api_gateway",
    "  android_app --> api_gateway",
    "  partner_api --> api_gateway",
    "  seller_hub --> api_gateway",
    "  support_desk --> api_gateway",
    "  api_gateway --> websocket_edge",
    "  api_gateway --> identity_api",
    "  identity_api --> session_bus --> policy_engine",
    "  policy_engine --> mfa_service",
    "  policy_engine --> consent_store",
    "  mfa_service --> fraud_graph --> audit_trail --> alert_router",
    "  supplier_portal --> assortment_hub --> content_studio",
    "  assortment_hub --> inventory_master",
    "  promo_studio --> pricing_control",
    "  replay_console --> event_mesh --> task_orchestrator",
    "  task_orchestrator --> notification_hub",
    "  task_orchestrator --> sla_monitor",
    "  payment_router --> ledger_core",
    "  tax_engine --> ledger_core",
    "  ledger_core --> settlements --> invoice_store",
    "  refund_router --> ledger_core",
    "  cdc_bus --> lakehouse --> warehouse",
    "  warehouse --> feature_store",
    "  feature_store --> model_router",
    "  feature_store --> demand_forecast",
    "  model_router --> vector_index",
    "  model_router --> recommendations",
    "  deploy_orchestrator --> service_mesh --> api_gateway",
    "  deploy_orchestrator --> feature_flags",
    "  secrets_vault --> identity_api",
    "  metrics --> status_page",
    "  traces --> status_page",
    "  alert_router --> status_page",
  ];

  for (const region of regionalCells) {
    const node = (key) => `${region.key}_${key}`;

    edges.push(
      `  api_gateway --> ${node("store")}`,
      `  identity_api --> ${node("store")}`,
      `  content_studio --> ${node("catalog")}`,
      `  inventory_master --> ${node("catalog")}`,
      `  pricing_control --> ${node("pricing")}`,
      `  vector_index --> ${node("search")}`,
      `  recommendations --> ${node("search")}`,
      `  demand_forecast --> ${node("fulfillment")}`,
      `  feature_flags -. rollout .-> ${node("store")}`,
      `  ${node("store")} --> ${node("catalog")}`,
      `  ${node("store")} --> ${node("search")}`,
      `  ${node("store")} --> ${node("pricing")}`,
      `  ${node("store")} --> ${node("cart")}`,
      `  ${node("search")} --> ${node("catalog")}`,
      `  ${node("pricing")} --> ${node("cart")}`,
      `  ${node("catalog")} --> ${node("cache")}`,
      `  ${node("catalog")} --> ${node("postgres")}`,
      `  ${node("search")} --> ${node("cache")}`,
      `  ${node("pricing")} --> ${node("cache")}`,
      `  ${node("cart")} --> ${node("cache")}`,
      `  ${node("cart")} --> ${node("checkout")}`,
      `  ${node("checkout")} --> payment_router`,
      `  ${node("checkout")} --> tax_engine`,
      `  ${node("checkout")} --> ${node("orders")}`,
      `  ${node("orders")} --> ${node("postgres")}`,
      `  ${node("orders")} --> ${node("queue")}`,
      `  ${node("orders")} --> ledger_core`,
      `  ${node("orders")} --> ${node("fulfillment")}`,
      `  ${node("orders")} --> ${node("returns")}`,
      `  ${node("fulfillment")} --> ${node("queue")}`,
      `  ${node("fulfillment")} --> ${node("postgres")}`,
      `  ${node("fulfillment")} --> inventory_master`,
      `  ${node("returns")} --> refund_router`,
      `  ${node("returns")} --> ${node("queue")}`,
      `  ${node("queue")} --> event_mesh`,
      `  ${node("postgres")} --> cdc_bus`,
      `  ${node("checkout")} -. traces .-> traces`,
      `  ${node("orders")} -. metrics .-> metrics`,
      `  ${node("fulfillment")} -. sla .-> sla_monitor`,
    );
  }

  for (let index = 0; index < regionalCells.length - 1; index += 1) {
    const current = regionalCells[index];
    const next = regionalCells[index + 1];
    edges.push(`  ${current.key}_postgres -. replicate .-> ${next.key}_postgres`);
  }

  lines.push(...edges);
  return lines.join("\n");
}

export const examples = [
  {
    id: "mega-commerce-mesh",
    name: "Mega Commerce Mesh",
    source: buildMegaDemoSource(),
  },
  {
    id: "release-train",
    name: "Release Train",
    source: String.raw`flowchart TD
  backlog["Discovery Backlog"] --> shaping["Problem Shaping"]
  shaping --> design["Design Review"]
  shaping --> feasibility["Tech Feasibility"]

  subgraph build["Build Track"]
    design --> frontend["Frontend Build"]
    design --> backend["Backend Build"]
    feasibility --> infra["Infra Changes"]
    frontend --> qa["QA Pass"]
    backend --> qa
    infra --> qa
  end

  subgraph governance["Governance"]
    security["Security Review"]
    finance["Cost Review"]
    legal["Legal Review"]
    accessibility["Accessibility Review"]
  end

  subgraph launch["Launch"]
    staging["Staging"]
    canary["Canary"]
    prod["Production"]
    post["Post-launch Audit"]
  end

  qa --> security
  qa --> accessibility
  infra --> finance
  design --> legal

  security --> staging
  finance --> staging
  legal --> staging
  accessibility --> staging
  staging --> canary --> prod --> post

  post --> learnings["Retrospective"]
  learnings --> backlog
  prod -. metrics .-> dashboards["Shared Dashboards"]
  dashboards -. incidents .-> security`,
  },
  {
    id: "incident-net",
    name: "Incident Net",
    source: String.raw`flowchart LR
  pager["Pager Duty"]
  support["Support Inbox"]
  social["Social Signals"]
  health["Synthetic Checks"]

  pager --> triage["Triage Lead"]
  support --> triage
  social --> triage
  health --> triage

  subgraph squads["Response Squads"]
    api["API Squad"]
    data["Data Squad"]
    web["Web Squad"]
    infra["Infra Squad"]
    vendor["Vendor Liaison"]
  end

  triage --> api
  triage --> data
  triage --> web
  triage --> infra
  triage --> vendor

  subgraph evidence["Evidence"]
    logs["Log Search"]
    traces["Trace Waterfall"]
    db["DB Heatmap"]
    queue["Queue Depth"]
    deploys["Recent Deploys"]
  end

  api --> logs
  api --> traces
  data --> db
  data --> queue
  web --> traces
  infra --> deploys
  infra --> logs

  subgraph decisions["Decision Loop"]
    mitigate["Mitigate"]
    rollback["Rollback"]
    isolate["Isolate Traffic"]
    comms["Customer Comms"]
    review["Incident Review"]
  end

  logs --> mitigate
  traces --> rollback
  db --> isolate
  queue --> mitigate
  deploys --> rollback
  vendor --> comms
  mitigate --> review
  rollback --> review
  isolate --> review
  comms --> review
  review --> backlog["Reliability Backlog"]`,
  },
];
