import { Suspense } from "react";
import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth";
import { LoginForm } from "@/components/LoginForm";

export default async function LoginPage() {
  const user = await getSessionUser().catch(() => null);
  if (user) redirect("/home");

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden px-4">
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "radial-gradient(ellipse 80% 60% at 20% 20%, #d9eee6 0%, transparent 55%), radial-gradient(ellipse 70% 50% at 90% 10%, #f0e2c8 0%, transparent 50%), linear-gradient(165deg, #f7f4ef 0%, #ebe4d6 45%, #dfece6 100%)",
        }}
      />
      <div
        className="pointer-events-none absolute inset-0 opacity-[0.35]"
        style={{
          backgroundImage:
            "url(\"data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='none' fill-rule='evenodd'%3E%3Cg fill='%230f766e' fill-opacity='0.06'%3E%3Cpath d='M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E\")",
        }}
      />

      <div className="relative z-10 w-full max-w-md animate-[fadeIn_0.6s_ease-out]">
        <div className="mb-8 text-center">
          <p className="font-serif text-5xl font-semibold tracking-tight text-teal-950 md:text-6xl">
            Workgether
          </p>
          <p className="mt-3 text-base text-stone-600">
            Lightweight collaborative documents — write together in real time.
          </p>
        </div>
        <div className="rounded-2xl border border-stone-200/80 bg-white/90 p-6 shadow-[0_20px_50px_-24px_rgba(15,60,50,0.35)] backdrop-blur">
          <Suspense fallback={<p className="text-sm text-stone-500">Loading…</p>}>
            <LoginForm />
          </Suspense>
        </div>
      </div>
    </div>
  );
}
