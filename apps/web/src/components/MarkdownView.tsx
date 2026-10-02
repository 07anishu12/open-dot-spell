import { Fragment } from "react";

interface MarkdownViewProps {
  content: string;
}

/**
 * Validates URLs to prevent script injection (e.g. javascript:, data:, vbscript:).
 * Only allows http://, https://, or relative anchor links.
 */
function sanitizeUrl(rawUrl: string): string | null {
  const trimmed = rawUrl.trim();
  if (/^https?:\/\//i.test(trimmed) || trimmed.startsWith("#") || trimmed.startsWith("/")) {
    return trimmed;
  }
  return null;
}

/**
 * Parses inline formatting (bold, italic, inline code, links) into React elements.
 */
function renderInline(text: string, keyPrefix: string): React.ReactNode[] {
  const nodes: React.ReactNode[] = [];
  // Tokenizer regex for inline code, links, bold, and italic
  // 1: code `...`
  // 2: link [text](url) -> (2: text, 3: url)
  // 4: bold **...**
  // 5: italic *...*
  const regex = /(`([^`]+)`)|(\[([^\]]+)\]\(([^)]+)\))|(\*\*([^*]+)\*\*)|(\*([^*]+)\*)/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  let matchId = 0;

  while ((match = regex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      nodes.push(text.slice(lastIndex, match.index));
    }

    const key = `${keyPrefix}_${matchId++}`;

    if (match[1]) {
      // Inline code: `code`
      nodes.push(
        <code key={key} className="ods-inline-code">
          {match[2]}
        </code>
      );
    } else if (match[3]) {
      // Link: [text](url)
      const linkText = match[4];
      const linkUrl = sanitizeUrl(match[5] || "");
      if (linkUrl) {
        nodes.push(
          <a
            key={key}
            href={linkUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="ods-link"
          >
            {linkText}
          </a>
        );
      } else {
        nodes.push(linkText);
      }
    } else if (match[6]) {
      // Bold: **text**
      nodes.push(<strong key={key}>{match[7]}</strong>);
    } else if (match[8]) {
      // Italic: *text*
      nodes.push(<em key={key}>{match[9]}</em>);
    }

    lastIndex = regex.lastIndex;
  }

  if (lastIndex < text.length) {
    nodes.push(text.slice(lastIndex));
  }

  return nodes.length > 0 ? nodes : [text];
}

/**
 * Safe, zero-dangerouslySetInnerHTML Markdown renderer for assistant responses.
 * Renders headers, lists, code blocks, blockquotes, and inline formatting
 * without ever executing raw HTML or script tags.
 */
export function MarkdownView({ content }: MarkdownViewProps) {
  if (!content) return null;

  // Split content by fenced code blocks
  const parts = content.split(/(```[\s\S]*?```)/g);

  return (
    <div className="ods-markdown">
      {parts.map((part, partIdx) => {
        if (part.startsWith("```") && part.endsWith("```")) {
          // Code block
          const lines = part.slice(3, -3).split("\n");
          const firstLine = lines[0]?.trim() || "";
          const codeBody = (firstLine ? lines.slice(1) : lines).join("\n").replace(/\n$/, "");
          return (
            <div key={`block_${partIdx}`} className="ods-code-block-wrapper">
              {firstLine && <div className="ods-code-lang">{firstLine}</div>}
              <pre className="ods-code-block">
                <code>{codeBody}</code>
              </pre>
            </div>
          );
        }

        // Process non-code block text into paragraphs, headings, and lists
        const lines = part.split("\n");
        const elements: React.ReactNode[] = [];
        let currentList: { type: "ul" | "ol"; items: string[] } | null = null;

        const flushList = () => {
          if (!currentList) return;
          const ListTag = currentList.type;
          const listKey = `list_${partIdx}_${elements.length}`;
          elements.push(
            <ListTag key={listKey} className="ods-list">
              {currentList.items.map((item, itemIdx) => (
                <li key={`${listKey}_${itemIdx}`}>
                  {renderInline(item, `${listKey}_${itemIdx}`)}
                </li>
              ))}
            </ListTag>
          );
          currentList = null;
        };

        lines.forEach((line, lineIdx) => {
          const trimmed = line.trim();

          // Heading checks
          if (trimmed.startsWith("### ")) {
            flushList();
            elements.push(
              <h3 key={`h3_${partIdx}_${lineIdx}`} className="ods-h3">
                {renderInline(trimmed.slice(4), `h3_${partIdx}_${lineIdx}`)}
              </h3>
            );
            return;
          }
          if (trimmed.startsWith("## ")) {
            flushList();
            elements.push(
              <h2 key={`h2_${partIdx}_${lineIdx}`} className="ods-h2">
                {renderInline(trimmed.slice(3), `h2_${partIdx}_${lineIdx}`)}
              </h2>
            );
            return;
          }
          if (trimmed.startsWith("# ")) {
            flushList();
            elements.push(
              <h1 key={`h1_${partIdx}_${lineIdx}`} className="ods-h1">
                {renderInline(trimmed.slice(2), `h1_${partIdx}_${lineIdx}`)}
              </h1>
            );
            return;
          }

          // Unordered list
          if (/^[-*+]\s+/.test(trimmed)) {
            const itemText = trimmed.replace(/^[-*+]\s+/, "");
            if (!currentList || currentList.type !== "ul") {
              flushList();
              currentList = { type: "ul", items: [] };
            }
            currentList.items.push(itemText);
            return;
          }

          // Ordered list
          if (/^\d+\.\s+/.test(trimmed)) {
            const itemText = trimmed.replace(/^\d+\.\s+/, "");
            if (!currentList || currentList.type !== "ol") {
              flushList();
              currentList = { type: "ol", items: [] };
            }
            currentList.items.push(itemText);
            return;
          }

          // Blockquote
          if (trimmed.startsWith("> ")) {
            flushList();
            elements.push(
              <blockquote key={`quote_${partIdx}_${lineIdx}`} className="ods-blockquote">
                {renderInline(trimmed.slice(2), `quote_${partIdx}_${lineIdx}`)}
              </blockquote>
            );
            return;
          }

          // Blank line
          if (trimmed === "") {
            flushList();
            return;
          }

          // Regular paragraph line
          flushList();
          elements.push(
            <p key={`p_${partIdx}_${lineIdx}`} className="ods-p">
              {renderInline(line, `p_${partIdx}_${lineIdx}`)}
            </p>
          );
        });

        flushList();
        return <Fragment key={`part_${partIdx}`}>{elements}</Fragment>;
      })}
    </div>
  );
}
