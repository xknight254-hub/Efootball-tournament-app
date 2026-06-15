import React, { useState, useRef, useCallback } from 'react';
import { api } from '../../api';

interface OCRResult {
  player1Name: string | null;
  player2Name: string | null;
  player1Score: number | null;
  player2Score: number | null;
  matchTime: string | null;
  competition: string | null;
  stats: {
    possession: [number, number] | null;
    shots: [number, number] | null;
    fouls: [number, number] | null;
  };
  confidence: number;
  rawText: string;
  orientation: 'result_screen' | 'live_score' | 'unknown';
}

interface OCRUploadProps {
  onResult: (result: OCRResult) => void;
  onAutoSubmit?: (p1Score: number, p2Score: number) => void;
  compact?: boolean;
}

/**
 * OCR Screenshot Upload Component
 * 
 * Flow:
 * 1. User uploads/takes a screenshot of their eFootball match result
 * 2. Image is sent to backend for Tesseract OCR processing
 * 3. eFootball-specific parser extracts scores, player names, stats
 * 4. User confirms the extracted data
 * 5. Result is auto-filled into the match submission form
 */
export const OCRUpload: React.FC<OCRUploadProps> = ({ onResult, onAutoSubmit, compact = false }) => {
  const [preview, setPreview] = useState<string | null>(null);
  const [processing, setProcessing] = useState(false);
  const [ocrResult, setOcrResult] = useState<OCRResult | null>(null);
  const [error, setError] = useState('');
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const processFile = useCallback(async (file: File) => {
    // Validate
    if (!file.type.startsWith('image/')) {
      setError('Please upload an image file (PNG, JPG, WEBP)');
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      setError('Image too large (max 10MB)');
      return;
    }

    // Show preview
    const reader = new FileReader();
    reader.onload = (e) => setPreview(e.target?.result as string);
    reader.readAsDataURL(file);

    // Send to OCR
    setProcessing(true);
    setError('');
    setOcrResult(null);

    try {
      const response = await api.ocr.analyze(file);
      if (response.success && response.parsed) {
        setOcrResult(response.parsed);
        onResult(response.parsed);
      } else {
        setError('Could not extract match data from screenshot');
      }
    } catch (err: any) {
      setError(err.error || 'OCR processing failed. Try a clearer screenshot.');
    } finally {
      setProcessing(false);
    }
  }, [onResult]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) processFile(file);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files?.[0];
    if (file) processFile(file);
  };

  const handlePaste = useCallback((e: ClipboardEvent) => {
    const items = e.clipboardData?.items;
    if (!items) return;
    for (const item of Array.from(items)) {
      if (item.type.startsWith('image/')) {
        const file = item.getAsFile();
        if (file) processFile(file);
        break;
      }
    }
  }, [processFile]);

  // Listen for paste events (Ctrl+V screenshot)
  React.useEffect(() => {
    document.addEventListener('paste', handlePaste);
    return () => document.removeEventListener('paste', handlePaste);
  }, [handlePaste]);

  const handleAutoSubmit = () => {
    if (ocrResult?.player1Score != null && ocrResult?.player2Score != null && onAutoSubmit) {
      onAutoSubmit(ocrResult.player1Score, ocrResult.player2Score);
    }
  };

  const confidenceColor = (conf: number) => {
    if (conf >= 70) return '#22c55e';
    if (conf >= 40) return '#f59e0b';
    return '#ef4444';
  };

  if (compact) {
    // Compact mode: just a small upload button
    return (
      <div>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          capture="environment"
          className="hidden"
          onChange={handleFileChange}
          aria-label="Upload match screenshot"
        />
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          className="flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-medium transition-all"
          style={{
            background: 'rgba(249,115,22,0.1)',
            border: '1px solid rgba(249,115,22,0.25)',
            color: '#fb923c',
          }}
          disabled={processing}
        >
          {processing ? (
            <>
              <span className="animate-spin">Processing...</span>
            </>
          ) : (
            <span>Upload Screenshot</span>
          )}
        </button>
        {error && <p className="text-xs mt-1" style={{ color: '#f87171' }}>{error}</p>}
        {ocrResult && ocrResult.player1Score != null && (
          <div className="mt-2 p-2 rounded-lg text-xs" style={{ background: 'rgba(34,197,94,0.1)', color: '#4ade80' }}>
            Detected: {ocrResult.player1Score} - {ocrResult.player2Score}
            {ocrResult.player1Name && ` (${ocrResult.player1Name} vs ${ocrResult.player2Name})`}
          </div>
        )}
      </div>
    );
  }

  // Full mode: drag-and-drop zone with preview
  return (
    <div className="space-y-3">
      {/* Upload Zone */}
      <div
        onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={handleDrop}
        onClick={() => fileInputRef.current?.click()}
        className="relative rounded-xl border-2 border-dashed p-6 text-center cursor-pointer transition-all"
        style={{
          borderColor: dragOver ? '#F97316' : 'var(--color-border)',
          background: dragOver ? 'rgba(249,115,22,0.05)' : 'var(--color-bg-surface)',
        }}
        role="button"
        aria-label="Upload eFootball screenshot. Drag and drop, click, or paste (Ctrl+V)"
        tabIndex={0}
      >
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={handleFileChange}
        />

        {preview ? (
          <div className="space-y-3">
            <img
              src={preview}
              alt="Screenshot preview"
              className="max-h-48 mx-auto rounded-lg"
            />
            {processing && (
              <div className="flex items-center justify-center gap-2 text-sm" style={{ color: '#fb923c' }}>
                <span className="animate-spin">Analyzing...</span>
              </div>
            )}
          </div>
        ) : (
          <>
            <div className="w-10 h-10 rounded-xl mx-auto mb-2 flex items-center justify-center" style={{ background: "rgba(249,115,22,0.1)", border: "1px solid rgba(249,115,22,0.25)" }}><span className="text-sm font-bold text-[#F97316]">OCR</span></div>
            <p className="text-sm text-[var(--color-text-secondary)] font-medium">
              Drop screenshot here or click to upload
            </p>
            <p className="text-xs text-[var(--color-text-dim)] mt-1">
              Supports PNG, JPG, WEBP • Max 10MB • Ctrl+V to paste
            </p>
          </>
        )}
      </div>

      {/* Error */}
      {error && (
        <div
          className="p-3 rounded-lg text-xs"
          style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.25)', color: '#f87171' }}
        >
          {error}
        </div>
      )}

      {/* OCR Result */}
      {ocrResult && (
        <div
          className="rounded-xl p-4 space-y-3"
          style={{ background: 'var(--color-bg-surface)', border: '1px solid var(--color-border)' }}
        >
          <div className="flex items-center justify-between">
            <h4 className="text-sm font-semibold text-white">OCR Result</h4>
            <span
              className="text-xs font-medium px-2 py-0.5 rounded-full"
              style={{ background: `${confidenceColor(ocrResult.confidence)}20`, color: confidenceColor(ocrResult.confidence) }}
            >
              {ocrResult.confidence}% confidence
            </span>
          </div>

          {/* Score */}
          {ocrResult.player1Score != null && ocrResult.player2Score != null && (
            <div className="flex items-center justify-center gap-4 py-2">
              <div className="text-center">
                <p className="text-xs text-[var(--color-text-muted)]">{ocrResult.player1Name || 'Player 1'}</p>
                <p className="text-2xl font-bold text-white font-mono">{ocrResult.player1Score}</p>
              </div>
              <span className="text-lg text-[var(--color-text-dim)]">-</span>
              <div className="text-center">
                <p className="text-xs text-[var(--color-text-muted)]">{ocrResult.player2Name || 'Player 2'}</p>
                <p className="text-2xl font-bold text-white font-mono">{ocrResult.player2Score}</p>
              </div>
            </div>
          )}

          {/* Extra info */}
          <div className="grid grid-cols-2 gap-2 text-xs">
            {ocrResult.competition && (
              <div>
                <span className="text-[var(--color-text-dim)]">Competition: </span>
                <span className="text-[var(--color-text-secondary)]">{ocrResult.competition}</span>
              </div>
            )}
            {ocrResult.matchTime && (
              <div>
                <span className="text-[var(--color-text-dim)]">Time: </span>
                <span className="text-[var(--color-text-secondary)]">{ocrResult.matchTime}</span>
              </div>
            )}
            {ocrResult.stats.possession && (
              <div>
                <span className="text-[var(--color-text-dim)]">Possession: </span>
                <span className="text-[var(--color-text-secondary)]">{ocrResult.stats.possession[0]}% - {ocrResult.stats.possession[1]}%</span>
              </div>
            )}
            {ocrResult.stats.shots && (
              <div>
                <span className="text-[var(--color-text-dim)]">Shots: </span>
                <span className="text-[var(--color-text-secondary)]">{ocrResult.stats.shots[0]} - {ocrResult.stats.shots[1]}</span>
              </div>
            )}
          </div>

          {/* Actions */}
          <div className="flex gap-2 pt-1">
            {onAutoSubmit && ocrResult.player1Score != null && ocrResult.player2Score != null && (
              <button
                onClick={handleAutoSubmit}
                className="flex-1 py-2 rounded-lg text-xs font-semibold"
                style={{ background: 'linear-gradient(135deg, #22c55e, #06b6d4)', color: '#09090b' }}
              >
                Use These Scores
              </button>
            )}
            <button
              onClick={() => { setOcrResult(null); setPreview(null); setError(''); }}
              className="flex-1 py-2 rounded-lg text-xs font-medium"
              style={{ background: 'var(--color-bg-elevated)', color: 'var(--color-text-secondary)' }}
            >
              Retake
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
