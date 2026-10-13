import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "PromptForge — Build static sites by chatting" },
      {
        name: "description",
        content:
          "Describe a website, watch it appear. PromptForge generates self-contained HTML pages you can refine by chat and download instantly.",
      },
      { property: "og:title", content: "PromptForge — Build static sites by chatting" },
      {
        property: "og:description",
        content:
          "Describe a website, watch it appear. PromptForge generates self-contained HTML pages you can refine by chat and download instantly.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Landing,
});

function Landing() {
  const navigate = useNavigate();

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) navigate({ to: "/app" });
    });
  }, [navigate]);

  return (
    <main className="relative flex min-h-screen flex-col items-center justify-center overflow-hidden px-6 text-center">
      <div className="pointer-events-none absolute inset-0 panel-glow" />
      <div className="relative">
        <span className="inline-flex items-center rounded-full border border-border bg-surface px-3 py-1 text-xs text-muted-foreground">
          Single-file websites, generated live
        </span>
        <h1 className="mt-6 font-display text-5xl font-bold sm:text-6xl">
          Prompt<span className="text-gradient">Forge</span>
        </h1>
        <p className="mx-auto mt-4 max-w-xl text-balance text-muted-foreground">
          Describe the site you want. Watch it build in a live preview, refine it by chat, and
          download a standalone HTML file when you like it.
        </p>
        <div className="mt-8 flex justify-center gap-3">
          <Link
            to="/auth"
            className="rounded-lg bg-gradient-brand px-5 py-2.5 text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90"
          >
            Start building
          </Link>
        </div>
      </div>
    </main>
  );
}
