import { useCallback, useEffect, useRef, useState } from "react";
import type { FormEvent, KeyboardEvent, ReactNode } from "react";
import ReactMarkdown from "react-markdown";
import { Link, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { LogoMark } from "@/components/Logo";
import SourcePanel from "@/components/SourcePanel";
import {
  ArrowDownIcon,
  BriefcaseIcon,
  CalendarIcon,
  CheckIcon,
  CopyIcon,
  HomeIcon,
  InfoIcon,
  LogOutIcon,
  MenuIcon,
  PencilIcon,
  PlusIcon,
  ReceiptIcon,
  SendIcon,
  ShieldIcon,
  TrashIcon,
} from "@/components/ChatIcons";
import { authFetch, getSession, logout } from "@/lib/auth";

type Source = { section_title: string; similarity: number };
type Message = {
  id: number;
  role: "user" | "assistant";
  text: string;
  sources?: Source[];
};
type ConversationSummary = { id: number; title: string; updated_at: string };

// Example questions grouped by topic; each shows the handbook section its answer lives in.
const TOPICS: { name: string; icon: ReactNode; questions: { question: string; section: string }[] }[] = [
  {
    name: "Leave",
    icon: <CalendarIcon />,
    questions: [
      { question: "How many sick leave days do I get?", section: "1.2" },
      { question: "How many days of annual leave do I get?", section: "1.1" },
    ],
  },
  {
    name: "Remote work",
    icon: <HomeIcon />,
    questions: [
      { question: "Can I work from home on Fridays?", section: "2.1" },
      { question: "What are the core working hours?", section: "2.4" },
    ],
  },
  {
    name: "Expenses",
    icon: <ReceiptIcon />,
    questions: [
      { question: "Can I claim flight tickets?", section: "3.1" },
      { question: "Is my internet bill reimbursed?", section: "3.2" },
    ],
  },
  {
    name: "Benefits and exit",
    icon: <BriefcaseIcon />,
    questions: [
      { question: "What is the annual wellness allowance?", section: "5.3" },
      { question: "What is the notice period when I resign?", section: "7.1" },
    ],
  },
];

const MAX_SOURCES = 3;

const prefersReducedMotion = () =>
  typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/** Buckets for the sidebar: Today, Yesterday, the last week, then older. */
function groupLabel(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "Recent";
  const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const days = Math.round((startOfDay(new Date()) - startOfDay(date)) / 86400000);
  if (days <= 0) return "Today";
  if (days === 1) return "Yesterday";
  if (days < 8) return "Previous 7 days";
  return "Older";
}

function groupConversations(items: ConversationSummary[]) {
  const groups: { label: string; items: ConversationSummary[] }[] = [];
  for (const item of items) {
    const label = groupLabel(item.updated_at);
    const last = groups[groups.length - 1];
    if (last && last.label === label) last.items.push(item);
    else groups.push({ label, items: [item] });
  }
  return groups;
}

/** "4.3 Conflict of Interest" -> section number and name, styled like a handbook citation. Opens the section text. */
function SourceChip({ source, onOpen }: { source: Source; onOpen: () => void }) {
  const match = source.section_title.match(/^(\d+(?:\.\d+)*)\s+(.*)$/);
  return (
    <button
      type="button"
      onClick={onOpen}
      title={`Similarity ${source.similarity}. Click to read the section.`}
      aria-label={`Read section: ${source.section_title}`}
      className="inline-flex cursor-pointer items-center gap-1.5 rounded-md border border-accent-foreground/15 bg-accent px-2 py-1 text-xs text-accent-foreground outline-none transition-colors hover:border-primary/50 hover:bg-accent/70 focus-visible:ring-2 focus-visible:ring-ring"
    >
      {match ? (
        <>
          <span className="font-semibold tabular-nums">§{match[1]}</span>
          <span>{match[2]}</span>
        </>
      ) : (
        source.section_title
      )}
    </button>
  );
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      // Clipboard can be blocked (for example on plain http); nothing useful to show then.
    }
  }

  return (
    <button
      type="button"
      onClick={copy}
      aria-label={copied ? "Answer copied" : "Copy answer"}
      className="inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-xs text-muted-foreground outline-none hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
    >
      {copied ? <CheckIcon size={13} /> : <CopyIcon size={13} />}
      {copied ? "Copied" : "Copy"}
    </button>
  );
}

