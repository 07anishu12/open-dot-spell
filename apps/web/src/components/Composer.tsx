import { useState, useRef, useEffect, type FormEvent, type KeyboardEvent } from "react";

interface ComposerProps {
  onSendMessage: (content: string) => void;
  disabled?: boolean;
  isStreaming?: boolean;
  onInterruptStream?: () => void;
  placeholder?: string;
}

export function Composer({
  onSendMessage,
  disabled = false,
  isStreaming = false,
  onInterruptStream,
  placeholder = "Send a message... (Enter to send, Shift+Enter for new line)"
}: ComposerProps) {
  const [content, setContent] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Auto-resize textarea height as content changes
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
      const nextHeight = Math.min(textareaRef.current.scrollHeight, 200);
      textareaRef.current.style.height = `${Math.max(nextHeight, 52)}px`;
    }
  }, [content]);

  const handleSubmit = (e?: FormEvent) => {
    if (e) e.preventDefault();
    const val = textareaRef.current?.value || content;
    const trimmed = val.trim();
    if (!trimmed || disabled || isStreaming) return;

    onSendMessage(trimmed);
    setContent("");
    if (textareaRef.current) {
      textareaRef.current.value = "";
      textareaRef.current.style.height = "52px";
    }
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  return (
    <form onSubmit={handleSubmit} className="ods-composer-form" aria-label="Message composer">
      <div className="ods-composer-box">
        <textarea
          ref={textareaRef}
          value={content}
          onChange={(e) => setContent(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          disabled={disabled || isStreaming}
          className="ods-composer-textarea"
          aria-label="Message input"
          rows={1}
        />
        <div className="ods-composer-actions">
          {isStreaming ? (
            <button
              type="button"
              onClick={onInterruptStream}
              className="ods-btn ods-btn-danger ods-btn-composer"
              aria-label="Stop generation"
            >
              <span className="ods-stop-icon" aria-hidden="true" /> Stop
            </button>
          ) : (
            <button
              type="submit"
              disabled={disabled || !content.trim()}
              className="ods-btn ods-btn-primary ods-btn-composer"
              aria-label="Send message"
            >
              Send
            </button>
          )}
        </div>
      </div>
      <div className="ods-composer-hint">
        <span>Enter to send • Shift+Enter for new line</span>
      </div>
    </form>
  );
}
