import Papa from 'papaparse';
import { getHeaderValue } from '../lib/csvHeaders.js';

/**
 * Parse CSV text from TradingView paper trading export.
 * Returns an array of structured row objects sorted ascending by time.
 */
export function parseCSV(csvText) {
  const result = Papa.parse(csvText.trim(), {
    header: true,
    skipEmptyLines: true,
    transformHeader: (h) => h.trim(),
  });

  if (result.errors.length > 0 && result.data.length === 0) {
    throw new Error(`CSV parse error: ${result.errors[0].message}`);
  }

  const rows = result.data
    .map((row) => {
      const action = (getHeaderValue(row, ['Action']) || '').trim();
      const pnl = parseFloat(getHeaderValue(row, ['Pertes et profits réalisés (valeur)', 'Realized PnL (value)']) || '0');
      const balBefore = parseFloat(getHeaderValue(row, ['Balance avant', 'Balance before']) || '0');
      const balAfter = parseFloat(getHeaderValue(row, ['Balance après', 'Balance after']) || '0');
      const timeStr = getHeaderValue(row, ['Heure', 'Time']) || '';
      const time = new Date(timeStr.replace(' ', 'T') + 'Z'); // treat as UTC if no tz

      if (isNaN(time.getTime())) return null;

      const isCommission = action.startsWith('Commission for:');
      const isEntryComm = isCommission && action.includes('Enter position');
      const isExitComm = isCommission && action.includes('Close');

      // Extract symbol — handles "FX:EURUSD", "FX:SPX500"
      const symbolMatch = action.match(/symbol\s+([\w:]+)/i);
      const symbol = symbolMatch ? symbolMatch[1].replace('FX:', '') : 'Unknown';

      // Extract direction from "Close long/short position"
      const dirMatch = action.match(/Close\s+(long|short)\s+position/i);
      const direction = dirMatch ? dirMatch[1].toLowerCase() : null;

      // Extract exit price "at price X"
      const exitPriceMatch = action.match(/at price\s+([\d.]+)/i);
      const exitPrice = exitPriceMatch ? parseFloat(exitPriceMatch[1]) : null;

      // Extract units "for X units"
      const unitsMatch = action.match(/for\s+([\d.]+)\s+units/i);
      const units = unitsMatch ? parseFloat(unitsMatch[1]) : null;

      // Extract average entry price
      const avgMatch = action.match(/AVG Price was\s+([\d.]+)/i);
      const avgEntryPrice = avgMatch ? parseFloat(avgMatch[1]) : null;

      const type = isEntryComm
        ? 'entryCommission'
        : isExitComm
          ? 'exitCommission'
          : isCommission
            ? 'commission'
            : 'trade';

      return {
        time,
        balanceBefore: balBefore,
        balanceAfter: balAfter,
        pnl,
        action,
        type,
        symbol,
        direction,
        exitPrice,
        units,
        avgEntryPrice,
      };
    })
    .filter(Boolean);

  // Sort ascending by time
  return rows.sort((a, b) => a.time - b.time);
}
