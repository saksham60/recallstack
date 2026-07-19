import React from "react";
import type { StudyNoteBlockResponse } from "../use-study-note";

// Basic block renderers
const TextBlock = ({ payload }: { payload: any }) => (
  <div className="prose prose-invert max-w-none text-muted" dangerouslySetInnerHTML={{ __html: payload.content || payload.text || "" }} />
);

const CodeBlock = ({ payload }: { payload: any }) => (
  <div className="rounded-lg bg-black p-4 overflow-x-auto text-sm my-4 border border-border">
    <pre><code className="text-foreground">{payload.code}</code></pre>
  </div>
);

const ApproachBlock = ({ payload, heading }: { payload: any, heading?: string | null }) => (
  <div className="border border-accent/20 bg-accent/5 rounded-lg p-5 my-6">
    {heading && <h3 className="text-accent font-semibold mb-2">{heading}</h3>}
    <div className="text-foreground/90">{payload.text || payload.content}</div>
  </div>
);

const WarningBlock = ({ payload, heading }: { payload: any, heading?: string | null }) => (
  <div className="border border-warning/30 bg-warning/10 rounded-lg p-4 my-4 flex gap-3">
    <div className="text-warning text-xl">⚠️</div>
    <div>
      {heading && <h4 className="font-medium text-warning mb-1">{heading}</h4>}
      <div className="text-sm text-foreground/80">{payload.text || payload.content}</div>
    </div>
  </div>
);

const MistakeBlock = ({ payload }: { payload: any }) => (
  <div className="border border-danger/30 bg-danger/10 rounded-lg p-4 my-4">
    <h4 className="font-medium text-danger mb-2">Common Mistake</h4>
    <div className="text-sm text-foreground/80">{payload.text || payload.content}</div>
  </div>
);

const FallbackBlock = ({ block }: { block: StudyNoteBlockResponse }) => (
  <div className="p-4 border border-dashed border-border rounded text-muted text-xs my-2">
    [Unknown block type: {block.type}]
  </div>
);

// Block Registry
export function BlockRenderer({ block }: { block: StudyNoteBlockResponse }) {
  const { type, payload, heading } = block;

  const renderContent = () => {
    switch (type) {
      case "text":
      case "markdown":
      case "recognize":
      case "remember":
        return <TextBlock payload={payload} />;
      case "code":
        return <CodeBlock payload={payload} />;
      case "approach":
        return <ApproachBlock payload={payload} heading={heading} />;
      case "warning":
      case "invariant":
        return <WarningBlock payload={payload} heading={heading} />;
      case "mistake":
        return <MistakeBlock payload={payload} />;
      default:
        return <FallbackBlock block={block} />;
    }
  };

  return (
    <div className="mb-8">
      {heading && type !== "approach" && type !== "warning" && (
        <h3 className="text-xl font-semibold mb-4 text-foreground">{heading}</h3>
      )}
      {renderContent()}
    </div>
  );
}

export function StudyNoteRenderer({ blocks }: { blocks: StudyNoteBlockResponse[] }) {
  if (!blocks || blocks.length === 0) {
    return <div className="text-muted italic">No content blocks available.</div>;
  }

  // Sort blocks by position just in case
  const sortedBlocks = [...blocks].sort((a, b) => a.position - b.position);

  return (
    <div className="study-note-content">
      {sortedBlocks.map((block) => (
        <BlockRenderer key={block.id} block={block} />
      ))}
    </div>
  );
}
