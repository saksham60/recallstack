import type { ComponentType, SVGProps } from "react";
import { Bot, Box, Boxes, Circle, CircleHelp, Cloud, Container, Database, Diamond, FileText, Frame, GitBranch, Group, HardDrive, Hexagon, Image, Key, KeyRound, Keyboard, LogIn, Network, Orbit, PlayCircle, Route, Server, ServerCog, Shield, ShieldCheck, Shuffle, Sparkles, Square, StickyNote, TableProperties, Triangle, Type, UserRound, Workflow, Wrench } from "lucide-react";

type Icon = ComponentType<SVGProps<SVGSVGElement>>;

const ICONS: Record<string, Icon> = {
  square: Square,
  "rectangle-horizontal": Square,
  circle: Circle,
  "circle-ellipsis": Circle,
  "circle-play": PlayCircle,
  "circle-dot": Circle,
  diamond: Diamond,
  triangle: Triangle,
  hexagon: Hexagon,
  database: Database,
  "file-text": FileText,
  cloud: Cloud,
  "user-round": UserRound,
  type: Type,
  "sticky-note": StickyNote,
  frame: Frame,
  box: Box,
  workflow: Workflow,
  network: Network,
  "square-function": GitBranch,
  "log-in": LogIn,
  keyboard: Keyboard,
  server: Server,
  container: Container,
  kubernetes: Boxes,
  firewall: Shield,
  guardrail: ShieldCheck,
  "ai-agent": Bot,
  llm: Sparkles,
  "embedding-model": Orbit,
  rag: GitBranch,
  "mcp-server": ServerCog,
  gateway: Route,
  "reverse-proxy": Shuffle,
  tool: Wrench,
  vector: HardDrive,
  image: Image,
  group: Group,
  table: TableProperties,
  key: Key,
  "key-round": KeyRound,
};

export function DiagramIcon({ name, className = "h-5 w-5" }: { name: string; className?: string }) {
  const IconComponent = ICONS[name];
  return IconComponent ? <IconComponent className={className} aria-hidden="true" /> : <CircleHelp className={`${className} text-red-400`} aria-hidden="true" />;
}
