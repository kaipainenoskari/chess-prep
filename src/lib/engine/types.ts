export interface EngineBestMove {
  move: string;
  eval: number;
  pv: string[];
}

export interface EngineAnalysisResult {
  bestMoves: EngineBestMove[];
}
