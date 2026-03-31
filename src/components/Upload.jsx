import { useCallback, useState } from 'react';
import { UploadCloud } from 'lucide-react';

export default function Upload({ onData }) {
  const [dragging, setDragging] = useState(false);
  const [error, setError] = useState(null);

  const handleFile = useCallback(
    (file) => {
      if (!file || !file.name.endsWith('.csv')) {
        setError('Please upload a CSV file.');
        return;
      }
      setError(null);
      const reader = new FileReader();
      reader.onload = (e) => {
        try {
          onData(e.target.result);
        } catch (err) {
          setError(`Parse error: ${err.message}`);
        }
      };
      reader.readAsText(file);
    },
    [onData]
  );

  const onDrop = useCallback(
    (e) => {
      e.preventDefault();
      setDragging(false);
      const file = e.dataTransfer.files[0];
      handleFile(file);
    },
    [handleFile]
  );

  return (
    <div className="min-h-screen bg-zinc-950 flex items-center justify-center p-6">
      <div className="w-full max-w-xl">
        <div className="mb-10 text-center">
          <div className="inline-flex items-center gap-2 mb-3 text-indigo-400 font-mono text-sm tracking-widest uppercase">
            <span className="w-8 h-px bg-indigo-400/50" />
            Trading Analyzer
            <span className="w-8 h-px bg-indigo-400/50" />
          </div>
          <h1 className="text-4xl font-bold text-zinc-100 mb-2">Paper Trading Analytics</h1>
          <p className="text-zinc-400 text-sm">
            Import your TradingView paper trading CSV export to analyze results,
            visualize performance and extract strategic insights.
          </p>
        </div>

        <label
          htmlFor="csv-input"
          onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
          onDragLeave={() => setDragging(false)}
          onDrop={onDrop}
          className={`
            flex flex-col items-center justify-center gap-4 p-12
            border-2 border-dashed rounded-2xl cursor-pointer
            transition-all duration-200
            ${dragging
              ? 'border-indigo-500 bg-indigo-500/10'
              : 'border-zinc-700 bg-zinc-900 hover:border-indigo-500/60 hover:bg-zinc-800/60'}
          `}
        >
          <UploadCloud
            className={`w-12 h-12 transition-colors ${dragging ? 'text-indigo-400' : 'text-zinc-500'}`}
          />
          <div className="text-center">
            <p className="text-zinc-200 font-medium mb-1">
              Drop your CSV file here
            </p>
            <p className="text-zinc-500 text-sm">
              or <span className="text-indigo-400 underline">click to browse</span>
            </p>
          </div>
          <p className="text-zinc-600 text-xs">
            TradingView — Historique des soldes (.csv)
          </p>
          <input
            id="csv-input"
            type="file"
            accept=".csv"
            className="hidden"
            onChange={(e) => handleFile(e.target.files[0])}
          />
        </label>

        {error && (
          <p className="mt-4 text-red-400 text-sm text-center bg-red-500/10 border border-red-500/30 rounded-lg p-3">
            {error}
          </p>
        )}

        <div className="mt-6 grid grid-cols-3 gap-3 text-center">
          {['18 trades analysed', 'P&L distribution', 'Risk metrics'].map((feat) => (
            <div key={feat} className="bg-zinc-900 border border-zinc-800 rounded-lg p-3 text-zinc-400 text-xs">
              {feat}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
