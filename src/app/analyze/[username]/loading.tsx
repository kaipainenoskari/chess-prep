export default function Loading() {
  return (
    <div className="max-w-5xl mx-auto px-4 py-8 animate-pulse">
      <div className="flex items-center justify-between mb-6">
        <div className="h-8 w-64 bg-chess-card rounded" />
        <div className="h-10 w-60 bg-chess-card rounded-lg" />
      </div>
      <div className="h-72 bg-chess-card rounded-xl mb-6" />
      <div className="h-96 bg-chess-card rounded-xl mb-6" />
      <div className="h-72 bg-chess-card rounded-xl mb-6" />
      <div className="h-48 bg-chess-card rounded-xl" />
    </div>
  );
}