function AssistantMessage({ message, onOpenSource }: { message: Message; onOpenSource: (title: string) => void }) {
  const declined = /^i don['’]t have/i.test(message.text.trim());
  const sources = [...(message.sources ?? [])]
    .sort((a, b) => b.similarity - a.similarity)
    .slice(0, MAX_SOURCES);
  const notCovered = declined || (message.sources !== undefined && message.sources.length === 0);

  return (
    <div className="group flex animate-msg gap-3">
      <LogoMark size={28} className="mt-1 shrink-0" />
      <div className="min-w-0 max-w-[44rem] flex-1">
        <div
          className={`rounded-2xl rounded-tl-md px-4 py-3 text-[0.9375rem] leading-relaxed [&_blockquote]:border-l-2 [&_blockquote]:pl-3 [&_blockquote]:text-muted-foreground [&_p]:my-1 [&_ul]:my-1 [&_ul]:list-disc [&_ul]:pl-5 ${
            notCovered
              ? "border border-dashed border-primary/30 bg-card/60"
              : "border bg-card shadow-sm shadow-primary/5"
          }`}
        >
          {notCovered && (
            <div className="mb-1 flex items-center gap-1.5 text-xs font-medium text-primary">
              <InfoIcon size={14} />
              Not in the handbook
            </div>
          )}
          <ReactMarkdown>{message.text}</ReactMarkdown>

          {sources.length > 0 && (
            <div className="mt-3 flex flex-wrap items-center gap-2 border-t pt-3">
              <span className="text-xs text-muted-foreground">{declined ? "Closest sections" : "Sources"}</span>
              {sources.map((s) => (
                <SourceChip key={s.section_title} source={s} onOpen={() => onOpenSource(s.section_title)} />
              ))}
            </div>
          )}
          {notCovered && (
            <p className="mt-3 border-t pt-3 text-xs text-muted-foreground">
              The handbook doesn't cover this. For a definite answer, check with HR.
            </p>
          )}
        </div>
        <div className="mt-1 flex opacity-0 transition-opacity focus-within:opacity-100 group-hover:opacity-100 max-md:opacity-100">
          <CopyButton text={message.text} />
        </div>
      </div>
    </div>
  );
}

function TypingIndicator() {
  return (
    <div className="flex animate-msg gap-3" role="status" aria-label="The assistant is typing">
      <LogoMark size={28} className="mt-1 shrink-0" />
      <div className="flex items-center gap-1.5 rounded-2xl rounded-tl-md border bg-card px-4 py-4 shadow-sm shadow-primary/5">
        {[0, 1, 2].map((i) => (
          <span
            key={i}
            className="size-1.5 animate-dot rounded-full bg-primary"
            style={{ animationDelay: `${i * 160}ms` }}
          />
        ))}
      </div>
    </div>
  );
}

/** Placeholder bars while an earlier conversation loads. */
function HistorySkeleton() {
  return (
    <div className="flex flex-col gap-5" role="status" aria-label="Loading conversation">
      <div className="ml-auto h-10 w-2/5 animate-pulse rounded-2xl bg-muted" />
      <div className="flex gap-3">
        <div className="mt-1 size-7 shrink-0 animate-pulse rounded-lg bg-muted" />
        <div className="flex-1 space-y-2.5 rounded-2xl border bg-card p-4">
          <div className="h-3 w-11/12 animate-pulse rounded bg-muted" />
          <div className="h-3 w-4/5 animate-pulse rounded bg-muted" />
          <div className="h-3 w-3/5 animate-pulse rounded bg-muted" />
        </div>
      </div>
    </div>
  );
}

function ConversationRow({
  conversation,
  active,
  onOpen,
  onDelete,
  onRename,
}: {
  conversation: ConversationSummary;
  active: boolean;
  onOpen: () => void;
  onDelete: () => void;
  onRename: (title: string) => void;
}) {
  const [confirming, setConfirming] = useState(false);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const cancelled = useRef(false);

  function startEditing() {
    cancelled.current = false;
    setDraft(conversation.title);
    setEditing(true);
  }

  function finishEditing() {
    if (cancelled.current) return;
    const title = draft.trim();
    setEditing(false);
    if (title && title !== conversation.title) onRename(title);
  }

  if (editing) {
    return (
      <div className="rounded-lg bg-accent px-1.5 py-1">
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onFocus={(e) => e.target.select()}
          onBlur={finishEditing}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              finishEditing();
            } else if (e.key === "Escape") {
              cancelled.current = true;
              setEditing(false);
            }
          }}
          maxLength={120}
          aria-label="Chat name"
          autoFocus
          className="h-8 w-full rounded-md border border-ring bg-background px-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
        />
      </div>
    );
  }

  if (confirming) {
    return (
      <div className="flex items-center gap-1 rounded-lg bg-destructive/10 px-2.5 py-1.5 text-sm">
        <span className="min-w-0 flex-1 truncate">Delete?</span>
        <button
          onClick={onDelete}
          className="rounded-md px-2 py-1 text-xs font-medium text-destructive outline-none hover:bg-destructive/10 focus-visible:ring-2 focus-visible:ring-ring"
        >
          Delete
        </button>
        <button
          onClick={() => setConfirming(false)}
          className="rounded-md px-2 py-1 text-xs text-muted-foreground outline-none hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring"
        >
          Cancel
        </button>
      </div>
    );
  }

  const iconButton =
    "rounded-md p-1.5 text-muted-foreground opacity-0 outline-none hover:text-foreground focus-visible:opacity-100 focus-visible:ring-2 focus-visible:ring-ring group-hover:opacity-100 max-md:opacity-100";

  return (
    <div className={`group flex items-center rounded-lg ${active ? "bg-accent text-accent-foreground" : "hover:bg-muted"}`}>
      <button
        onClick={onOpen}
        onDoubleClick={startEditing}
        aria-current={active ? "true" : undefined}
        title={conversation.title}
        className="min-w-0 flex-1 truncate rounded-lg px-2.5 py-2 text-left text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        {conversation.title}
      </button>
      <button onClick={startEditing} aria-label={`Rename chat: ${conversation.title}`} className={iconButton}>
        <PencilIcon size={15} />
      </button>
      <button onClick={() => setConfirming(true)} aria-label={`Delete chat: ${conversation.title}`} className={`mr-1 ${iconButton}`}>
        <TrashIcon size={15} />
      </button>
    </div>
  );
}

