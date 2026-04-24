export const examples = [
  {
    id: "platform-map",
    name: "Platform Map",
    source: String.raw`flowchart LR
  subgraph touchpoints["Touchpoints"]
    web["Customer Web"]
    mobile["Mobile App"]
    partners["Partner API"]
    backoffice["Ops Console"]
  end

  subgraph edge["Edge"]
    dns["DNS"]
    cdn["CDN"]
    waf["WAF"]
    gateway["API Gateway"]
  end

  subgraph apps["Application Plane"]
    auth["Auth"]
    profile["Profile"]
    catalog["Catalog"]
    search["Search"]
    orders["Orders"]
    billing["Billing"]
    recommend["Recommendations"]
    notify["Notifications"]
  end

  subgraph streams["Async Work"]
    eventbus["Event Bus"]
    fulfillment["Fulfillment"]
    ledger["Ledger Writer"]
    digest["Digest Worker"]
  end

  subgraph data["Data Plane"]
    cache["Redis"]
    pg["Postgres"]
    warehouse["Warehouse"]
    blob["Object Storage"]
    vector["Vector Index"]
  end

  subgraph control["Control Plane"]
    metrics["Metrics"]
    traces["Tracing"]
    alerts["Alert Router"]
    ci["CI Pipeline"]
    runbooks["Runbooks"]
  end

  web --> dns --> cdn --> waf --> gateway
  mobile --> gateway
  partners --> gateway
  backoffice --> gateway

  gateway --> auth
  gateway --> profile
  gateway --> catalog
  gateway --> search
  gateway --> orders

  auth --> cache
  auth --> pg
  profile --> pg
  catalog --> cache
  catalog --> pg
  catalog --> blob
  search --> cache
  search --> vector
  search --> warehouse
  orders --> pg
  orders --> billing
  orders --> eventbus
  billing --> ledger
  billing --> pg
  recommend --> warehouse
  recommend --> vector
  notify --> digest
  notify --> eventbus

  eventbus --> fulfillment
  eventbus --> digest
  eventbus --> ledger
  fulfillment --> pg
  digest --> warehouse
  ledger --> warehouse

  auth -. telemetry .-> metrics
  profile -. telemetry .-> metrics
  catalog -. telemetry .-> traces
  search -. telemetry .-> traces
  orders -. telemetry .-> alerts
  billing -. telemetry .-> alerts
  alerts --> runbooks
  ci --> gateway
  ci --> recommend`,
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
