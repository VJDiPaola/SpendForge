"use client";

export default function ErrorPage({ reset }: { reset: () => void }) {
  return (
    <main className="centered-message">
      <p className="eyebrow">SpendForge</p>
      <h1>The mission view could not be loaded.</h1>
      <p>No provider action was retried automatically.</p>
      <button className="button primary" onClick={() => reset()} type="button">
        Retry this view
      </button>
    </main>
  );
}
