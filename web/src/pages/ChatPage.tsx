import { useState, useRef, useEffect, useCallback } from "react";
import { Send, Loader2, AlertCircle, Bot, User } from "lucide-react";
import { api, getStoredToken } from "@/lib/api";
import { Markdown } from "@/components/Markdown";

interface Message {
  role: "user" | "assistant" | "system";
  content: string;
}

export default function ChatPage() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [available, setAvailable] = useState<boolean | null>(null);
  const [unavailableMsg, setUnavailableMsg] = useState("");
  const [sessionId, setSessionId] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // Check if API server is available
  useEffect(() => {
    api.checkChatStatus().then((resp) => {
      setAvailable(resp.available);
      if (!resp.available) setUnavailableMsg(resp.message || "");
    }).catch(() => setAvailable(false));
  }, []);

  // Auto-scroll to bottom
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  // Auto-resize textarea
  const handleInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInput(e.target.value);
    const el = e.target;
    el.style.height = "auto";
    el.style.height = Math.min(el.scrollHeight, 160) + "px";
  };

  const sendMessage = useCallback(async () => {
    const text = input.trim();
    if (!text || streaming) return;

    const userMsg: Message = { role: "user", content: text };
    const newMessages = [...messages, userMsg];
    setMessages(newMessages);
    setInput("");
    setStreaming(true);

    // Reset textarea height
    if (inputRef.current) inputRef.current.style.height = "auto";

    // Build messages payload for the API
    const apiMessages = newMessages.map((m) => ({ role: m.role, content: m.content }));

    try {
      const token = getStoredToken();
      const headers: Record<string, string> = { "Content-Type": "application/json" };
      if (token) headers["Authorization"] = `Bearer ${token}`;

      const resp = await fetch("/api/chat/send", {
        method: "POST",
        headers,
        body: JSON.stringify({
          messages: apiMessages,
          session_id: sessionId,
        }),
      });

      if (!resp.ok || !resp.body) {
        const errText = await resp.text().catch(() => "Unknown error");
        setMessages((prev) => [...prev, { role: "assistant", content: `Error: ${errText}` }]);
        setStreaming(false);
        return;
      }

      // Parse SSE stream
      const reader = resp.body.getReader();
      const decoder = new TextDecoder();
      let assistantContent = "";
      let buffer = "";

      // Add empty assistant message to fill incrementally
      setMessages((prev) => [...prev, { role: "assistant", content: "" }]);

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";

        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          const data = line.slice(6);
          if (data === "[DONE]") continue;

          try {
            const parsed = JSON.parse(data);
            // Handle error from proxy
            if (parsed.error) {
              assistantContent += parsed.error;
              setMessages((prev) => {
                const updated = [...prev];
                updated[updated.length - 1] = { role: "assistant", content: assistantContent };
                return updated;
              });
              continue;
            }
            // OpenAI-compatible streaming chunk
            const delta = parsed.choices?.[0]?.delta?.content;
            if (delta) {
              assistantContent += delta;
              setMessages((prev) => {
                const updated = [...prev];
                updated[updated.length - 1] = { role: "assistant", content: assistantContent };
                return updated;
              });
            }
            // Extract session ID from first chunk if present
            if (!sessionId && parsed.id) {
              setSessionId(parsed.id);
            }
          } catch {
            // Skip unparseable lines
          }
        }
      }
    } catch (err) {
      setMessages((prev) => [...prev, { role: "assistant", content: `Connection error: ${err}` }]);
    } finally {
      setStreaming(false);
      inputRef.current?.focus();
    }
  }, [input, messages, streaming, sessionId]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  // Unavailable state
  if (available === false) {
    return (
      <div className="flex flex-col items-center justify-center py-24 text-muted-foreground gap-3">
        <AlertCircle className="h-8 w-8 opacity-40" />
        <p className="text-sm font-medium">Chat unavailable</p>
        <p className="text-xs text-center max-w-sm leading-relaxed">
          {unavailableMsg || "The API server platform is not running. Start the gateway with the API server platform enabled to use chat."}
        </p>
        <code className="text-xs bg-muted/50 px-3 py-1.5 font-mono">
          hermes gateway start
        </code>
      </div>
    );
  }

  // Loading state
  if (available === null) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="flex flex-col h-[calc(100vh-8rem)] sm:h-[calc(100vh-10rem)]">
      {/* Messages area */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto space-y-1 pb-4">
        {messages.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full text-muted-foreground gap-2">
            <Bot className="h-8 w-8 opacity-30" />
            <p className="text-sm">Send a message to start chatting with Hermes</p>
          </div>
        )}
        {messages.map((msg, i) => (
          <div
            key={i}
            className={`flex gap-3 px-2 py-3 ${msg.role === "user" ? "" : "bg-muted/20"}`}
          >
            <div className="shrink-0 mt-0.5">
              {msg.role === "user" ? (
                <User className="h-5 w-5 text-muted-foreground" />
              ) : (
                <Bot className="h-5 w-5 text-foreground" />
              )}
            </div>
            <div className="flex-1 min-w-0 text-sm leading-relaxed">
              {msg.role === "assistant" ? (
                <Markdown content={msg.content || (streaming && i === messages.length - 1 ? "..." : "")} />
              ) : (
                <p className="whitespace-pre-wrap">{msg.content}</p>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Input area — sticky bottom */}
      <div className="border-t border-border bg-background/80 backdrop-blur-sm pt-3 pb-1">
        <div className="flex items-end gap-2">
          <textarea
            ref={inputRef}
            value={input}
            onChange={handleInputChange}
            onKeyDown={handleKeyDown}
            placeholder="Message Hermes..."
            rows={1}
            disabled={streaming}
            className="flex-1 resize-none bg-muted/30 border border-border px-3 py-2.5 text-sm placeholder:text-muted-foreground/40 focus:outline-none focus:border-foreground/30 min-h-[40px] max-h-[160px]"
          />
          <button
            type="button"
            onClick={sendMessage}
            disabled={streaming || !input.trim()}
            className="h-10 w-10 flex items-center justify-center bg-foreground text-background shrink-0 disabled:opacity-30 cursor-pointer disabled:cursor-not-allowed"
          >
            {streaming ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Send className="h-4 w-4" />
            )}
          </button>
        </div>
        {sessionId && (
          <p className="text-[0.6rem] text-muted-foreground/40 mt-1 text-right font-mono">
            session: {sessionId.slice(0, 8)}
          </p>
        )}
      </div>
    </div>
  );
}
