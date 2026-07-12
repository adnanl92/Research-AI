"use client";

/**
 * Global error boundary — catches errors thrown in the root layout itself.
 * Must render its own <html>/<body> because the root layout failed.
 */
export default function GlobalError({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="en">
      <body
        style={{
          fontFamily: "system-ui, sans-serif",
          display: "flex",
          minHeight: "100vh",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <div style={{ textAlign: "center", maxWidth: 400, padding: 24 }}>
          <h2 style={{ fontSize: 18, fontWeight: 600 }}>
            Something went wrong
          </h2>
          <p style={{ fontSize: 14, color: "#666", margin: "8px 0 16px" }}>
            The application hit an unexpected error. Reload to continue.
          </p>
          <button
            onClick={reset}
            style={{
              padding: "8px 16px",
              borderRadius: 8,
              border: "1px solid #ccc",
              background: "#111",
              color: "#fff",
              cursor: "pointer",
            }}
          >
            Try again
          </button>
        </div>
      </body>
    </html>
  );
}
