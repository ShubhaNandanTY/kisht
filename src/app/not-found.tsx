import Link from "next/link";

export default function NotFound() {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center px-6 text-center">
      <img src="/icon.svg" alt="" className="size-10" />
      <h1 className="mt-6 text-xl font-semibold">Page not found</h1>
      <p className="mt-1 max-w-xs text-sm text-muted">The page you opened does not exist, or you do not have access to it.</p>
      <Link href="/" className="mt-6 inline-flex h-11 items-center rounded-xl bg-accent px-5 text-[15px] font-medium text-white hover:bg-accent-strong">
        Go to my home page
      </Link>
    </main>
  );
}
