import { Check, Clipboard, RotateCcw, ThumbsDown, ThumbsUp } from "lucide-react";
import { useState } from "react";
import ReactMarkdown from "react-markdown";
import rehypeSanitize from "rehype-sanitize";
import remarkGfm from "remark-gfm";
import { setAiMessageFeedback } from "../../services/aiService";

function CodeBlock({ children, className }) {
  const [copied, setCopied] = useState(false);
  const code = String(children || "").replace(/\n$/, "");
  const language = String(className || "").replace("language-", "") || "Code";
  const copy = async () => {
    await navigator.clipboard.writeText(code);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1500);
  };
  return (
    <div className="ai-code-block">
      <div><span>{language}</span><button type="button" onClick={copy} title="Copy code">{copied ? <Check size={15} /> : <Clipboard size={15} />}<span>{copied ? "Copied" : "Copy"}</span></button></div>
      <pre><code className={className}>{code}</code></pre>
    </div>
  );
}

export default function AiMessage({ message, onRegenerate }) {
  const [copied, setCopied] = useState(false);
  const [feedback, setFeedback] = useState(message.feedback || "");
  const text = message.content?.text || message.text || "";
  const isAssistant = message.role === "assistant";
  const sources = Array.isArray(message.content?.sources) ? message.content.sources : [];

  const copy = async () => {
    await navigator.clipboard.writeText(text);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1500);
  };
  const rate = async (value) => {
    if (!message.id || String(message.id).startsWith("stream-")) return;
    await setAiMessageFeedback(message.id, value);
    setFeedback(value);
  };

  return (
    <article className={`ai-message ${isAssistant ? "assistant" : "student"}`}>
      <div className="ai-message-label">{isAssistant ? "Zentel AI" : "You"}</div>
      <div className="ai-message-content">
        {isAssistant ? (
          <ReactMarkdown
            remarkPlugins={[remarkGfm]}
            rehypePlugins={[rehypeSanitize]}
            components={{
              pre: ({ children }) => children,
              code: ({ children, className }) => className ? <CodeBlock className={className}>{children}</CodeBlock> : <code>{children}</code>
            }}
          >
            {text}
          </ReactMarkdown>
        ) : <p>{text}</p>}
        {message.status === "streaming" && !text ? <span className="ai-thinking" role="status">Preparing a helpful response</span> : null}
        {message.status === "failed" ? <p className="form-status warning">This response was not completed. Reserved credits were returned.</p> : null}
        {sources.length ? (
          <div className="ai-sources">
            <h4>Sources</h4>
            <ol>{sources.map((source, index) => <li key={`${source.url}-${index}`}><a href={source.url} target="_blank" rel="noreferrer">{source.title || source.url}</a></li>)}</ol>
          </div>
        ) : null}
      </div>
      {isAssistant && text ? (
        <div className="ai-message-actions" aria-label="Response actions">
          <button type="button" title="Copy response" onClick={copy}>{copied ? <Check size={16} /> : <Clipboard size={16} />}<span className="sr-only">Copy response</span></button>
          <button className={feedback === "positive" ? "active" : ""} type="button" title="Helpful response" onClick={() => rate("positive")}><ThumbsUp size={16} /><span className="sr-only">Helpful response</span></button>
          <button className={feedback === "negative" ? "active" : ""} type="button" title="Response needs improvement" onClick={() => rate("negative")}><ThumbsDown size={16} /><span className="sr-only">Response needs improvement</span></button>
          {onRegenerate ? <button type="button" title="Regenerate response" onClick={onRegenerate}><RotateCcw size={16} /><span className="sr-only">Regenerate response</span></button> : null}
        </div>
      ) : null}
    </article>
  );
}
