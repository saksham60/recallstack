import { createElement } from "react";
import {
  Boxes,
  Box,
  CloudCog,
  Component,
  CreditCard,
  Database,
  DatabaseZap,
  Gauge,
  Globe2,
  HardDrive,
  Mail,
  Monitor,
  Network,
  PlugZap,
  RadioTower,
  Route,
  Search,
  Send,
  Server,
  ShieldCheck,
  Smartphone,
  User,
  Warehouse,
  Waves,
  Waypoints,
  Workflow,
  type LucideIcon,
  type LucideProps,
} from "lucide-react";
import type { SystemDesignNodeType } from "../types/system-design.types";

const nodeIcons = {
  user: User,
  web_app: Monitor,
  mobile_app: Smartphone,
  admin_portal: ShieldCheck,
  dns: Globe2,
  cdn: Network,
  load_balancer: Waypoints,
  api_gateway: Route,
  service: Server,
  microservice: Boxes,
  monolith: Box,
  worker: Component,
  serverless_function: CloudCog,
  sql_database: Database,
  nosql_database: DatabaseZap,
  cache: Gauge,
  search_engine: Search,
  object_storage: HardDrive,
  data_warehouse: Warehouse,
  message_queue: Send,
  event_stream: Waves,
  pubsub: RadioTower,
  third_party_api: PlugZap,
  payment_provider: CreditCard,
  notification_provider: Mail,
} satisfies Record<SystemDesignNodeType, LucideIcon>;

export function getSystemDesignNodeIcon(type: SystemDesignNodeType): LucideIcon {
  return nodeIcons[type];
}

export function SystemDesignNodeIcon({
  type,
  ...props
}: LucideProps & { type: SystemDesignNodeType }) {
  return createElement(getSystemDesignNodeIcon(type), {
    "aria-hidden": true,
    ...props,
  });
}

export function SystemDesignWorkflowIcon(props: LucideProps) {
  return <Workflow aria-hidden="true" {...props} />;
}
