import React from 'react';
import { Command } from 'lucide-react';

interface ShortcutsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const ShortcutsModal: React.FC<ShortcutsModalProps> = ({ isOpen, onClose }) => {
  if (!isOpen) return null;

  const shortcuts = [
    { key: 'Space', desc: 'Play / Pause stream' },
    { key: 'F', desc: 'Toggle Fullscreen mode' },
    { key: 'M', desc: 'Mute / Unmute audio' },
    { key: '↑ / ↓', desc: 'Increase / Decrease volume' },
    { key: '[', desc: 'Previous channel in list' },
    { key: ']', desc: 'Next channel in list' },
    { key: 'P', desc: 'Open Playlists Manager' },
    { key: 'E', desc: 'Open TV Guide (EPG)' },
    { key: 'S', desc: 'Open Settings' },
    { key: '?', desc: 'Show this keyboard shortcuts dialog' },
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm select-none">
      <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-md overflow-hidden shadow-2xl">
        <div className="px-6 py-4 border-b border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <Command className="w-5 h-5 text-indigo-400" />
            <h3 className="text-base font-semibold text-white">Keyboard Shortcuts</h3>
          </div>
          <button onClick={onClose} className="p-1.5 text-slate-400 hover:text-white rounded-lg">
            ✕
          </button>
        </div>

        <div className="p-6 space-y-2.5">
          {shortcuts.map((sc) => (
            <div key={sc.key} className="flex items-center justify-between py-1 border-b border-slate-800/60 last:border-0">
              <span className="text-xs text-slate-300">{sc.desc}</span>
              <kbd className="px-2 py-1 rounded bg-slate-950 border border-slate-800 text-xs font-mono font-semibold text-indigo-300 shadow-sm">
                {sc.key}
              </kbd>
            </div>
          ))}
        </div>

        <div className="p-4 border-t border-slate-800 bg-slate-950/50 flex justify-end">
          <button
            onClick={onClose}
            className="px-4 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold"
          >
            Got it
          </button>
        </div>
      </div>
    </div>
  );
};
