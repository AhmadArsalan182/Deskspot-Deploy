export default function LoadingScreen() {
  return (
    <div className="loading-screen" role="status" aria-live="polite">
      <div className="spinner" />
      <span className="sr-only">Loading</span>
    </div>
  );
}
