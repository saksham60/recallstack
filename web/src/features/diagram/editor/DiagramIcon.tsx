import type { ComponentType, SVGProps } from "react";
import { Bot, Box, Boxes, Circle, Cloud, Container, Database, Diamond, FileText, Frame, GitBranch, HardDrive, Hexagon, Keyboard, LogIn, Network, Orbit, PlayCircle, Route, Server, ServerCog, Shapes, Shield, ShieldCheck, Shuffle, Sparkles, Square, StickyNote, Triangle, Type, UserRound, Workflow, Wrench } from "lucide-react";

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
};

export function DiagramIcon({ name, className = "h-5 w-5" }: { name: string; className?: string }) {
  const IconComponent = ICONS[name] ?? Shapes;
  return <IconComponent className={className} aria-hidden="true" />;
}