export default function Chat() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [conversations, setConversations] = useState<ConversationSummary[]>([]);
  const [activeId, setActiveId] = useState<number | null>(null);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [showJump, setShowJump] = useState(false);
  const [openSource, setOpenSource] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
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

  const scrollToBottom = useCallback(() => {
    bottomRef.current?.scrollIntoView({ behavior: prefersReducedMotion() ? "auto" : "smooth", block: "end" });
  }, []);

  // Follow the conversation, but leave the welcome screen at the top.
  useEffect(() => {
    if (messages.length > 0 || loading) scrollToBottom();
  }, [messages, loading, scrollToBottom]);

  // Grow the input with its text, up to about six lines.
  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 160)}px`;
  }, [input]);

  // Focus the box on desktop only, so phones don't pop the keyboard open on arrival.
  useEffect(() => {
    if (window.matchMedia("(pointer: fine)").matches) textareaRef.current?.focus();
  }, []);

  function handleScroll() {
    const el = scrollRef.current;
    if (!el) return;
    setShowJump(el.scrollHeight - el.scrollTop - el.clientHeight > 240);
  }

  function newConversation() {
    setMessages([]);
    setActiveId(null);
    setSidebarOpen(false);
  }

  async function openConversation(id: number) {
    if (loading || id === activeId) {
      setSidebarOpen(false);
      return;
    }
    setHistoryLoading(true);
    setSidebarOpen(false);
    try {
      const res = await authFetch(`/api/conversations/${id}/`);
      if (!res.ok) throw new Error("Request failed");
      const data: { messages: Message[] } = await res.json();
      setMessages(data.messages ?? []);
      setActiveId(id);
    } catch {
      // Keep showing the current chat if loading fails.
    } finally {
      setHistoryLoading(false);
    }
  }

  async function deleteConversation(id: number) {
    try {
      const res = await authFetch(`/api/conversations/${id}/`, { method: "DELETE" });
      if (!res.ok) throw new Error("Request failed");
      setConversations((prev) => prev.filter((c) => c.id !== id));
      if (id === activeId) newConversation();
    } catch {
      // Leave the list as it is if the delete failed.
    }
  }

  async function renameConversation(id: number, title: string) {
    const previous = conversations;
    setConversations((list) => list.map((c) => (c.id === id ? { ...c, title } : c)));
    try {
      const res = await authFetch(`/api/conversations/${id}/title/`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title }),
      });
      if (!res.ok) throw new Error("Request failed");
    } catch {
      setConversations(previous); // put the old name back if the server said no
    }
  }

  async function sendQuestion(raw: string) {
    const question = raw.trim();
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

  function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    sendQuestion(input);
  }

  // Enter sends; Shift+Enter adds a new line. Ignore Enter while an input method is composing text.
  function handleKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      sendQuestion(input);
    }
  }

  const isEmpty = messages.length === 0 && !loading && !historyLoading;
  const activeTitle = conversations.find((c) => c.id === activeId)?.title;
  const groups = groupConversations(conversations);

  return (
    <div className="flex h-dvh bg-background">
      {/* Backdrop for the mobile drawer */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-30 bg-black/40 md:hidden"
          onClick={() => setSidebarOpen(false)}
          aria-hidden="true"
        />
      )}

      {/* Sidebar: a drawer on phones, a fixed column from md up */}
      <aside
        className={`fixed inset-y-0 left-0 z-40 flex w-72 shrink-0 flex-col gap-4 border-r bg-sidebar p-4 transition-transform duration-200 md:static md:w-64 md:translate-x-0 ${
          sidebarOpen ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <div className="flex items-center gap-2.5">
          <LogoMark size={30} />
          <span className="font-display text-[0.95rem] font-semibold tracking-tight">Nimbus HR Assistant</span>
        </div>

        <Button className="w-full" onClick={newConversation}>
          <PlusIcon size={16} />
          New chat
        </Button>

        <nav aria-label="Conversations" className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto">
          {conversations.length === 0 && <p className="px-2 py-2 text-sm text-muted-foreground">No chats yet</p>}
          {groups.map((group) => (
            <div key={group.label} className="flex flex-col gap-0.5">
              <p className="px-2.5 pb-1 text-xs font-medium text-muted-foreground">{group.label}</p>
              {group.items.map((c) => (
                <ConversationRow
                  key={c.id}
                  conversation={c}
                  active={c.id === activeId}
                  onOpen={() => openConversation(c.id)}
                  onDelete={() => deleteConversation(c.id)}
                  onRename={(title) => renameConversation(c.id, title)}
                />
              ))}
            </div>
          ))}
        </nav>

        {session?.is_admin && (
          <Link
            to="/admin"
            className="flex items-center gap-2 rounded-lg px-2.5 py-2 text-sm text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            <ShieldIcon size={16} />
            Manage documents and users
          </Link>
        )}

        <div className="flex items-center gap-2.5 border-t pt-4">
          <div className="flex size-8 shrink-0 items-center justify-center rounded-full bg-brand text-xs font-semibold text-white">
            {session?.email?.slice(0, 2).toUpperCase()}
          </div>
          <span className="min-w-0 flex-1 truncate text-sm">{session?.email}</span>
          <button
            onClick={() => {
              logout();
              navigate("/");
            }}
            aria-label="Sign out"
            title="Sign out"
            className="rounded-md p-1.5 text-muted-foreground outline-none hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
          >
            <LogOutIcon size={16} />
          </button>
        </div>
      </aside>

      {/* Main area */}
      <main className="relative flex min-w-0 flex-1 flex-col">
        <header className="flex items-center gap-3 border-b bg-background px-4 py-3 md:px-6 md:py-4">
          <button
            onClick={() => setSidebarOpen(true)}
            aria-label="Open conversations"
            className="-ml-1 rounded-lg p-2 text-muted-foreground hover:bg-muted hover:text-foreground md:hidden"
          >
            <MenuIcon size={20} />
          </button>
          <div className="min-w-0">
            <h1 className="font-display text-base font-semibold tracking-tight">Handbook Q&amp;A</h1>
            <p className="truncate text-xs text-muted-foreground">
              {activeTitle ?? "Nimbus Technologies Employee Handbook"}
            </p>
          </div>
        </header>

        <div ref={scrollRef} onScroll={handleScroll} className="flex-1 overflow-y-auto bg-muted/50 px-4 pt-6">
          <div className="mx-auto flex max-w-3xl flex-col gap-5">
            {isEmpty && (
              <div className="flex animate-rise flex-col gap-8 pt-4 md:pt-10">
                <div>
                  <LogoMark size={44} />
                  <h2 className="mt-5 font-display text-3xl font-semibold tracking-tight md:text-4xl">
                    What would you like to know?
                  </h2>
                  <p className="mt-2 max-w-lg text-muted-foreground">
                    Ask about leave, remote work, expenses or benefits. Every answer shows the handbook section
                    it came from.
                  </p>
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  {TOPICS.map((topic) => (
                    <section key={topic.name} className="rounded-xl border bg-card p-3 shadow-sm shadow-primary/5">
                      <h3 className="flex items-center gap-2 px-1 pb-2 text-sm font-medium">
                        <span className="flex size-7 items-center justify-center rounded-lg bg-accent text-accent-foreground">
                          {topic.icon}
                        </span>
                        {topic.name}
                      </h3>
                      <ul className="flex flex-col">
                        {topic.questions.map((q) => (
                          <li key={q.question}>
                            <button
                              onClick={() => sendQuestion(q.question)}
                              className="flex w-full items-center justify-between gap-3 rounded-lg px-2 py-2 text-left text-sm outline-none hover:bg-accent/60 focus-visible:bg-accent/60 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
                            >
                              <span>{q.question}</span>
                              <span
                                className="shrink-0 text-xs font-semibold tabular-nums text-muted-foreground"
                                title="Handbook section with the answer"
                              >
                                §{q.section}
                              </span>
                            </button>
                          </li>
                        ))}
                      </ul>
                    </section>
                  ))}
                </div>
              </div>
            )}

            {historyLoading && <HistorySkeleton />}

            {!historyLoading &&
              messages.map((m) =>
                m.role === "user" ? (
                  <div key={m.id} className="flex animate-msg justify-end">
                    <div className="max-w-[85%] rounded-2xl rounded-br-md bg-brand px-4 py-2.5 text-[0.9375rem] text-white shadow-sm">
                      {m.text}
                    </div>
                  </div>
                ) : (
                  <AssistantMessage key={m.id} message={m} onOpenSource={setOpenSource} />
                ),
              )}

            {loading && <TypingIndicator />}
            {/* The spacer keeps the last message clear of the floating input. */}
            <div ref={bottomRef} className="h-44" aria-hidden="true" />
          </div>
        </div>

        {/* Floating input: a glass bar over a soft fade, so messages scroll underneath it. */}
        <div className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-background via-background/90 to-transparent px-4 pb-4 pt-10">
          <div className="pointer-events-auto relative mx-auto max-w-3xl">
            {showJump && (
              <button
                type="button"
                onClick={scrollToBottom}
                className="absolute -top-12 left-1/2 flex -translate-x-1/2 items-center gap-1.5 rounded-full border bg-card px-3 py-1.5 text-xs shadow-md outline-none hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring"
              >
                <ArrowDownIcon size={14} />
                Jump to latest
              </button>
            )}
            <form
              onSubmit={handleSubmit}
              className="flex items-end gap-2 rounded-2xl border bg-card/85 p-2 shadow-lg shadow-primary/10 backdrop-blur-xl focus-within:border-ring focus-within:ring-[3px] focus-within:ring-ring/25"
            >
              <textarea
                ref={textareaRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                rows={1}
                placeholder="Ask about leave, remote work, expenses…"
                aria-label="Ask a question about the employee handbook"
                className="max-h-40 min-h-10 flex-1 resize-none bg-transparent px-2.5 py-2 text-[0.9375rem] outline-none placeholder:text-muted-foreground"
              />
              <button
                type="submit"
                disabled={loading || !input.trim()}
                aria-label="Send question"
                className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-brand text-white shadow-sm outline-none transition-opacity focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:opacity-40"
              >
                <SendIcon size={18} />
              </button>
            </form>
            <p className="mt-2 text-center text-xs text-muted-foreground">
              Answers come from your company handbook and may not cover every situation.
              <span className="hidden sm:inline"> Enter to send, Shift+Enter for a new line.</span>
            </p>
          </div>
        </div>
      </main>

      {openSource && <SourcePanel title={openSource} onClose={() => setOpenSource(null)} />}
    </div>
  );
}
