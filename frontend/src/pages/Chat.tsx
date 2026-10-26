import { useCallback, useEffect, useRef, useState } from "react";
import type { FormEvent } from "react";
import ReactMarkdown from "react-markdown";
import { Link, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { authFetch, getSession, logout } from "@/lib/auth";

type Source = { section_title: string; similarity: number };
type Message = {
  id: number;
  role: "user" | "assistant";
  text: string;
  sources?: Source[];
};
type ConversationSummary = { id: number; title: string; updated_at: string };

const greeting: Message = {
  id: 0,
  role: "assistant",
  text: "Hi! Ask me anything about the Nimbus employee handbook, like leave, remote work, expenses or benefits.",
};

export default function Chat() {
  const [messages, setMessages] = useState<Message[]>([greeting]);
  const [conversations, setConversations] = useState<ConversationSummary[]>([]);
  const [activeId, setActiveId] = useState<number | null>(null);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const session = getSession();
  const navigate = useNavigate();

  const loadConversations = useCallback(async () => {
    try {
      const res = await authFetch("/api/conversations/");
      if (res.status === 401) {
        logout();
        navigate("/");
        return;
      }
      if (res.ok) setConversations(await res.json());
    } catch {
      // Sidebar simply stays empty if the server is unreachable.
    }
  }, [navigate]);

  useEffect(() => {
    loadConversations();
  }, [loadConversations]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  function newConversation() {
    setMessages([greeting]);
    setActiveId(null);
  }

  async function openConversation(id: number) {
    if (loading || id === activeId) return;
    try {
      const res = await authFetch(`/api/conversations/${id}/`);
      if (!res.ok) throw new Error("Request failed");
      const data: { messages: Message[] } = await res.json();
      setMessages([greeting, ...data.messages]);
      setActiveId(id);
    } catch {
      // Keep showing the current chat if loading fails.
    }
  }

  async function deleteConversation(id: number) {
    if (!window.confirm("Delete this chat?")) return;
    try {
      const res = await authFetch(`/api/conversations/${id}/`, { method: "DELETE" });
      if (!res.ok) throw new Error("Request failed");
      setConversations((prev) => prev.filter((c) => c.id !== id));
      if (id === activeId) newConversation();
    } catch {
      // Leave the list as it is if the delete failed.
    }
  }

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const question = input.trim();
    if (!question || loading) return;

    setMessages((prev) => [...prev, { id: Date.now(), role: "user", text: question }]);
    setInput("");
    setLoading(true);

    try {
      const res = await authFetch("/api/conversations/ask/", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question, conversation_id: activeId }),
      });
      if (res.status === 401) {
        logout();
        navigate("/");
        return;
      }
      if (!res.ok) throw new Error(`Request failed: ${res.status}`);
      const data: { conversation_id: number; answer: string; sources: Source[] } = await res.json();
      setActiveId(data.conversation_id);
      setMessages((prev) => [
        ...prev,
        { id: Date.now() + 1, role: "assistant", text: data.answer, sources: data.sources },
      ]);
      loadConversations();
    } catch {
      setMessages((prev) => [
        ...prev,
        {
          id: Date.now() + 1,
          role: "assistant",
          text: "Sorry, I couldn't reach the assistant. Please make sure the Django and RAG services are running and try again.",
        },
      ]);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex h-screen bg-muted/40">
      {/* Sidebar */}
      <aside className="hidden w-64 shrink-0 flex-col gap-4 border-r bg-background p-4 md:flex">
        <div className="flex items-center gap-2">
          <div className="flex size-8 items-center justify-center rounded-lg bg-primary text-sm font-bold text-primary-foreground">
            N
          </div>
          <span className="text-sm font-semibold">Nimbus HR Assistant</span>
        </div>

        <Button variant="outline" className="w-full" onClick={newConversation}>
          + New conversation
        </Button>

        <div className="flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto">
          <p className="px-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Recent
          </p>
          {conversations.length === 0 && (
            <p className="px-2 py-2 text-sm text-muted-foreground">No chats yet</p>
          )}
          {conversations.map((c) => (
            <div
              key={c.id}
              className={`group flex items-center rounded-md ${
                c.id === activeId ? "bg-muted" : "hover:bg-muted/60"
              }`}
            >
              <button
                onClick={() => openConversation(c.id)}
                className="min-w-0 flex-1 truncate px-2 py-2 text-left text-sm"
              >
                {c.title}
              </button>
              <button
                onClick={() => deleteConversation(c.id)}
                aria-label={`Delete chat: ${c.title}`}
                className="px-2 text-muted-foreground opacity-0 hover:text-foreground focus:opacity-100 group-hover:opacity-100"
              >
                ×
              </button>
            </div>
          ))}
        </div>

        {session?.is_admin && (
          <Link to="/admin" className="px-2 text-sm text-muted-foreground hover:text-foreground">
            Manage documents
          </Link>
        )}

        <div className="mt-auto flex items-center gap-2 border-t pt-4">
          <div className="flex size-7 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-semibold">
            {session?.email?.slice(0, 2).toUpperCase()}
          </div>
          <div className="flex min-w-0 flex-col">
            <span className="truncate text-sm">{session?.email}</span>
            <button
              onClick={() => {
                logout();
                navigate("/");
              }}
              className="w-fit text-xs text-muted-foreground hover:text-foreground"
            >
              Sign out
            </button>
          </div>
        </div>
      </aside>

      {/* Main area */}
      <main className="flex min-w-0 flex-1 flex-col">
        <header className="border-b bg-background px-6 py-4">
          <h1 className="text-base font-semibold">Handbook Q&amp;A</h1>
          <p className="text-xs text-muted-foreground">
            Source document: Nimbus Technologies Employee Handbook
          </p>
        </header>

        <div className="flex-1 overflow-y-auto px-4 py-6">
          <div className="mx-auto flex max-w-3xl flex-col gap-5">
            {messages.map((m) =>
              m.role === "user" ? (
                <div key={m.id} className="flex justify-end">
                  <div className="max-w-[80%] rounded-2xl rounded-br-sm bg-primary px-4 py-3 text-sm text-primary-foreground">
                    {m.text}
                  </div>
                </div>
              ) : (
                <div key={m.id} className="flex justify-start">
                  <div className="flex max-w-[85%] flex-col gap-2">
                    <div className="rounded-2xl rounded-bl-sm border bg-background px-4 py-3 text-sm leading-relaxed [&_blockquote]:border-l-2 [&_blockquote]:pl-3 [&_blockquote]:text-muted-foreground [&_p]:my-1 [&_ul]:my-1 [&_ul]:list-disc [&_ul]:pl-5">
                      <ReactMarkdown>{m.text}</ReactMarkdown>
                    </div>

                    {m.sources && m.sources.length > 0 && (
                      <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                        <span>Sections consulted:</span>
                        {m.sources.map((s) => (
                          <span
                            key={s.section_title}
                            title={`Similarity ${s.similarity}`}
                            className="rounded-full border bg-background px-2.5 py-1"
                          >
                            {s.section_title}
                          </span>
                        ))}
                      </div>
                    )}

                    {m.sources && m.sources.length === 0 && (
                      <div className="w-fit rounded-full border bg-background px-2.5 py-1 text-xs text-muted-foreground">
                        Not covered in the handbook
                      </div>
                    )}
                  </div>
                </div>
              ),
            )}

            {loading && (
              <div className="flex justify-start">
                <div className="rounded-2xl rounded-bl-sm border bg-background px-4 py-3 text-sm text-muted-foreground">
                  Thinking…
                </div>
              </div>
            )}
            <div ref={bottomRef} />
          </div>
        </div>

        <div className="border-t bg-background px-4 py-4">
          <form onSubmit={handleSubmit} className="mx-auto flex max-w-3xl gap-2">
            <Input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Ask about leave, remote work, expenses…"
              aria-label="Ask a question about the employee handbook"
              autoFocus
            />
            <Button type="submit" disabled={loading || !input.trim()}>
              Send
            </Button>
          </form>
          <p className="mx-auto mt-2 max-w-3xl text-center text-xs text-muted-foreground">
            Answers come from your company handbook and may not cover every situation.
          </p>
        </div>
      </main>
    </div>
  );
}