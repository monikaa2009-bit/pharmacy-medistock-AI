import React, { useState } from 'react';
import { signInWithPopup, signOut, type User } from 'firebase/auth';
import { ShieldCheck, ArrowRight, LogOut, PackageCheck, BellRing, Clock3 } from 'lucide-react';
import { auth, googleProvider } from '../firebase';
import { savePharmacyProfile } from '../services/pharmacyService';

interface AuthGateProps {
  user: User | null;
  needsRegistration: boolean;
  onRegistered: () => void;
}

export function AuthGate({ user, needsRegistration, onRegistered }: AuthGateProps) {
  const [authLoading, setAuthLoading] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);

  const [pharmacyName, setPharmacyName] = useState('');
  const [ownerName, setOwnerName] = useState(user?.displayName || '');
  const [licenseNumber, setLicenseNumber] = useState('');
  const [phone, setPhone] = useState('');
  const [address, setAddress] = useState('');
  const [expiryAlertDays, setExpiryAlertDays] = useState(30);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const handleGoogleSignIn = async () => {
    setAuthError(null);
    setAuthLoading(true);
    try {
      await signInWithPopup(auth, googleProvider);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unable to sign in with Google.';
      setAuthError(msg);
    } finally {
      setAuthLoading(false);
    }
  };

  const handleRegistrationSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    setFormError(null);
    setSaving(true);
    try {
      await savePharmacyProfile(
        user.uid,
        {
          pharmacyName,
          ownerName: ownerName || user.displayName || 'Pharmacy Owner',
          ownerEmail: user.email || '',
          licenseNumber,
          phone,
          address,
          expiryAlertDays,
        },
        false
      );
      onRegistered();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Could not complete registration.');
    } finally {
      setSaving(false);
    }
  };

  if (user && needsRegistration) {
    return (
      <div className="min-h-screen bg-slate-50 flex flex-col justify-center py-12 px-4 sm:px-6 lg:px-8">
        <div className="max-w-xl w-full mx-auto bg-white border border-slate-200 rounded-xl p-8">
          <div className="flex items-center justify-between gap-4 pb-6 border-b border-slate-200">
            <div>
              <p className="text-xs font-medium text-teal-700 mb-1">Owner Onboarding</p>
              <h1 className="text-2xl font-bold text-slate-900 tracking-tight">
                Register Your Pharmacy
              </h1>
              <p className="text-sm text-slate-600 mt-1">
                Signed in as <span className="font-medium text-slate-900">{user.email}</span>
              </p>
            </div>
            <button
              type="button"
              onClick={() => void signOut(auth)}
              className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-slate-600 hover:text-slate-900 border border-slate-200 rounded-lg transition-colors whitespace-nowrap shrink-0"
            >
              <LogOut className="w-3.5 h-3.5" />
              Switch Account
            </button>
          </div>

          <form onSubmit={handleRegistrationSubmit} className="mt-6 space-y-4">
            {formError && (
              <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
                {formError}
              </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                  Pharmacy Name *
                </label>
                <input
                  type="text"
                  required
                  value={pharmacyName}
                  onChange={(e) => setPharmacyName(e.target.value)}
                  placeholder="e.g. HealthFirst Apothecary"
                  className="w-full px-3 py-2.5 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-600/20 focus:border-teal-600"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                  Owner Full Name *
                </label>
                <input
                  type="text"
                  required
                  value={ownerName}
                  onChange={(e) => setOwnerName(e.target.value)}
                  placeholder="Dr. Sarah Lin"
                  className="w-full px-3 py-2.5 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-600/20 focus:border-teal-600"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                  Pharmacy License Number
                </label>
                <input
                  type="text"
                  value={licenseNumber}
                  onChange={(e) => setLicenseNumber(e.target.value)}
                  placeholder="e.g. PH-2026-88412"
                  className="w-full px-3 py-2.5 text-sm font-mono border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-600/20 focus:border-teal-600"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                  Contact Phone
                </label>
                <input
                  type="tel"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="+1 (555) 234-8910"
                  className="w-full px-3 py-2.5 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-600/20 focus:border-teal-600"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                Pharmacy Address
              </label>
              <input
                type="text"
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                placeholder="420 Medical Plaza, Suite 100"
                className="w-full px-3 py-2.5 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-600/20 focus:border-teal-600"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                Advance Expiry Warning Window (Days)
              </label>
              <input
                type="number"
                min={7}
                max={180}
                value={expiryAlertDays}
                onChange={(e) => setExpiryAlertDays(Number(e.target.value))}
                className="w-full sm:w-44 px-3 py-2.5 text-sm font-mono tabular-nums border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-600/20 focus:border-teal-600"
              />
              <p className="text-xs text-slate-500 mt-1">
                Medicines expiring within this many days trigger orange advance alerts.
              </p>
            </div>

            <div className="pt-4 border-t border-slate-200 flex items-center justify-end gap-3">
              <button
                type="submit"
                disabled={saving}
                className="inline-flex items-center gap-2 px-5 py-2.5 text-sm font-semibold text-white bg-teal-700 hover:bg-teal-800 rounded-lg transition-colors disabled:opacity-60 whitespace-nowrap shrink-0"
              >
                {saving ? 'Registering Pharmacy...' : 'Complete Registration'}
                <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">
      <header className="w-full bg-white border-b border-slate-200 px-6 py-4 flex items-center justify-between gap-8">
        <span className="text-lg font-bold tracking-tight text-slate-900 whitespace-nowrap shrink-0 font-display">
          MediStock AI
        </span>
        <div className="flex items-center gap-3 shrink-0">
          <button
            type="button"
            onClick={handleGoogleSignIn}
            disabled={authLoading}
            className="px-4 py-2 text-xs font-semibold text-white bg-teal-700 hover:bg-teal-800 rounded-lg transition-colors whitespace-nowrap shrink-0 disabled:opacity-60"
          >
            {authLoading ? 'Connecting...' : 'Owner Sign In'}
          </button>
        </div>
      </header>

      <main className="flex-1 max-w-6xl w-full mx-auto px-6 py-12 lg:py-20 grid grid-cols-1 lg:grid-cols-12 gap-12 items-center">
        <div className="lg:col-span-7 space-y-6">
          <p className="text-xs font-semibold tracking-wide text-teal-700">
            Smart Pharmacy Management System
          </p>
          <h1 className="text-3xl sm:text-4xl lg:text-5xl font-bold text-slate-900 tracking-tight leading-tight text-balance">
            Zero-waste pharmacy inventory with approval-gated reordering.
          </h1>
          <p className="text-base text-slate-600 leading-relaxed max-w-xl">
            Scan medicine barcodes into live batch inventory, block expired stock at the counter,
            monitor real-time low-stock thresholds, and review supplier purchase orders before they
            ever leave your desk.
          </p>

          <div className="pt-2 flex flex-wrap items-center gap-4">
            <button
              type="button"
              onClick={handleGoogleSignIn}
              disabled={authLoading}
              className="inline-flex items-center gap-2.5 px-6 py-3 text-sm font-semibold text-white bg-teal-700 hover:bg-teal-800 rounded-lg transition-colors disabled:opacity-60 whitespace-nowrap shrink-0"
            >
              <ShieldCheck className="w-4 h-4" />
              {authLoading ? 'Signing in...' : 'Sign In or Register with Google'}
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>

          {authError && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700 max-w-xl">
              {authError}
            </div>
          )}
        </div>

        <div className="lg:col-span-5 bg-white border border-slate-200 rounded-xl p-6 space-y-5">
          <h2 className="text-base font-semibold text-slate-900">
            Operational Safeguards Built In
          </h2>
          <div className="space-y-4 divide-y divide-slate-100">
            <div className="pt-1 flex items-start gap-3">
              <PackageCheck className="w-5 h-5 text-teal-700 shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-semibold text-slate-900">
                  Barcode Batch Intake & Duplicate Guard
                </p>
                <p className="text-xs text-slate-600 mt-0.5 leading-relaxed">
                  Scan via camera, image upload, or USB scanner. Prevents duplicate barcode and batch
                  combinations while validating dates and stock counts.
                </p>
              </div>
            </div>

            <div className="pt-4 flex items-start gap-3">
              <BellRing className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-semibold text-slate-900">
                  Owner-Approved Automated Reordering
                </p>
                <p className="text-xs text-slate-600 mt-0.5 leading-relaxed">
                  Low-stock thresholds trigger instant reorder prompts with Approve and Reject
                  controls. No supplier order is ever placed without explicit sign-off.
                </p>
              </div>
            </div>

            <div className="pt-4 flex items-start gap-3">
              <Clock3 className="w-5 h-5 text-orange-600 shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-semibold text-slate-900">
                  Expiry Quarantine & Counter Lock
                </p>
                <p className="text-xs text-slate-600 mt-0.5 leading-relaxed">
                  Advance warnings highlight batches nearing expiry, separate expired stock from
                  available inventory, and block expired medicines from being sold.
                </p>
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
