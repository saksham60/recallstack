import type { ComponentType } from "react";
import DOMPurify from "isomorphic-dompurify";
import type { StudyNoteBlockResponse } from "../use-study-note";

type KnownBlockKind = "text" | "code" | "approach" | "warning" | "mistake";
type RenderBlockKind = KnownBlockKind | "unsupported";

interface NormalizedBlock {
  id: string;
  kind: RenderBlockKind;
  originalType: string;
  heading: string | null;
  position: number;
  content: string;
}

interface BlockRendererProps {
  block: NormalizedBlock;
}

interface RendererConfig {
  component: ComponentType<BlockRendererProps>;
  handlesHeading: boolean;
}

const BLOCK_KIND_BY_TYPE: Readonly<Record<string, KnownBlockKind>> = {
  text: "text",
  markdown: "text",
  recognize: "text",
  remember: "text",
  code: "code",
  approach: "approach",
  warning: "warning",
  invariant: "warning",
  mistake: "mistake",
};

function readString(payload: Record<string, unknown>, key: string): string | undefined {
  const value = payload[key];
  return typeof value === "string" ? value : undefined;
}

export function normalizeStudyNoteBlock(block: StudyNoteBlockResponse): NormalizedBlock {
  const kind = BLOCK_KIND_BY_TYPE[block.type] ?? "unsupported";
  const content = kind === "code"
    ? readString(block.payload, "code") ?? ""
    : readString(block.payload, "content") ?? readString(block.payload, "text") ?? "";

  return {
    id: block.id,
    kind,
    originalType: block.type,
    heading: block.heading,
    position: block.position,
    content,
  };
}

function TextBlock({ block }: BlockRendererProps) {
  const clean = DOMPurify.sanitize(block.content);
  return <div className="prose prose-invert max-w-none text-muted" dangerouslySetInnerHTML={{ __html: clean }} />;
}

function CodeBlock({ block }: BlockRendererProps) {
  return <div className="rounded-lg bg-black p-4 overflow-x-auto text-sm my-4 border border-border"><pre><code className="text-foreground">{block.content}</code></pre></div>;
}

function ApproachBlock({ block }: BlockRendererProps) {
  return (
    <div className="border border-accent/20 bg-accent/5 rounded-lg p-5 my-6">
      {block.heading && <h3 className="text-accent font-semibold mb-2">{block.heading}</h3>}
      <div className="text-foreground/90">{block.content}</div>
    </div>
  );
}

function WarningBlock({ block }: BlockRendererProps) {
  return (
    <div className="border border-warning/30 bg-warning/10 rounded-lg p-4 my-4 flex gap-3">
      <div className="text-warning text-xl" aria-hidden="true">⚠️</div>
      <div>
        {block.heading && <h4 className="font-medium text-warning mb-1">{block.heading}</h4>}
        <div className="text-sm text-foreground/80">{block.content}</div>
      </div>
    </div>
  );
}

function MistakeBlock({ block }: BlockRendererProps) {
  return <div className="border border-danger/30 bg-danger/10 rounded-lg p-4 my-4"><h4 className="font-medium text-danger mb-2">Common Mistake</h4><div className="text-sm text-foreground/80">{block.content}</div></div>;
}

const blockRenderers: Record<KnownBlockKind, RendererConfig> = {
  text: { component: TextBlock, handlesHeading: false },
  code: { component: CodeBlock, handlesHeading: false },
  approach: { component: ApproachBlock, handlesHeading: true },
  warning: { component: WarningBlock, handlesHeading: true },
  mistake: { component: MistakeBlock, handlesHeading: false },
};

function FallbackBlock({ block }: BlockRendererProps) {
  return <div className="p-4 border border-dashed border-border rounded text-muted text-xs my-2">[Unknown block type: {block.originalType}]</div>;
}

export function BlockRenderer({ block: transportBlock }: { block: StudyNoteBlockResponse }) {
  const block = normalizeStudyNoteBlock(transportBlock);

  if (block.kind === "unsupported") {
    return <div className="mb-8"><FallbackBlock block={block} /></div>;
  }

  const { component: Renderer, handlesHeading } = blockRenderers[block.kind];
  return (
    <div className="mb-8">
      {block.heading && !handlesHeading && <h3 className="text-xl font-semibold mb-4 text-foreground">{block.heading}</h3>}
      <Renderer block={block} />
    </div>
  );
}

export function StudyNoteRenderer({ blocks }: { blocks: StudyNoteBlockResponse[] }) {
  if (blocks.length === 0) {
    return <div className="text-muted italic">No content blocks available.</div>;
  }

  const sortedBlocks = [...blocks].sort((left, right) => left.position - right.position);
  return <div className="study-note-content">{sortedBlocks.map((block) => <BlockRenderer key={block.id} block={block} />)}</div>;
}
