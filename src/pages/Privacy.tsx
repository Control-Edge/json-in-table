const Privacy = () => {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="mx-auto max-w-2xl px-4 py-12">
        <a href="#/" className="text-sm text-primary underline hover:text-primary/90">
          ← Back to JSON as Table
        </a>

        <h1 className="mt-6 mb-2 text-2xl font-heading font-bold">Privacy &amp; Cookies</h1>
        <p className="mb-8 text-sm text-muted-foreground">
          JSON as Table is built and maintained by Control Edge AB.
        </p>

        <section className="mb-6">
          <h2 className="mb-2 text-lg font-semibold">Your data</h2>
          <p className="text-sm text-muted-foreground">
            JSON as Table runs entirely in your browser. Any JSON or CSV you paste, upload, or
            edit stays on your device and is never sent to our servers.
          </p>
        </section>

        <section className="mb-6">
          <h2 className="mb-2 text-lg font-semibold">Analytics</h2>
          <p className="text-sm text-muted-foreground">
            We use Umami, a self-hosted, privacy-friendly analytics tool, to see aggregate
            traffic like page views. It does not use cookies, does not track you across sites,
            and does not collect any personal or JSON data.
          </p>
        </section>

        <section className="mb-6">
          <h2 className="mb-2 text-lg font-semibold">Cookies</h2>
          <p className="text-sm text-muted-foreground">
            This site is served through Cloudflare, which may set a{" "}
            <code className="rounded bg-muted px-1 py-0.5 text-xs">__cf_bm</code> cookie for bot
            and abuse protection. This is a strictly necessary security cookie — it does not
            identify you or track your activity, and it isn't used for analytics or advertising.
            We don't set any analytics or advertising cookies of our own.
          </p>
        </section>

        <section>
          <h2 className="mb-2 text-lg font-semibold">Contact</h2>
          <p className="text-sm text-muted-foreground">
            Questions? Reach out via{" "}
            <a
              href="https://cedge.se"
              target="_blank"
              rel="noopener noreferrer"
              className="underline hover:text-foreground"
            >
              Control Edge AB
            </a>
            .
          </p>
        </section>
      </div>
    </div>
  );
};

export default Privacy;
