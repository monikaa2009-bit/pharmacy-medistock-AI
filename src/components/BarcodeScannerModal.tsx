import React, { useEffect, useId, useRef, useState } from 'react';
import { Html5Qrcode } from 'html5-qrcode';
import { Camera, Upload, X, Keyboard, Check } from 'lucide-react';
import { sanitizeIdentifierInput } from '../utils/inventoryLogic';

interface BarcodeScannerModalProps {
  isOpen: boolean;
  onClose: () => void;
  onDetected: (barcode: string) => void;
  title?: string;
}

export function BarcodeScannerModal({
  isOpen,
  onClose,
  onDetected,
  title = 'Scan Medicine Barcode',
}: BarcodeScannerModalProps) {
  const scannerElementId = useId().replace(/:/g, '_');
  const scannerRef = useRef<Html5Qrcode | null>(null);
  const [mode, setMode] = useState<'camera' | 'manual'>('camera');
  const [cameraActive, setCameraActive] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [manualCode, setManualCode] = useState('');

  useEffect(() => {
    if (!isOpen || mode !== 'camera') {
      return;
    }

    let cancelled = false;
    const html5Qr = new Html5Qrcode(scannerElementId);
    scannerRef.current = html5Qr;

    const startCamera = async () => {
      setError(null);
      try {
        await html5Qr.start(
          { facingMode: 'environment' },
          { fps: 10, qrbox: { width: 260, height: 140 } },
          (decodedText) => {
            if (cancelled) return;
            const cleaned = sanitizeIdentifierInput(decodedText);
            if (cleaned.length >= 3) {
              void stopCameraSafely(html5Qr).then(() => {
                onDetected(cleaned);
                onClose();
              });
            }
          },
          () => {
            // ignore frame read misses
          }
        );
        if (!cancelled) {
          setCameraActive(true);
        }
      } catch (err) {
        if (!cancelled) {
          setCameraActive(false);
          setError(
            err instanceof Error
              ? 'Camera unavailable or permission denied. You can upload a barcode image or enter/scan with a USB barcode reader below.'
              : 'Unable to start camera.'
          );
        }
      }
    };

    void startCamera();

    return () => {
      cancelled = true;
      setCameraActive(false);
      void stopCameraSafely(html5Qr);
    };
  }, [isOpen, mode, scannerElementId, onDetected, onClose]);

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setError(null);
    const readerScanner = new Html5Qrcode(`${scannerElementId}_file`);
    try {
      const decodedText = await readerScanner.scanFile(file, false);
      const cleaned = sanitizeIdentifierInput(decodedText);
      if (cleaned.length >= 3) {
        onDetected(cleaned);
        onClose();
      } else {
        setError('Scanned code was too short. Please verify the barcode image.');
      }
    } catch {
      setError('Could not decode a barcode from this image. Try a clearer photo or enter manually.');
    } finally {
      try {
        readerScanner.clear();
      } catch {
        // ignore clear failure
      }
    }
  };

  const handleManualSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const cleaned = sanitizeIdentifierInput(manualCode);
    if (cleaned.length < 3) {
      setError('Barcode must be at least 3 valid characters (letters, numbers, hyphens).');
      return;
    }
    onDetected(cleaned);
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/50 flex items-center justify-center p-4">
      <div className="bg-white border border-slate-200 rounded-xl w-full max-w-lg overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200">
          <h3 className="text-base font-semibold text-slate-900">{title}</h3>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close barcode scanner"
            className="p-1.5 text-slate-500 hover:text-slate-900 rounded-lg hover:bg-slate-100 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-5 space-y-4">
          <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-lg">
            <button
              type="button"
              onClick={() => setMode('camera')}
              className={`flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-medium rounded-md transition-colors whitespace-nowrap ${
                mode === 'camera'
                  ? 'bg-white text-slate-900 shadow-sm'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Camera className="w-3.5 h-3.5" />
              Camera & Image
            </button>
            <button
              type="button"
              onClick={() => setMode('manual')}
              className={`flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-medium rounded-md transition-colors whitespace-nowrap ${
                mode === 'manual'
                  ? 'bg-white text-slate-900 shadow-sm'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Keyboard className="w-3.5 h-3.5" />
              USB Scanner / Manual
            </button>
          </div>

          {error && (
            <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg text-xs text-amber-800">
              {error}
            </div>
          )}

          {mode === 'camera' ? (
            <div className="space-y-3">
              <div className="bg-slate-950 rounded-lg overflow-hidden min-h-[220px] flex items-center justify-center relative">
                <div id={scannerElementId} className="w-full" />
                {!cameraActive && !error && (
                  <p className="text-xs text-slate-300 absolute">Initializing camera stream...</p>
                )}
              </div>
              <div id={`${scannerElementId}_file`} className="hidden" />

              <div className="flex items-center justify-between gap-3 pt-1">
                <label className="inline-flex items-center gap-2 px-3.5 py-2 text-xs font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg cursor-pointer transition-colors whitespace-nowrap">
                  <Upload className="w-3.5 h-3.5" />
                  Scan from Image File
                  <input
                    type="file"
                    accept="image/*"
                    onChange={handleFileUpload}
                    className="sr-only"
                  />
                </label>
                <span className="text-xs text-slate-500">
                  Supports EAN-13, UPC-A, Code-128 & QR
                </span>
              </div>
            </div>
          ) : (
            <form onSubmit={handleManualSubmit} className="space-y-3">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                  Scan with USB Reader or Enter Barcode Number
                </label>
                <input
                  type="text"
                  autoFocus
                  value={manualCode}
                  onChange={(e) => setManualCode(e.target.value)}
                  placeholder="e.g. 8901234567890"
                  className="w-full px-3 py-2.5 text-sm font-mono border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-600/20 focus:border-teal-600"
                />
              </div>
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={onClose}
                  className="px-4 py-2 text-xs font-medium text-slate-700 border border-slate-200 rounded-lg hover:bg-slate-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-teal-700 hover:bg-teal-800 rounded-lg"
                >
                  <Check className="w-3.5 h-3.5" />
                  Use Barcode
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}

async function stopCameraSafely(scanner: Html5Qrcode) {
  try {
    if (scanner.isScanning) {
      await scanner.stop();
    }
    scanner.clear();
  } catch {
    // ignore cleanup error if camera never opened
  }
}
