import React, { useCallback, useEffect, useState } from "react";
import { useMatrix } from "~/lib/matrix-context";
import {
  addEmail,
  addPhone,
  getThreePids,
  removeThreePid,
  submitEmailToken,
  type ThreePid,
} from "~/lib/threepid";

type AddMode = "idle" | "add-email" | "add-phone" | "verify-email" | "verify-phone";

/**
 * 3PID settings section: list, add, verify, and remove email/phone identifiers.
 */
export function ThreePidSettings(): React.ReactElement {
  const { client } = useMatrix();
  const [threepids, setThreepids] = useState<ThreePid[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [addMode, setAddMode] = useState<AddMode>("idle");

  // Add email state
  const [newEmail, setNewEmail] = useState("");
  const [emailSid, setEmailSid] = useState("");
  const [emailClientSecret, setEmailClientSecret] = useState("");

  // Add phone state
  const [newPhone, setNewPhone] = useState("");
  const [phoneCountry, setPhoneCountry] = useState("US");
  const [phoneSid, setPhoneSid] = useState("");
  const [phoneClientSecret, setPhoneClientSecret] = useState("");

  const [submitting, setSubmitting] = useState(false);
  const [removingAddress, setRemovingAddress] = useState<string | null>(null);
  const [confirmRemove, setConfirmRemove] = useState<string | null>(null);

  const loadThreePids = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const pids = await getThreePids(client);
      setThreepids(pids);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load identifiers");
    } finally {
      setLoading(false);
    }
  }, [client]);

  useEffect(() => {
    loadThreePids();
  }, [loadThreePids]);

  const handleAddEmail = async (): Promise<void> => {
    if (!newEmail.trim()) return;
    setSubmitting(true);
    setError("");
    try {
      const { sid, clientSecret } = await addEmail(client, newEmail.trim());
      setEmailSid(sid);
      setEmailClientSecret(clientSecret);
      setAddMode("verify-email");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to send verification email");
    } finally {
      setSubmitting(false);
    }
  };

  const handleVerifyEmail = async (): Promise<void> => {
    setSubmitting(true);
    setError("");
    try {
      await submitEmailToken(client, emailSid, emailClientSecret);
      setAddMode("idle");
      setNewEmail("");
      setEmailSid("");
      setEmailClientSecret("");
      await loadThreePids();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to verify email");
    } finally {
      setSubmitting(false);
    }
  };

  const handleAddPhone = async (): Promise<void> => {
    if (!newPhone.trim()) return;
    setSubmitting(true);
    setError("");
    try {
      const { sid, clientSecret } = await addPhone(client, newPhone.trim(), phoneCountry);
      setPhoneSid(sid);
      setPhoneClientSecret(clientSecret);
      setAddMode("verify-phone");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to send verification code");
    } finally {
      setSubmitting(false);
    }
  };

  const handleVerifyPhone = async (): Promise<void> => {
    setSubmitting(true);
    setError("");
    try {
      await submitEmailToken(client, phoneSid, phoneClientSecret);
      setAddMode("idle");
      setNewPhone("");
      setPhoneSid("");
      setPhoneClientSecret("");
      await loadThreePids();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to verify phone");
    } finally {
      setSubmitting(false);
    }
  };

  const handleRemove = async (medium: string, address: string): Promise<void> => {
    setRemovingAddress(address);
    setError("");
    try {
      await removeThreePid(client, medium, address);
      setThreepids((prev) => prev.filter((p) => !(p.medium === medium && p.address === address)));
      setConfirmRemove(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to remove identifier");
    } finally {
      setRemovingAddress(null);
    }
  };

  const cancelAdd = (): void => {
    setAddMode("idle");
    setNewEmail("");
    setNewPhone("");
    setError("");
  };

  const emails = threepids.filter((p) => p.medium === "email");
  const phones = threepids.filter((p) => p.medium === "msisdn");

  return (
    <div>
      <h4 className="text-sm font-bold text-primary mb-3">Email Addresses & Phone Numbers</h4>

      {loading && (
        <div className="flex items-center gap-2 text-sm text-muted py-2">
          <div className="w-4 h-4 border-2 border-accent border-t-transparent rounded-full animate-spin" />
          Loading...
        </div>
      )}

      {!loading && (
        <>
          {/* Email list */}
          {emails.length > 0 && (
            <div className="mb-4">
              <p className="text-xs font-medium text-muted mb-2">Email addresses</p>
              <div className="space-y-1">
                {emails.map((pid) => (
                  <div
                    key={pid.address}
                    className="flex items-center justify-between p-2 bg-surface-2 rounded-lg"
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <svg
                        className="w-4 h-4 text-muted flex-shrink-0"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                        strokeWidth={2}
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"
                        />
                      </svg>
                      <span className="text-sm text-primary truncate">{pid.address}</span>
                    </div>
                    {confirmRemove === pid.address ? (
                      <div className="flex items-center gap-1 flex-shrink-0">
                        <button
                          onClick={() => handleRemove(pid.medium, pid.address)}
                          disabled={removingAddress === pid.address}
                          className="px-2 py-0.5 text-[10px] font-medium text-primary bg-status-error rounded transition-colors disabled:opacity-50"
                        >
                          {removingAddress === pid.address ? "..." : "Confirm"}
                        </button>
                        <button
                          onClick={() => setConfirmRemove(null)}
                          className="px-2 py-0.5 text-[10px] text-secondary hover:text-primary transition-colors"
                        >
                          Cancel
                        </button>
                      </div>
                    ) : (
                      <button
                        onClick={() => setConfirmRemove(pid.address)}
                        className="px-2 py-0.5 text-[10px] text-muted hover:text-status-error transition-colors flex-shrink-0"
                      >
                        Remove
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Phone list */}
          {phones.length > 0 && (
            <div className="mb-4">
              <p className="text-xs font-medium text-muted mb-2">Phone numbers</p>
              <div className="space-y-1">
                {phones.map((pid) => (
                  <div
                    key={pid.address}
                    className="flex items-center justify-between p-2 bg-surface-2 rounded-lg"
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <svg
                        className="w-4 h-4 text-muted flex-shrink-0"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                        strokeWidth={2}
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          d="M2.25 6.75c0 8.284 6.716 15 15 15h2.25a2.25 2.25 0 002.25-2.25v-1.372c0-.516-.351-.966-.852-1.091l-4.423-1.106c-.44-.11-.902.055-1.173.417l-.97 1.293c-.282.376-.769.542-1.21.38a12.035 12.035 0 01-7.143-7.143c-.162-.441.004-.928.38-1.21l1.293-.97c.363-.271.527-.734.417-1.173L6.963 3.102a1.125 1.125 0 00-1.091-.852H4.5A2.25 2.25 0 002.25 4.5v2.25z"
                        />
                      </svg>
                      <span className="text-sm text-primary truncate">+{pid.address}</span>
                    </div>
                    {confirmRemove === pid.address ? (
                      <div className="flex items-center gap-1 flex-shrink-0">
                        <button
                          onClick={() => handleRemove(pid.medium, pid.address)}
                          disabled={removingAddress === pid.address}
                          className="px-2 py-0.5 text-[10px] font-medium text-primary bg-status-error rounded transition-colors disabled:opacity-50"
                        >
                          {removingAddress === pid.address ? "..." : "Confirm"}
                        </button>
                        <button
                          onClick={() => setConfirmRemove(null)}
                          className="px-2 py-0.5 text-[10px] text-secondary hover:text-primary transition-colors"
                        >
                          Cancel
                        </button>
                      </div>
                    ) : (
                      <button
                        onClick={() => setConfirmRemove(pid.address)}
                        className="px-2 py-0.5 text-[10px] text-muted hover:text-status-error transition-colors flex-shrink-0"
                      >
                        Remove
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {emails.length === 0 && phones.length === 0 && addMode === "idle" && (
            <p className="text-sm text-muted mb-4">No email addresses or phone numbers linked.</p>
          )}

          {error && <p className="text-sm text-status-error mb-3">{error}</p>}

          {/* Add buttons */}
          {addMode === "idle" && (
            <div className="flex gap-2">
              <button
                onClick={() => setAddMode("add-email")}
                className="px-3 py-1.5 text-xs bg-surface-2 hover:bg-surface-3 text-secondary border border-border rounded-lg transition-colors"
              >
                Add Email
              </button>
              <button
                onClick={() => setAddMode("add-phone")}
                className="px-3 py-1.5 text-xs bg-surface-2 hover:bg-surface-3 text-secondary border border-border rounded-lg transition-colors"
              >
                Add Phone
              </button>
            </div>
          )}

          {/* Add email form */}
          {addMode === "add-email" && (
            <div className="space-y-3 max-w-sm">
              <div>
                <label className="block text-xs font-medium text-muted mb-1">Email address</label>
                <input
                  type="email"
                  value={newEmail}
                  onChange={(e) => setNewEmail(e.target.value)}
                  placeholder="you@example.com"
                  className="w-full px-3 py-2 bg-surface-2 border border-border rounded-lg text-sm text-primary placeholder-muted focus:outline-none focus:border-accent"
                  autoFocus
                />
              </div>
              <div className="flex gap-2">
                <button
                  onClick={handleAddEmail}
                  disabled={submitting || !newEmail.trim()}
                  className="px-4 py-2 bg-accent hover:bg-accent-hover disabled:opacity-50 text-inverse text-sm font-medium rounded-lg transition-colors"
                >
                  {submitting ? "Sending..." : "Send Verification"}
                </button>
                <button
                  onClick={cancelAdd}
                  className="px-4 py-2 text-sm text-secondary hover:text-primary transition-colors"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}

          {/* Verify email */}
          {addMode === "verify-email" && (
            <div className="space-y-3 max-w-sm">
              <div className="p-3 bg-surface-2 rounded-lg">
                <p className="text-sm text-secondary">
                  A verification email has been sent to{" "}
                  <span className="text-primary font-medium">{newEmail}</span>. Click the link in
                  the email, then press the button below.
                </p>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={handleVerifyEmail}
                  disabled={submitting}
                  className="px-4 py-2 bg-accent hover:bg-accent-hover disabled:opacity-50 text-inverse text-sm font-medium rounded-lg transition-colors"
                >
                  {submitting ? "Verifying..." : "I have verified my email"}
                </button>
                <button
                  onClick={cancelAdd}
                  className="px-4 py-2 text-sm text-secondary hover:text-primary transition-colors"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}

          {/* Add phone form */}
          {addMode === "add-phone" && (
            <div className="space-y-3 max-w-sm">
              <div className="flex gap-2">
                <div className="w-20">
                  <label className="block text-xs font-medium text-muted mb-1">Country</label>
                  <select
                    value={phoneCountry}
                    onChange={(e) => setPhoneCountry(e.target.value)}
                    className="w-full px-2 py-2 bg-surface-2 border border-border rounded-lg text-sm text-primary focus:outline-none focus:border-accent appearance-none"
                  >
                    <option value="US">US</option>
                    <option value="GB">GB</option>
                    <option value="DE">DE</option>
                    <option value="FR">FR</option>
                    <option value="JP">JP</option>
                    <option value="CN">CN</option>
                    <option value="IN">IN</option>
                    <option value="AU">AU</option>
                    <option value="CA">CA</option>
                    <option value="BR">BR</option>
                  </select>
                </div>
                <div className="flex-1">
                  <label className="block text-xs font-medium text-muted mb-1">Phone number</label>
                  <input
                    type="tel"
                    value={newPhone}
                    onChange={(e) => setNewPhone(e.target.value)}
                    placeholder="5551234567"
                    className="w-full px-3 py-2 bg-surface-2 border border-border rounded-lg text-sm text-primary placeholder-muted focus:outline-none focus:border-accent"
                    autoFocus
                  />
                </div>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={handleAddPhone}
                  disabled={submitting || !newPhone.trim()}
                  className="px-4 py-2 bg-accent hover:bg-accent-hover disabled:opacity-50 text-inverse text-sm font-medium rounded-lg transition-colors"
                >
                  {submitting ? "Sending..." : "Send Code"}
                </button>
                <button
                  onClick={cancelAdd}
                  className="px-4 py-2 text-sm text-secondary hover:text-primary transition-colors"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}

          {/* Verify phone */}
          {addMode === "verify-phone" && (
            <div className="space-y-3 max-w-sm">
              <div className="p-3 bg-surface-2 rounded-lg">
                <p className="text-sm text-secondary">
                  A verification code has been sent to{" "}
                  <span className="text-primary font-medium">+{newPhone}</span>. Check your
                  messages, then press the button below.
                </p>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={handleVerifyPhone}
                  disabled={submitting}
                  className="px-4 py-2 bg-accent hover:bg-accent-hover disabled:opacity-50 text-inverse text-sm font-medium rounded-lg transition-colors"
                >
                  {submitting ? "Verifying..." : "I have verified my phone"}
                </button>
                <button
                  onClick={cancelAdd}
                  className="px-4 py-2 text-sm text-secondary hover:text-primary transition-colors"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
