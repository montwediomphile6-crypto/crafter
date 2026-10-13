import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/_authenticated/app")({
  head: () => ({
    meta: [
      { title: "Workspace — PromptForge" },
      {
        name: "description",
        content: "Chat with AI to build and refine single-file websites, then download them.",
      },
      { property: "og:title", content: "Workspace — PromptForge" },
      {
        property: "og:description",
        content: "Chat with AI to build and refine single-file websites, then download them.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Workspace,
});

type Project = {
  id: string;
  name: string;
  html: string;
  created_at: string;
  updated_at: string;
};

type Message = { id: string; role: string; content: string; created_at: string };

function Workspace() {
  const navigate = useNavigate();
  const [projects, setProjects] = useState<Project[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [html, setHtml] = useState("");
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  const active = projects.find((p) => p.id === activeId) ?? null;

  const loadProjects = useCallback(async () => {
    const { data } = await supabase
      .from("projects")
      .select("*")
      .order("updated_at", { ascending: false });
    const list = (data ?? []) as Project[];
    setProjects(list);
    setActiveId((cur) => cur ?? list[0]?.id ?? null);
  }, []);

  useEffect(() => {
    loadProjects();
  }, [loadProjects]);

  useEffect(() => {
    if (!activeId) {
      setMessages([]);
      setHtml("");
      return;
    }
    const project = projects.find((p) => p.id === activeId);
    setHtml(project?.html ?? "");
    supabase
      .from("messages")
      .select("*")
      .eq("project_id", activeId)
      .order("created_at", { ascending: true })
      .then(({ data }) => setMessages((data ?? []) as Message[]));
  }, [activeId, projects]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [messages, busy]);

  const newProject = () => {
    setActiveId(null);
    setMessages([]);
    setHtml("");
    setInput("");
    setError(null);
  };

  const signOut = async () => {
    await supabase.auth.signOut();
    navigate({ to: "/" });
  };

  const send = async (e: React.FormEvent) => {
    e.preventDefault();
    const instruction = input.trim();
    if (!instruction || busy) return;
    setBusy(true);
    setError(null);
    setInput("");

    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const session = sessionData.session;
      if (!session) throw new Error("Your session expired. Please sign in again.");
      const userId = session.user.id;

      let projectId = activeId;
      if (!projectId) {
        const { data, error: insertError } = await supabase
          .from("projects")
          .insert({
            user_id: userId,
            name: instruction.slice(0, 60),
            html: "",
          })
          .select()
          .single();
        if (insertError) throw insertError;
        projectId = (data as Project).id;
        setProjects((prev) => [data as Project, ...prev]);
        setActiveId(projectId);
      }

      setMessages((prev) => [
        ...prev,
        {
          id: `local-${Date.now()}`,
          role: "user",
          content: instruction,
          created_at: new Date().toISOString(),
        },
      ]);
      await supabase
        .from("messages")
        .insert({ project_id: projectId, user_id: userId, role: "user", content: instruction });

      const response = await fetch("/api/generate", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ instruction, currentHtml: html || null }),
      });

      if (!response.ok || !response.body) {
        throw new Error((await response.text()) || "Generation failed");
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let acc = "";
      setHtml("");
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        acc += decoder.decode(value, { stream: true });
        setHtml(acc);
      }

      const finalHtml = cleanHtml(acc);
      setHtml(finalHtml);

      await supabase
        .from("projects")
        .update({ html: finalHtml, updated_at: new Date().toISOString() })
        .eq("id", projectId);
      await supabase.from("messages").insert({
        project_id: projectId,
        user_id: userId,
        role: "assistant",
        content: "Updated the website preview.",
      });

      setMessages((prev) => [
        ...prev,
        {
          id: `local-a-${Date.now()}`,
          role: "assistant",
          content: "Updated the website preview.",
          created_at: new Date().toISOString(),
        },
      ]);
      await loadProjects();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setBusy(false);
    }
  };

  const download = () => {
    const blob = new Blob([html], { type: "text/html" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${(active?.name ?? "promptforge-site").replace(/[^a-z0-9-]+/gi, "-").toLowerCase()}.html`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="flex h-screen flex-col bg-background text-foreground">
      <header className="flex items-center justify-between border-b border-border px-4 py-3">
        <div className="flex items-center gap-3">
          <span className="font-display text-lg font-bold">
            Prompt<span className="text-gradient">Forge</span>
          </span>
          <span className="truncate text-sm text-muted-foreground">
            {active?.name ?? "Untitled project"}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <Link
            to="/generate"
            className="rounded-lg border border-border px-3 py-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
          >
            Templates
          </Link>
          <button
            onClick={download}
            disabled={!html}
            className="rounded-lg bg-gradient-brand px-3 py-1.5 text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-40"
          >
            Download HTML
          </button>
          <button
            onClick={signOut}
            className="rounded-lg border border-border px-3 py-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
          >
            Sign out
          </button>
        </div>
      </header>

      <div className="flex min-h-0 flex-1">
        <aside className="hidden w-56 shrink-0 flex-col border-r border-border p-3 lg:flex">
          <button
            onClick={newProject}
            className="mb-3 rounded-lg border border-border px-3 py-2 text-sm transition-colors hover:bg-surface"
          >
            + New project
          </button>
          <div className="min-h-0 flex-1 space-y-1 overflow-y-auto">
            {projects.map((p) => (
              <button
                key={p.id}
                onClick={() => setActiveId(p.id)}
                className={`w-full truncate rounded-md px-2 py-1.5 text-left text-sm transition-colors ${
                  p.id === activeId
                    ? "bg-surface text-foreground"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {p.name || "Untitled"}
              </button>
            ))}
          </div>
        </aside>

        <section className="flex min-h-0 w-full flex-col border-r border-border md:w-2/5">
          <div ref={scrollRef} className="min-h-0 flex-1 space-y-3 overflow-y-auto p-4">
            {messages.length === 0 && !busy && (
              <p className="text-sm text-muted-foreground">
                Describe the website you want — e.g. “a landing page for a specialty coffee shop”.
              </p>
            )}
            {messages.map((m) => (
              <div
                key={m.id}
                className={`max-w-[85%] rounded-xl px-3 py-2 text-sm ${
                  m.role === "user"
                    ? "ml-auto bg-gradient-brand text-primary-foreground"
                    : "border border-border bg-card"
                }`}
              >
                {m.content}
              </div>
            ))}
            {busy && (
              <div className="max-w-[85%] rounded-xl border border-border bg-card px-3 py-2 text-sm text-muted-foreground">
                Forging your site…
              </div>
            )}
            {error && <p className="text-sm text-destructive">{error}</p>}
          </div>
          <form onSubmit={send} className="border-t border-border p-3">
            <div className="flex gap-2">
              <input
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder="Describe or refine your site…"
                className="flex-1 rounded-lg border border-input bg-background px-3 py-2.5 text-sm outline-none placeholder:text-muted-foreground focus:border-ring"
              />
              <button
                type="submit"
                disabled={busy}
                className="rounded-lg bg-gradient-brand px-4 py-2.5 text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-50"
              >
                Send
              </button>
            </div>
          </form>
        </section>

        <section className="hidden min-h-0 flex-1 md:block">
          {html ? (
            <iframe
              title="Live preview"
              srcDoc={html}
              sandbox="allow-scripts"
              className="h-full w-full bg-white"
            />
          ) : (
            <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
              Your live preview will appear here.
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

function cleanHtml(raw: string) {
  return raw
    .replace(/^\s*```(?:html)?\s*/i, "")
    .replace(/```\s*$/, "")
    .trim();
}
