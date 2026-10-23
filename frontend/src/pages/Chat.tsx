import { useEffect, useRef, useState } from "react";
import type { FormEvent } from "react";
import ReactMarkdown from "react-markdown";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

const API_URL = "http://127.0.0.1:8001";

type Source = { section_title: string; similarity: number };
type Message = {
  id: number;
  role: "user" | "assistant";
  text: string;
  sources?: Source[];
};

const greeting: Message = {
  id: 0,
  role: "assistant",
  text: "Hi! Ask me anything about the Nimbus employee handbook, like leave, remote work, expenses or benefits.",
};

// Placeholder history. Real saved conversations come in a later step.
const recentChats = [
  "Remote work eligibility",
  "Sick leave balance",
  "Maternity leave duration",
];

export default function Chat() {
  const [messages, setMessages] = useState<Message[]>([greeting]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const question = input.trim();
    if (!question || loading) return;

    setMessages((prev) => [...prev, { id: Date.now(), role: "user", text: question }]);
    setInput("");
    setLoading(true);

    try {
      const res = await fetch(`${API_URL}/query`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question }),
      });
      if (!res.ok) throw new Error(`Request failed: ${res.status}`);
      const data: { answer: string; sources: Source[] } = await res.json();
      setMessages((prev) => [
        ...prev,
        { id: Date.now() + 1, role: "assistant", text: data.answer, sources: data.sources },
      ]);
    } catch {
      setMessages((prev) => [
        ...prev,
        {
          id: Date.now() + 1,
          role: "assistant",
          text: "Sorry, I couldn't reach the assistant. Please make sure the RAG service is running and try again.",
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

        <Button variant="outline" className="w-full" onClick={() => setMessages([greeting])}>
          + New conversation
        </Button>

        <div className="flex flex-col gap-1">
          <p className="px-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Recent
          </p>
          {recentChats.map((title) => (
            <div key={title} className="rounded-md px-2 py-2 text-sm text-muted-foreground">
              {title}
            </div>
          ))}
        </div>

        <div className="mt-auto flex items-center gap-2 border-t pt-4">
          <div className="flex size-7 items-center justify-center rounded-full bg-muted text-xs font-semibold">
            SA
          </div>
          <span className="text-sm text-muted-foreground">Sruthi Akella</span>
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