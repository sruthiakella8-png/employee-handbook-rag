import type { ReactNode } from "react";
import { LogoMark } from "@/components/Logo";
import AuthBackdrop from "@/components/AuthBackdrop";

/** A tiny, true-to-the-product sample exchange. It is decorative, so assistive tech skips it. */
function HeroSample() {
  return (
    <div className="max-w-md space-y-3" aria-hidden="true">
      <div
        className="ml-auto w-fit max-w-[85%] animate-rise rounded-2xl rounded-br-md bg-white/15 px-4 py-2.5 text-sm text-white ring-1 ring-white/20 backdrop-blur"
        style={{ animationDelay: "500ms" }}
      >
        How many sick leave days do I get?
      </div>
      <div
        className="animate-rise rounded-2xl rounded-tl-md bg-white p-4 text-sm leading-relaxed text-foreground shadow-2xl shadow-black/30"
        style={{ animationDelay: "1200ms" }}
      >
        <p>
          You get <strong>12 days</strong> of paid sick leave per year. A medical certificate is needed
          once you are out for more than 2 consecutive days.
        </p>
        <div className="mt-3 border-t pt-3">
          <span
            className="inline-flex animate-rise items-center gap-1.5 rounded-md border border-accent-foreground/15 bg-accent px-2 py-1 text-xs text-accent-foreground"
            style={{ animationDelay: "2000ms" }}
          >
            <span className="font-semibold tabular-nums">§1.2</span>
            <span>Sick Leave</span>
          </span>
        </div>
      </div>
    </div>
  );
}

export default function AuthShell({
  icon,
  title,
  subtitle,
  children,
}: {
  /** Shown in the round badge on the card's top edge; changes with the screen's state. */
  icon: ReactNode;
  title: string;
  subtitle?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="auth-bg relative min-h-dvh overflow-hidden">
      <AuthBackdrop />
      <div
        aria-hidden="true"
        className="auth-blob animate-blob -left-24 -top-24 size-[26rem]"
        style={{ background: "oklch(0.62 0.22 290 / 0.45)" }}
      />
      <div
        aria-hidden="true"
        className="auth-blob animate-blob -bottom-32 -right-24 size-[30rem]"
        style={{ background: "oklch(0.6 0.25 315 / 0.4)", animationDirection: "alternate-reverse" }}
      />

      {/* One column on phones (intro, form, sample answer); two columns from lg up. */}
      <div className="relative mx-auto grid min-h-dvh max-w-6xl content-center items-center gap-8 px-6 py-10 lg:grid-cols-[1.1fr_0.9fr] lg:gap-16">
        <section className="mx-auto w-full max-w-sm text-white lg:mx-0 lg:max-w-none">
          <div className="flex items-center gap-3">
            <LogoMark size={36} />
            <span className="font-display text-lg font-semibold tracking-tight">Nimbus HR Assistant</span>
          </div>
          <h2 className="mt-6 max-w-md font-display text-4xl leading-[1.05] font-semibold tracking-tight lg:mt-12 lg:text-6xl lg:leading-[1.02]">
            Ask the handbook.
          </h2>
          <p className="mt-3 max-w-md text-base leading-relaxed text-white/80 lg:mt-5 lg:text-lg">
            Plain-language answers from your company's own policies, with the section they came from.
            <span className="hidden lg:inline"> When the handbook doesn't say, the assistant says so.</span>
          </p>
          <div className="mt-10 hidden lg:block">
            <HeroSample />
          </div>
        </section>

        <div className="mx-auto w-full max-w-sm animate-rise pt-7" style={{ animationDelay: "80ms" }}>
          {/* Frosted glass: mostly opaque so text stays easy to read, with the backdrop faintly visible. */}
          <div className="relative rounded-2xl bg-background/90 px-8 pb-8 pt-12 shadow-2xl shadow-black/30 ring-1 ring-white/30 backdrop-blur-xl">
            <div className="absolute left-1/2 top-0 flex size-14 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-brand text-white shadow-lg shadow-black/30 ring-4 ring-background/80">
              <span key={title} className="animate-pop">
                {icon}
              </span>
            </div>
            <div className="flex flex-col items-center gap-1.5 text-center">
              <h1 className="font-display text-2xl font-semibold tracking-tight">{title}</h1>
              {subtitle && <p className="text-sm text-muted-foreground">{subtitle}</p>}
            </div>
            <div className="mt-6 flex flex-col gap-6">{children}</div>
          </div>
        </div>

        <div className="mx-auto w-full max-w-sm lg:hidden">
          <HeroSample />
        </div>
      </div>
    </div>
  );
}
