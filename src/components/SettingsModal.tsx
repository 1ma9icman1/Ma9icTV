import React, { useState } from 'react';
import {
  Settings,
  Sliders,
  Shield,
  Download,
  Upload,
  Trash2,
  Check,
  Zap,
  Globe,
  Sun,
  Moon,
  Monitor,
} from 'lucide-react';
import { AppSettings } from '../types';
import { exportAppState, importAppState } from '../utils/storage';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  settings: AppSettings;
  onUpdateSettings: (settings: AppSettings) => void;
  onResetAllData: () => void;
}

export const SettingsModal: React.FC<SettingsModalProps> = ({
  isOpen,
  onClose,
  settings,
  onUpdateSettings,
  onResetAllData,
}) => {
  const [current, setCurrent] = useState<AppSettings>(settings);
  const [savedSuccess, setSavedSuccess] = useState(false);

  if (!isOpen) return null;

  const handleSave = () => {
    onUpdateSettings(current);
    setSavedSuccess(true);
    setTimeout(() => {
      setSavedSuccess(false);
      onClose();
    }, 600);
  };

  const handleExport = () => {
    const json = exportAppState();
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `iptvnator-backup-${new Date().toISOString().split('T')[0]}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleImportFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      const text = event.target?.result as string;
      if (text && importAppState(text)) {
        alert('App backup restored successfully! Reloading...');
        window.location.reload();
      } else {
        alert('Invalid backup JSON file.');
      }
    };
    reader.readAsText(file);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm animate-fade-in select-none">
      <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-xl overflow-hidden shadow-2xl flex flex-col max-h-[85vh]">
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-indigo-600/20 border border-indigo-500/30 flex items-center justify-center text-indigo-400">
              <Settings className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-semibold text-white">Application Settings</h3>
              <p className="text-xs text-slate-400">Configure playback engine, proxy rules, and appearance</p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition-colors">
            ✕
          </button>
        </div>

        {/* Settings Body */}
        <div className="p-6 overflow-y-auto space-y-6 flex-1">
          {/* Section: Appearance */}
          <div>
            <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3 flex items-center gap-2">
              <Monitor className="w-3.5 h-3.5 text-indigo-400" />
              <span>Appearance & Theme</span>
            </h4>
            <div className="grid grid-cols-3 gap-3">
              <button
                onClick={() => setCurrent({ ...current, theme: 'dark' })}
                className={`p-3 rounded-xl border text-left flex flex-col justify-between h-20 transition-all ${
                  current.theme === 'dark'
                    ? 'bg-indigo-950/40 border-indigo-500 ring-1 ring-indigo-500/50'
                    : 'bg-slate-950/40 border-slate-800 hover:bg-slate-800/60'
                }`}
              >
                <Moon className="w-4 h-4 text-indigo-400" />
                <div>
                  <div className="text-xs font-semibold text-white">Dark Slate</div>
                  <div className="text-[10px] text-slate-400">IPTVnator Default</div>
                </div>
              </button>

              <button
                onClick={() => setCurrent({ ...current, theme: 'oled' })}
                className={`p-3 rounded-xl border text-left flex flex-col justify-between h-20 transition-all ${
                  current.theme === 'oled'
                    ? 'bg-indigo-950/40 border-indigo-500 ring-1 ring-indigo-500/50'
                    : 'bg-slate-950/40 border-slate-800 hover:bg-slate-800/60'
                }`}
              >
                <div className="w-4 h-4 rounded-full bg-black border border-slate-600"></div>
                <div>
                  <div className="text-xs font-semibold text-white">Pure OLED</div>
                  <div className="text-[10px] text-slate-400">True Deep Black</div>
                </div>
              </button>

              <button
                onClick={() => setCurrent({ ...current, theme: 'light' })}
                className={`p-3 rounded-xl border text-left flex flex-col justify-between h-20 transition-all ${
                  current.theme === 'light'
                    ? 'bg-indigo-950/40 border-indigo-500 ring-1 ring-indigo-500/50'
                    : 'bg-slate-950/40 border-slate-800 hover:bg-slate-800/60'
                }`}
              >
                <Sun className="w-4 h-4 text-amber-400" />
                <div>
                  <div className="text-xs font-semibold text-white">Light</div>
                  <div className="text-[10px] text-slate-400">Daytime Mode</div>
                </div>
              </button>
            </div>
          </div>

          {/* Section: Streaming & Anti-CORS Proxy */}
          <div>
            <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3 flex items-center gap-2">
              <Zap className="w-3.5 h-3.5 text-indigo-400" />
              <span>Anti-CORS Stream Proxy</span>
            </h4>
            <div className="space-y-2">
              <label className="text-xs text-slate-300 block mb-1">CORS Bypassing Behavior</label>
              <div className="grid grid-cols-3 gap-2">
                {[
                  { id: 'auto', label: 'Auto Failover', desc: 'Direct first, proxy on error' },
                  { id: 'always', label: 'Always Proxy', desc: 'All streams through proxy' },
                  { id: 'direct', label: 'Direct Only', desc: 'No proxy bypass' },
                ].map((mode) => (
                  <button
                    key={mode.id}
                    onClick={() => setCurrent({ ...current, proxyMode: mode.id as any })}
                    className={`p-2.5 rounded-xl border text-left transition-all ${
                      current.proxyMode === mode.id
                        ? 'bg-indigo-950/40 border-indigo-500 ring-1 ring-indigo-500/40'
                        : 'bg-slate-950/40 border-slate-800 hover:bg-slate-800/60'
                    }`}
                  >
                    <div className="text-xs font-semibold text-white">{mode.label}</div>
                    <div className="text-[10px] text-slate-400 mt-0.5">{mode.desc}</div>
                  </button>
                ))}
              </div>
            </div>

            <div className="mt-4">
              <label className="text-xs text-slate-300 block mb-1.5 flex items-center gap-1.5">
                <Globe className="w-3.5 h-3.5 text-slate-400" />
                <span>Custom User-Agent Header</span>
              </label>
              <input
                type="text"
                value={current.customUserAgent}
                onChange={(e) => setCurrent({ ...current, customUserAgent: e.target.value })}
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2 text-xs font-mono text-slate-200 focus:outline-none focus:border-indigo-500"
              />
              <p className="text-[11px] text-slate-500 mt-1">
                Sent to IPTV stream hosts that restrict access based on browser User-Agent.
              </p>
            </div>
          </div>

          {/* Section: Playback Buffer */}
          <div>
            <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3 flex items-center gap-2">
              <Sliders className="w-3.5 h-3.5 text-indigo-400" />
              <span>HLS Buffer Target</span>
            </h4>
            <div className="flex items-center gap-3">
              {[15, 30, 60].map((sec) => (
                <button
                  key={sec}
                  onClick={() => setCurrent({ ...current, bufferLengthSeconds: sec })}
                  className={`px-4 py-2 rounded-xl border text-xs font-semibold transition-all ${
                    current.bufferLengthSeconds === sec
                      ? 'bg-indigo-600 border-indigo-500 text-white'
                      : 'bg-slate-950 border-slate-800 text-slate-300 hover:bg-slate-800'
                  }`}
                >
                  {sec} seconds {sec === 15 ? '(Low Latency)' : sec === 60 ? '(High Buffer)' : '(Balanced)'}
                </button>
              ))}
            </div>
          </div>

          {/* Section: Backup and Reset */}
          <div>
            <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3 flex items-center gap-2">
              <Shield className="w-3.5 h-3.5 text-indigo-400" />
              <span>Data & Backup</span>
            </h4>
            <div className="flex flex-wrap items-center gap-3">
              <button
                onClick={handleExport}
                className="px-3.5 py-2 rounded-xl bg-slate-950 border border-slate-800 hover:bg-slate-800 text-slate-200 text-xs font-semibold flex items-center gap-2 transition-colors"
              >
                <Download className="w-3.5 h-3.5 text-indigo-400" />
                <span>Export Backup (JSON)</span>
              </button>

              <label className="px-3.5 py-2 rounded-xl bg-slate-950 border border-slate-800 hover:bg-slate-800 text-slate-200 text-xs font-semibold flex items-center gap-2 transition-colors cursor-pointer">
                <Upload className="w-3.5 h-3.5 text-emerald-400" />
                <span>Restore Backup</span>
                <input type="file" accept=".json" onChange={handleImportFile} className="hidden" />
              </label>

              <button
                onClick={() => {
                  if (confirm('Are you sure you want to reset all playlists, favorites, and settings?')) {
                    onResetAllData();
                    onClose();
                  }
                }}
                className="px-3.5 py-2 rounded-xl bg-rose-500/10 border border-rose-500/20 hover:bg-rose-500/20 text-rose-400 text-xs font-semibold flex items-center gap-2 transition-colors ml-auto"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>Reset All Data</span>
              </button>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-slate-800 bg-slate-950/50 flex items-center justify-between">
          <span className="text-xs text-slate-500 font-mono">IPTVnator Web v0.25.0</span>
          <div className="flex items-center gap-3">
            <button
              onClick={onClose}
              className="px-4 py-2 rounded-xl text-slate-400 hover:text-white text-xs font-semibold transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              className="px-5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold flex items-center gap-2 transition-all shadow-md active:scale-95"
            >
              {savedSuccess ? <Check className="w-4 h-4" /> : null}
              <span>{savedSuccess ? 'Saved!' : 'Save Changes'}</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
