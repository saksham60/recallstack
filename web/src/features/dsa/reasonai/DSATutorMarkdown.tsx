import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { safeExternalUrl } from "./contract";

/** Provider output is text: no HTML, remote images, or executable diagrams. */
export function DSATutorMarkdown({ text }: { text: string }) {
  return <div className="dsa-tutor-prose min-w-0 break-words [overflow-wrap:anywhere]">
    <Markdown remarkPlugins={[remarkGfm]} skipHtml
      allowedElements={["p", "strong", "em", "del", "blockquote", "ul", "ol", "li", "h1", "h2", "h3", "h4", "pre", "code", "a", "br", "hr", "table", "thead", "tbody", "tr", "th", "td"]}
      urlTransform={(url) => safeExternalUrl(url) ?? ""}
      components={{
        a: ({ href, children }) => href ? <a href={href} target="_blank" rel="noopener noreferrer" className="text-accent underline decoration-accent/40 underline-offset-4">{children}</a> : <span>{children}</span>,
        table: ({ children }) => <div tabIndex={0} role="region" aria-label="Scrollable comparison table" className="my-4 max-w-full overflow-x-auto rounded-lg border border-border/50"><table className="w-full text-left text-[0.9em]">{children}</table></div>,
      }}>{text}</Markdown>
  </div>;
}
