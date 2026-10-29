import React from 'react';
import { ShieldAlert, Lock, RefreshCw } from 'lucide-react';
import { SecurityThreatIncident } from '../types';

interface SecurityLockdownModalProps {
  incident: SecurityThreatIncident | null;
  onReleaseQuarantine: () => void;
}

export const SecurityLockdownModal: React.FC<SecurityLockdownModalProps> = ({
  incident,
  onReleaseQuarantine,
}) => {
  if (!incident) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="security-lockdown-title"
    >
      <div className="max-w-lg w-full bg-[#111626] border border-red-500/40 rounded-xl p-6 text-[#F8FAFC] shadow-2xl">
        <div className="flex items-center gap-3 text-red-400 mb-4">
          <ShieldAlert className="w-7 h-7 shrink-0" />
          <div>
            <h2 id="security-lockdown-title" className="text-lg font-bold">
              Automated Intrusion Shield Quarantine
            </h2>
            <p className="text-xs text-[#94A3B8] font-mono-tabular">
              Cryptographic Incident ID: {incident.incidentId}
            </p>
          </div>
        </div>

        <p className="text-sm text-[#94A3B8] leading-relaxed mb-4">
          The Explic heuristic payload scanner intercepted a potentially
          malicious vector before execution. The active session state has been
          isolated to protect your academic ledger and cloud workspace.
        </p>

        <div className="bg-[#0B0F19] border border-white/10 rounded-lg p-3.5 mb-5 text-xs font-mono-tabular space-y-1.5">
          <div className="flex justify-between">
            <span className="text-[#94A3B8]">Vector Classification:</span>
            <span className="text-red-400 font-semibold">{incident.vectorType}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-[#94A3B8]">Source Subsystem:</span>
            <span>{incident.sourceAction}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-[#94A3B8]">Forensic Log:</span>
            <span>Dispatched to /api/security/threat-log</span>
          </div>
          <div className="pt-1 border-t border-white/10 text-[#94A3B8] break-all">
            Intercepted Payload: {incident.payloadSnippet}
          </div>
        </div>

        <div className="flex items-center justify-end gap-3">
          <button
            type="button"
            onClick={onReleaseQuarantine}
            className="flex items-center gap-2 px-4 py-2 text-xs font-semibold bg-red-600 hover:bg-red-500 text-white rounded-lg transition-colors whitespace-nowrap"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            Purge Payload &amp; Restore Session
          </button>
        </div>
      </div>
    </div>
  );
};
