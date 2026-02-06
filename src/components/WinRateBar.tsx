"use client";

export default function WinRateBar({
  wins,
  draws,
  losses,
  showLabels = true,
  height = "h-6",
}: {
  wins: number;
  draws: number;
  losses: number;
  showLabels?: boolean;
  height?: string;
}) {
  const total = wins + draws + losses;
  if (total === 0) return <div className={`${height} bg-gray-700 rounded-full`} />;

  const winPct = (wins / total) * 100;
  const drawPct = (draws / total) * 100;
  const lossPct = (losses / total) * 100;

  return (
    <div>
      <div className={`${height} flex rounded-full overflow-hidden`}>
        {winPct > 0 && (
          <div
            className="bg-green-500 flex items-center justify-center text-xs font-bold text-white"
            style={{ width: `${winPct}%` }}
          >
            {winPct >= 10 && showLabels ? `${Math.round(winPct)}%` : ""}
          </div>
        )}
        {drawPct > 0 && (
          <div
            className="bg-gray-400 flex items-center justify-center text-xs font-bold text-gray-800"
            style={{ width: `${drawPct}%` }}
          >
            {drawPct >= 10 && showLabels ? `${Math.round(drawPct)}%` : ""}
          </div>
        )}
        {lossPct > 0 && (
          <div
            className="bg-red-500 flex items-center justify-center text-xs font-bold text-white"
            style={{ width: `${lossPct}%` }}
          >
            {lossPct >= 10 && showLabels ? `${Math.round(lossPct)}%` : ""}
          </div>
        )}
      </div>
      {showLabels && (
        <div className="flex justify-between mt-1 text-xs text-gray-400">
          <span className="text-green-400">W: {wins}</span>
          <span className="text-gray-400">D: {draws}</span>
          <span className="text-red-400">L: {losses}</span>
        </div>
      )}
    </div>
  );
}
