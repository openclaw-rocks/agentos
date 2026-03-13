import React, { useCallback, useEffect, useState } from "react";
import { SecuritySettings } from "./SecuritySettings";
import { ThreePidSettings } from "./ThreePidSettings";
import { VoiceVideoSettings } from "./VoiceVideoSettings";
import {
  addKeywordRule,
  removeKeywordRule,
  getKeywordRules,
  setEmailNotificationRule,
  type KeywordRule,
} from "~/lib/keyword-notifications";
import { useMatrix } from "~/lib/matrix-context";
import { isPushNotificationSupported } from "~/lib/platform";
import {
  PUSH_APP_ID,
  buildPusherData,
  registerPusher,
  unregisterPusher,
  getPushers,
  isPushSupported,
  type Pusher,
} from "~/lib/push-gateway";
import { registerServiceWorker, subscribeToPush } from "~/lib/push-service-worker";
import {
  applyAllSettings,
  applyCustomTheme,
  clearCustomTheme,
  loadSettings,
  saveSettings,
  type AppSettings,
  type FontSize,
  type ImageSize,
  type MessageLayout,
  type Theme,
} from "~/lib/theme";

interface SettingsPanelProps {
  onClose: () => void;
}

type Section =
  | "appearance"
  | "preferences"
  | "account"
  | "sessions"
  | "security"
  | "voicevideo"
  | "notifications"
  | "shortcuts"
  | "about";

interface DeviceInfo {
  device_id: string;
  display_name?: string;
  last_seen_ip?: string;
  last_seen_ts?: number;
}

export function SettingsPanel({ onClose }: SettingsPanelProps): React.ReactElement {
  const { client, logout } = useMatrix();
  const [section, setSection] = useState<Section>("appearance");
  const [settings, setSettings] = useState<AppSettings>(loadSettings);

  // Mobile layout: show nav list first, then content on tap
  const [isMobile, setIsMobile] = useState(() => window.innerWidth < 640);
  const [mobileShowNav, setMobileShowNav] = useState(true);

  useEffect(() => {
    const mql = window.matchMedia("(max-width: 639px)");
    const handler = (e: MediaQueryListEvent): void => setIsMobile(e.matches);
    mql.addEventListener("change", handler);
    return () => mql.removeEventListener("change", handler);
  }, []);

  // Account state
  const [displayName, setDisplayName] = useState("");
  const [displayNameSaving, setDisplayNameSaving] = useState(false);
  const [displayNameSuccess, setDisplayNameSuccess] = useState(false);
  const [avatarUploading, setAvatarUploading] = useState(false);

  // Password state
  const [oldPassword, setOldPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [passwordError, setPasswordError] = useState("");
  const [passwordSuccess, setPasswordSuccess] = useState(false);
  const [passwordSaving, setPasswordSaving] = useState(false);

  // Sessions state
  const [devices, setDevices] = useState<DeviceInfo[]>([]);
  const [devicesLoading, setDevicesLoading] = useState(false);
  const [devicesError, setDevicesError] = useState("");
  const [deletingDevice, setDeletingDevice] = useState<string | null>(null);

  // Account deactivation state
  const [deactivatePassword, setDeactivatePassword] = useState("");
  const [eraseData, setEraseData] = useState(false);
  const [deactivating, setDeactivating] = useState(false);
  const [deactivateError, setDeactivateError] = useState("");
  const [showDeactivateConfirm, setShowDeactivateConfirm] = useState(false);

  // Load display name on mount
  useEffect(() => {
    const userId = client.getUserId();
    if (userId) {
      const user = client.getUser(userId);
      setDisplayName(user?.displayName ?? userId);
    }
  }, [client]);

  // Load devices when sessions tab is selected
  useEffect(() => {
    if (section === "sessions") {
      loadDevices();
    }
  }, [section]);

  // Close on Escape
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent): void => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  const updateSettings = useCallback((partial: Partial<AppSettings>): void => {
    setSettings((prev) => {
      const next = { ...prev, ...partial };
      saveSettings(next);
      applyAllSettings(next);
      return next;
    });
  }, []);

  const loadDevices = async (): Promise<void> => {
    setDevicesLoading(true);
    setDevicesError("");
    try {
      const response = await client.getDevices();
      setDevices((response?.devices as DeviceInfo[]) ?? []);
    } catch (err) {
      setDevicesError(err instanceof Error ? err.message : "Failed to load devices");
    } finally {
      setDevicesLoading(false);
    }
  };

  const handleSaveDisplayName = async (): Promise<void> => {
    const trimmed = displayName.trim();
    if (!trimmed) return;
    setDisplayNameSaving(true);
    setDisplayNameSuccess(false);
    try {
      await client.setDisplayName(trimmed);
      setDisplayNameSuccess(true);
      setTimeout(() => setDisplayNameSuccess(false), 2000);
    } catch {
      // ignore errors silently
    } finally {
      setDisplayNameSaving(false);
    }
  };

  const handleAvatarUpload = async (e: React.ChangeEvent<HTMLInputElement>): Promise<void> => {
    const file = e.target.files?.[0];
    if (!file) return;
    setAvatarUploading(true);
    try {
      const response = await client.uploadContent(file, { type: file.type });
      const mxcUrl = typeof response === "string" ? response : response?.content_uri;
      if (mxcUrl) {
        await client.setAvatarUrl(mxcUrl);
      }
    } catch {
      // ignore errors silently
    } finally {
      setAvatarUploading(false);
    }
  };

  const handleChangePassword = async (e: React.FormEvent): Promise<void> => {
    e.preventDefault();
    setPasswordError("");
    setPasswordSuccess(false);

    if (newPassword !== confirmPassword) {
      setPasswordError("Passwords do not match");
      return;
    }
    if (newPassword.length < 8) {
      setPasswordError("New password must be at least 8 characters");
      return;
    }

    setPasswordSaving(true);
    try {
      const userId = client.getUserId();
      await client.setPassword(
        {
          type: "m.login.password",
          identifier: { type: "m.id.user", user: userId ?? "" },
          password: oldPassword,
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
        } as any,
        newPassword,
      );
      setPasswordSuccess(true);
      setOldPassword("");
      setNewPassword("");
      setConfirmPassword("");
      setTimeout(() => setPasswordSuccess(false), 3000);
    } catch (err) {
      setPasswordError(err instanceof Error ? err.message : "Failed to change password");
    } finally {
      setPasswordSaving(false);
    }
  };

  const handleDeleteDevice = async (deviceId: string): Promise<void> => {
    setDeletingDevice(deviceId);
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (client as any).deleteDevice(deviceId, {});
      setDevices((prev) => prev.filter((d) => d.device_id !== deviceId));
    } catch {
      // Some servers require interactive auth for device deletion; ignore for now
    } finally {
      setDeletingDevice(null);
    }
  };

  const handleDeleteAllOtherDevices = async (): Promise<void> => {
    const currentId = client.getDeviceId();
    const otherDevices = devices.filter((d) => d.device_id !== currentId);
    for (const device of otherDevices) {
      await handleDeleteDevice(device.device_id);
    }
  };

  const handleDeactivateAccount = async (): Promise<void> => {
    if (!deactivatePassword.trim()) {
      setDeactivateError("Password is required to deactivate your account.");
      return;
    }

    setDeactivating(true);
    setDeactivateError("");

    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (client as any).deactivateAccount(
        {
          type: "m.login.password",
          identifier: { type: "m.id.user", user: client.getUserId() },
          password: deactivatePassword,
        },
        eraseData,
      );
      // If successful, the session is invalidated; trigger logout
      logout();
    } catch (err) {
      setDeactivateError(err instanceof Error ? err.message : "Failed to deactivate account");
    } finally {
      setDeactivating(false);
    }
  };

  const currentDeviceId = client.getDeviceId();

  const navItems: Array<{ key: Section; label: string }> = [
    { key: "appearance", label: "Appearance" },
    { key: "preferences", label: "Preferences" },
    { key: "account", label: "Account" },
    { key: "sessions", label: "Sessions" },
    { key: "security", label: "Security" },
    { key: "voicevideo", label: "Voice & Video" },
    { key: "notifications", label: "Notifications" },
    { key: "shortcuts", label: "Keyboard Shortcuts" },
    { key: "about", label: "About" },
  ];

  const renderSettingsContent = (): React.ReactElement => (
    <>
      {section === "appearance" && (
        <AppearanceSection settings={settings} onUpdate={updateSettings} />
      )}
      {section === "preferences" && (
        <PreferencesSection settings={settings} onUpdate={updateSettings} />
      )}
      {section === "account" && (
        <AccountSection
          client={client}
          settings={settings}
          onUpdateSettings={updateSettings}
          displayName={displayName}
          onDisplayNameChange={setDisplayName}
          onSaveDisplayName={handleSaveDisplayName}
          displayNameSaving={displayNameSaving}
          displayNameSuccess={displayNameSuccess}
          avatarUploading={avatarUploading}
          onAvatarUpload={handleAvatarUpload}
          oldPassword={oldPassword}
          onOldPasswordChange={setOldPassword}
          newPassword={newPassword}
          onNewPasswordChange={setNewPassword}
          confirmPassword={confirmPassword}
          onConfirmPasswordChange={setConfirmPassword}
          passwordError={passwordError}
          passwordSuccess={passwordSuccess}
          passwordSaving={passwordSaving}
          onChangePassword={handleChangePassword}
          deactivatePassword={deactivatePassword}
          onDeactivatePasswordChange={setDeactivatePassword}
          eraseData={eraseData}
          onEraseDataChange={setEraseData}
          deactivating={deactivating}
          deactivateError={deactivateError}
          showDeactivateConfirm={showDeactivateConfirm}
          onShowDeactivateConfirm={setShowDeactivateConfirm}
          onDeactivateAccount={handleDeactivateAccount}
        />
      )}
      {section === "sessions" && (
        <SessionsSection
          client={client}
          devices={devices}
          setDevices={setDevices}
          loading={devicesLoading}
          error={devicesError}
          currentDeviceId={currentDeviceId ?? ""}
          deletingDevice={deletingDevice}
          onDeleteDevice={handleDeleteDevice}
          onDeleteAllOther={handleDeleteAllOtherDevices}
        />
      )}
      {section === "security" && <SecuritySettings />}
      {section === "voicevideo" && <VoiceVideoSettings />}
      {section === "notifications" && (
        <NotificationsSection client={client} settings={settings} onUpdate={updateSettings} />
      )}
      {section === "shortcuts" && <ShortcutsSection />}
      {section === "about" && <AboutSection />}
    </>
  );

  // Mobile: full-screen with iOS-style drill-down navigation
  if (isMobile) {
    return (
      <div className="fixed inset-0 z-50 bg-surface-1 flex flex-col">
        {mobileShowNav ? (
          <>
            <div className="h-14 flex items-center px-4 border-b border-border flex-shrink-0">
              <h2 className="text-lg font-bold text-primary flex-1">Settings</h2>
              <button
                onClick={onClose}
                className="p-2 -mr-2 text-secondary active:text-primary rounded-lg transition-colors"
                aria-label="Close"
              >
                <svg
                  className="w-5 h-5"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={2}
                >
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <nav className="flex-1 overflow-y-auto">
              {navItems.map((item) => (
                <button
                  key={item.key}
                  onClick={() => {
                    setSection(item.key);
                    setMobileShowNav(false);
                  }}
                  className="w-full px-4 py-3.5 text-left text-sm flex items-center justify-between border-b border-border/50 text-secondary active:bg-surface-2 transition-colors"
                >
                  <span>{item.label}</span>
                  <svg
                    className="w-4 h-4 text-muted"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    strokeWidth={2}
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                  </svg>
                </button>
              ))}
            </nav>
          </>
        ) : (
          <>
            <div className="h-14 flex items-center px-4 border-b border-border flex-shrink-0 gap-3">
              <button
                onClick={() => setMobileShowNav(true)}
                className="p-2 -ml-2 text-secondary active:text-primary rounded-lg transition-colors"
                aria-label="Back to settings"
              >
                <svg
                  className="w-5 h-5"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={2}
                >
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
                </svg>
              </button>
              <h2 className="text-lg font-bold text-primary">
                {navItems.find((i) => i.key === section)?.label}
              </h2>
            </div>
            <div className="flex-1 overflow-y-auto p-4">{renderSettingsContent()}</div>
          </>
        )}
      </div>
    );
  }

  // Desktop: side-by-side layout in centered modal
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60"
      onClick={onClose}
    >
      <div
        className="w-full max-w-3xl h-[80vh] bg-surface-1 border border-border rounded-xl shadow-2xl overflow-hidden flex"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Sidebar navigation */}
        <nav className="w-48 flex-shrink-0 bg-surface-0 border-r border-border py-4 flex flex-col">
          <h2 className="px-4 text-sm font-bold text-primary mb-3">Settings</h2>
          {navItems.map((item) => (
            <button
              key={item.key}
              onClick={() => setSection(item.key)}
              className={`w-full px-4 py-2 text-left text-sm transition-colors ${
                section === item.key
                  ? "bg-surface-2 text-primary font-medium"
                  : "text-secondary hover:bg-surface-1 hover:text-primary"
              }`}
            >
              {item.label}
            </button>
          ))}
          <div className="flex-1" />
          <button
            onClick={onClose}
            className="mx-4 px-3 py-2 text-sm text-muted hover:text-secondary transition-colors"
          >
            Close
          </button>
        </nav>

        {/* Content area */}
        <div className="flex-1 overflow-y-auto p-6">{renderSettingsContent()}</div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Appearance                                                          */
/* ------------------------------------------------------------------ */

function AppearanceSection({
  settings,
  onUpdate,
}: {
  settings: AppSettings;
  onUpdate: (partial: Partial<AppSettings>) => void;
}): React.ReactElement {
  const [customThemeInput, setCustomThemeInput] = useState(settings.customThemeUrl ?? "");
  const [customThemeLoading, setCustomThemeLoading] = useState(false);
  const [customThemeError, setCustomThemeError] = useState("");

  const themeOptions: Array<{ value: Theme; label: string }> = [
    { value: "dark", label: "Dark" },
    { value: "light", label: "Light" },
    { value: "high-contrast", label: "High Contrast" },
  ];

  const fontSizeOptions: Array<{ value: FontSize; label: string }> = [
    { value: "small", label: "Small" },
    { value: "normal", label: "Normal" },
    { value: "large", label: "Large" },
  ];

  const layoutOptions: Array<{ value: MessageLayout; label: string; description: string }> = [
    { value: "modern", label: "Modern", description: "Avatar left, name above message" },
    { value: "irc", label: "IRC", description: "Single line: [time] <sender> message" },
    { value: "bubble", label: "Bubble", description: "Chat bubbles, own messages right-aligned" },
  ];

  const imageSizeOptions: Array<{ value: ImageSize; label: string }> = [
    { value: "small", label: "Small" },
    { value: "medium", label: "Medium" },
    { value: "large", label: "Large" },
  ];

  const handleApplyCustomTheme = async (): Promise<void> => {
    const url = customThemeInput.trim();
    if (!url) {
      clearCustomTheme();
      onUpdate({ customThemeUrl: null });
      return;
    }
    setCustomThemeLoading(true);
    setCustomThemeError("");
    try {
      await applyCustomTheme(url);
      onUpdate({ customThemeUrl: url });
    } catch (err) {
      setCustomThemeError(err instanceof Error ? err.message : "Failed to load theme");
    } finally {
      setCustomThemeLoading(false);
    }
  };

  return (
    <div>
      <h3 className="text-lg font-bold text-primary mb-4">Appearance</h3>

      {/* Theme */}
      <div className="mb-6">
        <label className="block text-sm font-medium text-secondary mb-2">Theme</label>
        <div className="flex gap-2">
          {themeOptions.map((opt) => (
            <button
              key={opt.value}
              onClick={() => onUpdate({ theme: opt.value })}
              className={`px-4 py-2 text-sm rounded-lg border transition-colors ${
                settings.theme === opt.value
                  ? "bg-accent text-inverse border-accent"
                  : "bg-surface-2 text-secondary border-border hover:bg-surface-3"
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      {/* Message Layout */}
      <div className="mb-6">
        <label className="block text-sm font-medium text-secondary mb-2">Message Layout</label>
        <div className="flex gap-2">
          {layoutOptions.map((opt) => (
            <button
              key={opt.value}
              onClick={() => onUpdate({ messageLayout: opt.value })}
              className={`px-4 py-2 text-sm rounded-lg border transition-colors ${
                settings.messageLayout === opt.value
                  ? "bg-accent text-inverse border-accent"
                  : "bg-surface-2 text-secondary border-border hover:bg-surface-3"
              }`}
              title={opt.description}
            >
              {opt.label}
            </button>
          ))}
        </div>
        <p className="text-xs text-muted mt-1.5">
          {layoutOptions.find((o) => o.value === settings.messageLayout)?.description}
        </p>

        {/* Layout Preview */}
        <div className="mt-3 p-3 bg-surface-0 border border-border rounded-lg">
          <p className="text-[10px] text-muted uppercase tracking-wider mb-2">Preview</p>
          {settings.messageLayout === "modern" && (
            <div className="flex items-start gap-2">
              <div className="w-6 h-6 rounded-full bg-accent/30 flex-shrink-0" />
              <div>
                <div className="flex items-baseline gap-1.5">
                  <span className="text-xs font-medium text-primary">Alice</span>
                  <span className="text-[10px] text-faint">12:34 PM</span>
                </div>
                <p className="text-xs text-secondary">Hello, this is a message!</p>
              </div>
            </div>
          )}
          {settings.messageLayout === "irc" && (
            <div className="font-mono text-xs text-secondary">
              <span className="text-faint">[12:34]</span>{" "}
              <span className="text-accent">&lt;Alice&gt;</span> Hello, this is a message!
            </div>
          )}
          {settings.messageLayout === "bubble" && (
            <div className="space-y-1.5">
              <div className="flex justify-start">
                <div className="max-w-[80%]">
                  <div className="px-3 py-1.5 bg-surface-2 rounded-2xl rounded-bl-sm">
                    <p className="text-xs text-secondary">Hello, this is a message!</p>
                  </div>
                  <div className="flex items-center gap-1 mt-0.5">
                    <div className="w-3 h-3 rounded-full bg-surface-3" />
                    <span className="text-[10px] text-faint">Alice</span>
                  </div>
                </div>
              </div>
              <div className="flex justify-end">
                <div className="max-w-[80%]">
                  <div className="px-3 py-1.5 bg-accent/20 rounded-2xl rounded-br-sm">
                    <p className="text-xs text-primary">My reply here</p>
                  </div>
                  <div className="flex items-center gap-1 mt-0.5 justify-end">
                    <span className="text-[10px] text-faint">You</span>
                    <div className="w-3 h-3 rounded-full bg-accent/30" />
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Font Size */}
      <div className="mb-6">
        <label className="block text-sm font-medium text-secondary mb-2">Font Size</label>
        <div className="flex gap-2">
          {fontSizeOptions.map((opt) => (
            <button
              key={opt.value}
              onClick={() => onUpdate({ fontSize: opt.value })}
              className={`px-4 py-2 text-sm rounded-lg border transition-colors ${
                settings.fontSize === opt.value
                  ? "bg-accent text-inverse border-accent"
                  : "bg-surface-2 text-secondary border-border hover:bg-surface-3"
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      {/* Image Size */}
      <div className="mb-6">
        <label className="block text-sm font-medium text-secondary mb-2">
          Image Size in Timeline
        </label>
        <div className="flex gap-2">
          {imageSizeOptions.map((opt) => (
            <button
              key={opt.value}
              onClick={() => onUpdate({ imageSize: opt.value })}
              className={`px-4 py-2 text-sm rounded-lg border transition-colors ${
                settings.imageSize === opt.value
                  ? "bg-accent text-inverse border-accent"
                  : "bg-surface-2 text-secondary border-border hover:bg-surface-3"
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      {/* Compact mode */}
      <div className="mb-6">
        <label className="flex items-center gap-3 cursor-pointer">
          <input
            type="checkbox"
            checked={settings.compact}
            onChange={(e) => onUpdate({ compact: e.target.checked })}
            className="w-4 h-4 rounded border-border bg-surface-2 text-accent focus:ring-accent"
          />
          <div>
            <span className="text-sm font-medium text-primary">Compact Mode</span>
            <p className="text-xs text-muted">Reduces padding and spacing</p>
          </div>
        </label>
      </div>

      {/* Custom Theme URL */}
      <div className="mb-6">
        <label className="block text-sm font-medium text-secondary mb-2">Custom Theme URL</label>
        <div className="flex gap-2">
          <input
            type="url"
            value={customThemeInput}
            onChange={(e) => setCustomThemeInput(e.target.value)}
            className="flex-1 px-3 py-2 bg-surface-2 border border-border rounded-lg text-sm text-primary placeholder-muted focus:outline-none focus:border-accent"
            placeholder="https://example.com/theme.json"
          />
          <button
            onClick={handleApplyCustomTheme}
            disabled={customThemeLoading}
            className="px-4 py-2 bg-accent hover:bg-accent-hover disabled:opacity-50 text-inverse text-sm font-medium rounded-lg transition-colors"
          >
            {customThemeLoading ? "Loading..." : "Apply"}
          </button>
        </div>
        {customThemeError && <p className="text-xs text-status-error mt-1">{customThemeError}</p>}
        <p className="text-xs text-muted mt-1.5">
          Provide a JSON URL with custom CSS properties. Leave empty and click Apply to reset.
        </p>
      </div>

      {/* Show Hidden Events */}
      <div className="mb-6">
        <label className="flex items-center gap-3 cursor-pointer">
          <input
            type="checkbox"
            checked={settings.showHiddenEvents}
            onChange={(e) => onUpdate({ showHiddenEvents: e.target.checked })}
            className="w-4 h-4 rounded border-border bg-surface-2 text-accent focus:ring-accent"
          />
          <div>
            <span className="text-sm font-medium text-primary">Show Hidden Events</span>
            <p className="text-xs text-muted">
              Display all event types in the timeline, including non-standard events
            </p>
          </div>
        </label>
      </div>

      {/* Language / Region */}
      <div className="mb-6">
        <label className="block text-sm font-medium text-secondary mb-2">Language</label>
        <select
          value={settings.language}
          onChange={(e) => onUpdate({ language: e.target.value })}
          className="w-full max-w-xs px-3 py-2 bg-surface-2 border border-border rounded-lg text-sm text-primary focus:outline-none focus:border-accent appearance-none cursor-pointer"
        >
          {LANGUAGE_OPTIONS.map((lang) => (
            <option key={lang.code} value={lang.code}>
              {lang.label}
            </option>
          ))}
        </select>
        <p className="text-xs text-muted mt-1.5">
          Changes the display language. Full internationalization coming soon.
        </p>
      </div>
    </div>
  );
}

const LANGUAGE_OPTIONS: ReadonlyArray<{ code: string; label: string }> = [
  { code: "en", label: "English" },
  { code: "de", label: "Deutsch (German)" },
  { code: "fr", label: "Fran\u00e7ais (French)" },
  { code: "es", label: "Espa\u00f1ol (Spanish)" },
  { code: "ja", label: "\u65e5\u672c\u8a9e (Japanese)" },
  { code: "zh", label: "\u4e2d\u6587 (Chinese)" },
];

/* ------------------------------------------------------------------ */
/* Account                                                             */
/* ------------------------------------------------------------------ */

function AccountSection({
  client,
  settings,
  onUpdateSettings,
  displayName,
  onDisplayNameChange,
  onSaveDisplayName,
  displayNameSaving,
  displayNameSuccess,
  avatarUploading,
  onAvatarUpload,
  oldPassword,
  onOldPasswordChange,
  newPassword,
  onNewPasswordChange,
  confirmPassword,
  onConfirmPasswordChange,
  passwordError,
  passwordSuccess,
  passwordSaving,
  onChangePassword,
  deactivatePassword,
  onDeactivatePasswordChange,
  eraseData,
  onEraseDataChange,
  deactivating,
  deactivateError,
  showDeactivateConfirm,
  onShowDeactivateConfirm,
  onDeactivateAccount,
}: {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  client: any;
  settings: AppSettings;
  onUpdateSettings: (partial: Partial<AppSettings>) => void;
  displayName: string;
  onDisplayNameChange: (name: string) => void;
  onSaveDisplayName: () => void;
  displayNameSaving: boolean;
  displayNameSuccess: boolean;
  avatarUploading: boolean;
  onAvatarUpload: (e: React.ChangeEvent<HTMLInputElement>) => void;
  oldPassword: string;
  onOldPasswordChange: (val: string) => void;
  newPassword: string;
  onNewPasswordChange: (val: string) => void;
  confirmPassword: string;
  onConfirmPasswordChange: (val: string) => void;
  passwordError: string;
  passwordSuccess: boolean;
  passwordSaving: boolean;
  onChangePassword: (e: React.FormEvent) => void;
  deactivatePassword: string;
  onDeactivatePasswordChange: (val: string) => void;
  eraseData: boolean;
  onEraseDataChange: (val: boolean) => void;
  deactivating: boolean;
  deactivateError: string;
  showDeactivateConfirm: boolean;
  onShowDeactivateConfirm: (val: boolean) => void;
  onDeactivateAccount: () => void;
}): React.ReactElement {
  // Identity server state
  const [identityServerUrl, setIdentityServerUrl] = useState(() => {
    try {
      return client.getIdentityServerUrl?.() ?? "";
    } catch {
      return "";
    }
  });
  const [identityConnecting, setIdentityConnecting] = useState(false);
  const [identityError, setIdentityError] = useState("");

  const handleConnectIdentityServer = async (): Promise<void> => {
    const url = identityServerUrl.trim();
    if (!url) return;
    setIdentityConnecting(true);
    setIdentityError("");
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (client as any).setIdentityServerUrl(url);
      setIdentityError("");
    } catch (err) {
      setIdentityError(err instanceof Error ? err.message : "Failed to connect");
    } finally {
      setIdentityConnecting(false);
    }
  };

  const handleDisconnectIdentityServer = (): void => {
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (client as any).setIdentityServerUrl("");
      setIdentityServerUrl("");
    } catch {
      // best-effort
    }
  };

  // Integration manager URL state
  const [integrationUrl, setIntegrationUrl] = useState(settings.integrationManagerUrl ?? "");

  return (
    <div>
      <h3 className="text-lg font-bold text-primary mb-4">Account</h3>

      {/* Display Name */}
      <div className="mb-6">
        <label className="block text-sm font-medium text-secondary mb-1.5">Display Name</label>
        <div className="flex gap-2">
          <input
            type="text"
            value={displayName}
            onChange={(e) => onDisplayNameChange(e.target.value)}
            className="flex-1 px-3 py-2 bg-surface-2 border border-border rounded-lg text-sm text-primary placeholder-muted focus:outline-none focus:border-accent"
          />
          <button
            onClick={onSaveDisplayName}
            disabled={displayNameSaving}
            className="px-4 py-2 bg-accent hover:bg-accent-hover disabled:opacity-50 text-inverse text-sm font-medium rounded-lg transition-colors"
          >
            {displayNameSaving ? "Saving..." : displayNameSuccess ? "Saved" : "Save"}
          </button>
        </div>
      </div>

      {/* Avatar */}
      <div className="mb-6">
        <label className="block text-sm font-medium text-secondary mb-1.5">Avatar</label>
        <label className="inline-flex items-center gap-2 px-4 py-2 bg-surface-2 border border-border rounded-lg text-sm text-secondary hover:bg-surface-3 cursor-pointer transition-colors">
          <svg
            className="w-4 h-4"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"
            />
          </svg>
          {avatarUploading ? "Uploading..." : "Upload Avatar"}
          <input type="file" accept="image/*" onChange={onAvatarUpload} className="hidden" />
        </label>
      </div>

      {/* Divider */}
      <div className="h-px bg-border my-6" />

      {/* Email / Phone 3PID Management */}
      <ThreePidSettings />

      {/* Divider */}
      <div className="h-px bg-border my-6" />

      {/* Identity Server */}
      <h4 className="text-sm font-bold text-primary mb-3">Identity Server</h4>
      <p className="text-xs text-muted mb-2">
        An identity server is used to find contacts by email or phone number.
      </p>
      <div className="flex gap-2 max-w-sm mb-2">
        <input
          type="url"
          value={identityServerUrl}
          onChange={(e) => setIdentityServerUrl(e.target.value)}
          className="flex-1 px-3 py-2 bg-surface-2 border border-border rounded-lg text-sm text-primary placeholder-muted focus:outline-none focus:border-accent"
          placeholder="https://vector.im"
        />
        {identityServerUrl.trim() ? (
          <button
            onClick={handleConnectIdentityServer}
            disabled={identityConnecting}
            className="px-4 py-2 bg-accent hover:bg-accent-hover disabled:opacity-50 text-inverse text-sm font-medium rounded-lg transition-colors"
          >
            {identityConnecting ? "..." : "Connect"}
          </button>
        ) : null}
        {identityServerUrl.trim() && (
          <button
            onClick={handleDisconnectIdentityServer}
            className="px-4 py-2 text-sm text-secondary hover:text-primary border border-border rounded-lg transition-colors"
          >
            Disconnect
          </button>
        )}
      </div>
      {identityError && <p className="text-xs text-status-error mt-1">{identityError}</p>}

      {/* Divider */}
      <div className="h-px bg-border my-6" />

      {/* Integration Manager */}
      <h4 className="text-sm font-bold text-primary mb-3">Integration Manager</h4>
      <div className="space-y-3 max-w-sm">
        <label className="flex items-center gap-3 cursor-pointer">
          <input
            type="checkbox"
            checked={settings.integrationManagerEnabled}
            onChange={(e) => onUpdateSettings({ integrationManagerEnabled: e.target.checked })}
            className="w-4 h-4 rounded border-border bg-surface-2 text-accent focus:ring-accent"
          />
          <div>
            <span className="text-sm font-medium text-primary">Enable Integration Manager</span>
            <p className="text-xs text-muted">Manage bots, bridges, and widgets</p>
          </div>
        </label>
        {settings.integrationManagerEnabled && (
          <div>
            <label className="block text-xs font-medium text-muted mb-1">
              Integration Manager URL
            </label>
            <input
              type="url"
              value={integrationUrl}
              onChange={(e) => setIntegrationUrl(e.target.value)}
              onBlur={() =>
                onUpdateSettings({ integrationManagerUrl: integrationUrl.trim() || null })
              }
              className="w-full px-3 py-2 bg-surface-2 border border-border rounded-lg text-sm text-primary placeholder-muted focus:outline-none focus:border-accent"
              placeholder="https://scalar.vector.im"
            />
          </div>
        )}
      </div>

      {/* Divider */}
      <div className="h-px bg-border my-6" />

      {/* Password Change */}
      <h4 className="text-sm font-bold text-primary mb-3">Change Password</h4>
      <form onSubmit={onChangePassword} className="space-y-3 max-w-sm">
        <div>
          <label className="block text-xs font-medium text-muted mb-1">Current Password</label>
          <input
            type="password"
            value={oldPassword}
            onChange={(e) => onOldPasswordChange(e.target.value)}
            className="w-full px-3 py-2 bg-surface-2 border border-border rounded-lg text-sm text-primary focus:outline-none focus:border-accent"
            required
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-muted mb-1">New Password</label>
          <input
            type="password"
            value={newPassword}
            onChange={(e) => onNewPasswordChange(e.target.value)}
            className="w-full px-3 py-2 bg-surface-2 border border-border rounded-lg text-sm text-primary focus:outline-none focus:border-accent"
            required
            minLength={8}
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-muted mb-1">Confirm New Password</label>
          <input
            type="password"
            value={confirmPassword}
            onChange={(e) => onConfirmPasswordChange(e.target.value)}
            className="w-full px-3 py-2 bg-surface-2 border border-border rounded-lg text-sm text-primary focus:outline-none focus:border-accent"
            required
            minLength={8}
          />
        </div>
        {passwordError && <p className="text-sm text-status-error">{passwordError}</p>}
        {passwordSuccess && (
          <p className="text-sm text-status-success">Password changed successfully</p>
        )}
        <button
          type="submit"
          disabled={passwordSaving || !oldPassword || !newPassword || !confirmPassword}
          className="px-4 py-2 bg-accent hover:bg-accent-hover disabled:opacity-50 text-inverse text-sm font-medium rounded-lg transition-colors"
        >
          {passwordSaving ? "Changing..." : "Change Password"}
        </button>
      </form>

      {/* Divider */}
      <div className="h-px bg-border my-8" />

      {/* Danger Zone */}
      <div className="border border-status-error/30 rounded-lg p-4">
        <h4 className="text-sm font-bold text-status-error mb-2">Danger Zone</h4>
        <p className="text-xs text-secondary mb-4">
          Deactivating your account is permanent and cannot be undone. All your sessions will be
          invalidated and you will not be able to log in again.
        </p>

        {!showDeactivateConfirm ? (
          <button
            type="button"
            onClick={() => onShowDeactivateConfirm(true)}
            className="px-4 py-2 text-sm text-status-error border border-status-error/30 hover:bg-status-error/10 rounded-lg transition-colors"
          >
            Deactivate Account
          </button>
        ) : (
          <div className="space-y-3 max-w-sm">
            <div className="p-3 bg-status-error/10 border border-status-error/20 rounded-lg">
              <p className="text-xs text-status-error font-medium">
                This action is permanent and cannot be undone.
              </p>
            </div>

            <div>
              <label className="block text-xs font-medium text-muted mb-1">
                Confirm your password
              </label>
              <input
                type="password"
                value={deactivatePassword}
                onChange={(e) => onDeactivatePasswordChange(e.target.value)}
                className="w-full px-3 py-2 bg-surface-2 border border-border rounded-lg text-sm text-primary focus:outline-none focus:border-status-error"
                placeholder="Enter your password"
              />
            </div>

            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={eraseData}
                onChange={(e) => onEraseDataChange(e.target.checked)}
                className="w-4 h-4 rounded border-border bg-surface-2 text-status-error focus:ring-status-error"
              />
              <span className="text-xs text-secondary">
                Request that all my data be erased (GDPR)
              </span>
            </label>

            {deactivateError && <p className="text-sm text-status-error">{deactivateError}</p>}

            <div className="flex gap-2">
              <button
                type="button"
                onClick={onDeactivateAccount}
                disabled={deactivating || !deactivatePassword}
                className="px-4 py-2 text-sm font-medium text-primary bg-status-error hover:bg-red-600 disabled:opacity-50 rounded-lg transition-colors"
              >
                {deactivating ? "Deactivating..." : "Confirm Deactivation"}
              </button>
              <button
                type="button"
                onClick={() => {
                  onShowDeactivateConfirm(false);
                  onDeactivatePasswordChange("");
                  onEraseDataChange(false);
                }}
                className="px-4 py-2 text-sm text-secondary hover:text-primary transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Sessions                                                            */
/* ------------------------------------------------------------------ */

function SessionsSection({
  client,
  devices,
  setDevices,
  loading,
  error,
  currentDeviceId,
  deletingDevice,
  onDeleteDevice,
  onDeleteAllOther,
}: {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  client: any;
  devices: DeviceInfo[];
  setDevices: React.Dispatch<React.SetStateAction<DeviceInfo[]>>;
  loading: boolean;
  error: string;
  currentDeviceId: string;
  deletingDevice: string | null;
  onDeleteDevice: (deviceId: string) => void;
  onDeleteAllOther: () => void;
}): React.ReactElement {
  const otherDevices = devices.filter((d) => d.device_id !== currentDeviceId);
  const [editingDeviceId, setEditingDeviceId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [renameSaving, setRenameSaving] = useState(false);

  const handleStartRename = (deviceId: string, currentName: string): void => {
    setEditingDeviceId(deviceId);
    setEditName(currentName);
  };

  const handleCancelRename = (): void => {
    setEditingDeviceId(null);
    setEditName("");
  };

  const handleSaveRename = async (deviceId: string): Promise<void> => {
    const trimmed = editName.trim();
    if (!trimmed) return;
    setRenameSaving(true);
    try {
      await client.setDeviceDetails(deviceId, { display_name: trimmed });
      setDevices((prev: DeviceInfo[]) =>
        prev.map((d) => (d.device_id === deviceId ? { ...d, display_name: trimmed } : d)),
      );
      setEditingDeviceId(null);
      setEditName("");
    } catch {
      // best-effort
    } finally {
      setRenameSaving(false);
    }
  };

  return (
    <div>
      <h3 className="text-lg font-bold text-primary mb-4">Sessions</h3>

      {loading && (
        <div className="flex items-center gap-2 text-sm text-muted">
          <div className="w-4 h-4 border-2 border-accent border-t-transparent rounded-full animate-spin" />
          Loading devices...
        </div>
      )}

      {error && <p className="text-sm text-status-error mb-4">{error}</p>}

      {!loading && devices.length > 0 && (
        <>
          <div className="space-y-2 mb-4">
            {devices.map((device) => {
              const isCurrent = device.device_id === currentDeviceId;
              const isEditing = editingDeviceId === device.device_id;
              return (
                <div
                  key={device.device_id}
                  className={`p-3 rounded-lg border transition-colors ${
                    isCurrent ? "bg-accent/10 border-accent/30" : "bg-surface-2 border-border"
                  }`}
                >
                  <div className="flex items-start justify-between">
                    <div className="min-w-0 flex-1">
                      {isEditing ? (
                        <div className="flex items-center gap-2 mb-1">
                          <input
                            type="text"
                            value={editName}
                            onChange={(e) => setEditName(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === "Enter") {
                                e.preventDefault();
                                handleSaveRename(device.device_id);
                              }
                              if (e.key === "Escape") {
                                handleCancelRename();
                              }
                            }}
                            className="flex-1 px-2 py-1 bg-surface-1 border border-border rounded text-sm text-primary focus:outline-none focus:border-accent"
                            autoFocus
                          />
                          <button
                            onClick={() => handleSaveRename(device.device_id)}
                            disabled={renameSaving || !editName.trim()}
                            className="px-2 py-1 text-xs bg-accent hover:bg-accent-hover text-inverse rounded disabled:opacity-50 transition-colors"
                          >
                            {renameSaving ? "..." : "Save"}
                          </button>
                          <button
                            onClick={handleCancelRename}
                            className="px-2 py-1 text-xs text-secondary hover:text-primary transition-colors"
                          >
                            Cancel
                          </button>
                        </div>
                      ) : (
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-medium text-primary">
                            {device.display_name || device.device_id}
                          </span>
                          {isCurrent && (
                            <span className="px-1.5 py-0.5 text-[10px] font-semibold bg-accent/20 text-accent rounded">
                              Current
                            </span>
                          )}
                          <button
                            onClick={() =>
                              handleStartRename(
                                device.device_id,
                                device.display_name || device.device_id,
                              )
                            }
                            className="p-0.5 text-faint hover:text-secondary transition-colors"
                            title="Rename session"
                          >
                            <svg
                              className="w-3.5 h-3.5"
                              fill="none"
                              viewBox="0 0 24 24"
                              stroke="currentColor"
                              strokeWidth={2}
                            >
                              <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L6.832 19.82a4.5 4.5 0 01-1.897 1.13l-2.685.8.8-2.685a4.5 4.5 0 011.13-1.897L16.863 4.487zm0 0L19.5 7.125"
                              />
                            </svg>
                          </button>
                        </div>
                      )}
                      <p className="text-xs text-muted mt-0.5">ID: {device.device_id}</p>
                      {device.last_seen_ip && (
                        <p className="text-xs text-muted">IP: {device.last_seen_ip}</p>
                      )}
                      {device.last_seen_ts && (
                        <p className="text-xs text-muted">
                          Last seen: {new Date(device.last_seen_ts).toLocaleString()}
                        </p>
                      )}
                    </div>
                    {!isCurrent && (
                      <button
                        onClick={() => onDeleteDevice(device.device_id)}
                        disabled={deletingDevice === device.device_id}
                        className="px-3 py-1 text-xs text-status-error hover:bg-status-error/10 rounded transition-colors disabled:opacity-50 flex-shrink-0"
                      >
                        {deletingDevice === device.device_id ? "..." : "Sign out"}
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {otherDevices.length > 0 && (
            <button
              onClick={onDeleteAllOther}
              className="px-4 py-2 text-sm text-status-error border border-status-error/30 hover:bg-status-error/10 rounded-lg transition-colors"
            >
              Sign out all other devices
            </button>
          )}
        </>
      )}

      {!loading && !error && devices.length === 0 && (
        <p className="text-sm text-muted">No devices found.</p>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Notifications                                                       */
/* ------------------------------------------------------------------ */

function NotificationsSection({
  client,
  settings,
  onUpdate,
}: {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  client: any;
  settings: AppSettings;
  onUpdate: (partial: Partial<AppSettings>) => void;
}): React.ReactElement {
  // Custom keyword state
  const [keywords, setKeywords] = useState<KeywordRule[]>([]);
  const [newKeyword, setNewKeyword] = useState("");
  const [keywordLoading, setKeywordLoading] = useState(false);

  // Load keyword rules on mount
  useEffect(() => {
    try {
      const rules = getKeywordRules(client);
      setKeywords(rules);
    } catch {
      // best-effort
    }
  }, [client]);

  const handleAddKeyword = async (): Promise<void> => {
    const kw = newKeyword.trim();
    if (!kw) return;
    setKeywordLoading(true);
    try {
      await addKeywordRule(client, kw);
      setKeywords((prev) => [
        ...prev,
        { ruleId: `rocks.openclaw.keyword.${kw}`, keyword: kw, enabled: true },
      ]);
      setNewKeyword("");
    } catch {
      // best-effort
    } finally {
      setKeywordLoading(false);
    }
  };

  const handleRemoveKeyword = async (keyword: string): Promise<void> => {
    try {
      await removeKeywordRule(client, keyword);
      setKeywords((prev) => prev.filter((k) => k.keyword !== keyword));
    } catch {
      // best-effort
    }
  };

  // Wire email toggle to push rules
  const handleEmailToggle = async (enabled: boolean): Promise<void> => {
    onUpdate({ emailNotifications: enabled });
    try {
      await setEmailNotificationRule(client, enabled);
    } catch {
      // best-effort — push rules API may not be available
    }
  };

  return (
    <div>
      <h3 className="text-lg font-bold text-primary mb-4">Notifications</h3>

      <div className="space-y-4">
        <label className="flex items-center gap-3 cursor-pointer">
          <input
            type="checkbox"
            checked={settings.notificationsEnabled}
            onChange={(e) => onUpdate({ notificationsEnabled: e.target.checked })}
            className="w-4 h-4 rounded border-border bg-surface-2 text-accent focus:ring-accent"
          />
          <div>
            <span className="text-sm font-medium text-primary">Desktop Notifications</span>
            <p className="text-xs text-muted">Show desktop notifications for new messages</p>
          </div>
        </label>

        <label className="flex items-center gap-3 cursor-pointer">
          <input
            type="checkbox"
            checked={settings.soundEnabled}
            onChange={(e) => onUpdate({ soundEnabled: e.target.checked })}
            className="w-4 h-4 rounded border-border bg-surface-2 text-accent focus:ring-accent"
          />
          <div>
            <span className="text-sm font-medium text-primary">Sound</span>
            <p className="text-xs text-muted">Play a sound for new messages</p>
          </div>
        </label>

        <label className="flex items-center gap-3 cursor-pointer">
          <input
            type="checkbox"
            checked={settings.notificationPreview}
            onChange={(e) => onUpdate({ notificationPreview: e.target.checked })}
            className="w-4 h-4 rounded border-border bg-surface-2 text-accent focus:ring-accent"
          />
          <div>
            <span className="text-sm font-medium text-primary">Show Preview</span>
            <p className="text-xs text-muted">Show message content in notification previews</p>
          </div>
        </label>
      </div>

      {/* Custom Keywords */}
      <div className="h-px bg-border my-6" />
      <h4 className="text-sm font-bold text-primary mb-3">Custom Keywords</h4>
      <p className="text-xs text-muted mb-3">Get notified when messages contain these keywords.</p>
      <div className="flex gap-2 mb-3 max-w-sm">
        <input
          type="text"
          value={newKeyword}
          onChange={(e) => setNewKeyword(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              handleAddKeyword();
            }
          }}
          className="flex-1 px-3 py-2 bg-surface-2 border border-border rounded-lg text-sm text-primary placeholder-muted focus:outline-none focus:border-accent"
          placeholder="Enter a keyword..."
        />
        <button
          onClick={handleAddKeyword}
          disabled={keywordLoading || !newKeyword.trim()}
          className="px-4 py-2 bg-accent hover:bg-accent-hover disabled:opacity-50 text-inverse text-sm font-medium rounded-lg transition-colors"
        >
          Add
        </button>
      </div>
      {keywords.length > 0 && (
        <div className="flex flex-wrap gap-2 mb-4">
          {keywords.map((kw) => (
            <span
              key={kw.ruleId}
              className="inline-flex items-center gap-1 px-2.5 py-1 bg-surface-2 border border-border rounded-full text-xs text-secondary"
            >
              {kw.keyword}
              <button
                onClick={() => handleRemoveKeyword(kw.keyword)}
                className="p-0.5 text-muted hover:text-primary transition-colors"
                title={`Remove keyword: ${kw.keyword}`}
              >
                <svg
                  className="w-3 h-3"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={2}
                >
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </span>
          ))}
        </div>
      )}

      {/* Email Notifications */}
      <div className="h-px bg-border my-6" />
      <h4 className="text-sm font-bold text-primary mb-3">Email Notifications</h4>
      <div className="space-y-4">
        <label className="flex items-center gap-3 cursor-pointer">
          <input
            type="checkbox"
            checked={settings.emailNotifications}
            onChange={(e) => handleEmailToggle(e.target.checked)}
            className="w-4 h-4 rounded border-border bg-surface-2 text-accent focus:ring-accent"
          />
          <div>
            <span className="text-sm font-medium text-primary">Email Notifications</span>
            <p className="text-xs text-muted">Receive email notifications for missed messages</p>
          </div>
        </label>
        <p className="text-xs text-faint">
          When enabled, configures Matrix push rules to deliver email notifications.
        </p>
      </div>

      {/* Push Notifications */}
      <PushNotificationsSubsection client={client} />
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Push Notifications Subsection                                       */
/* ------------------------------------------------------------------ */

/** Placeholder VAPID key — replace with the real key from your push gateway */
const VAPID_PUBLIC_KEY =
  "BEl62iUYgUivxIkv69yViEuiBIa-Ib9-SkvMeAtA3LFgDzkGs-GDq6QAKo6R6TqpBbHdCd-rbf7G7ylp1t-8jXY";

function PushNotificationsSubsection({
  client,
}: {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  client: any;
}): React.ReactElement {
  const [pushEnabled, setPushEnabled] = useState(false);
  const [pushLoading, setPushLoading] = useState(false);
  const [pushError, setPushError] = useState<string | null>(null);
  const [pushers, setPushers] = useState<Pusher[]>([]);
  const [loadingPushers, setLoadingPushers] = useState(true);

  const supported = isPushNotificationSupported() && isPushSupported();

  // Load existing pushers on mount
  useEffect(() => {
    if (!client) {
      setLoadingPushers(false);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const list = await getPushers(client);
        if (!cancelled) {
          setPushers(list);
          const hasOurPusher = list.some((p) => p.app_id === PUSH_APP_ID);
          setPushEnabled(hasOurPusher);
        }
      } catch {
        // best-effort
      } finally {
        if (!cancelled) setLoadingPushers(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [client]);

  const handleEnable = async (): Promise<void> => {
    setPushLoading(true);
    setPushError(null);
    try {
      // 1. Request notification permission
      if (typeof Notification !== "undefined" && Notification.permission !== "granted") {
        const result = await Notification.requestPermission();
        if (result !== "granted") {
          setPushError("Notification permission denied by browser.");
          return;
        }
      }

      // 2. Register service worker
      const registration = await registerServiceWorker();
      if (!registration) {
        setPushError("Service Worker registration failed.");
        return;
      }

      // 3. Subscribe to push
      const subscription = await subscribeToPush(registration, VAPID_PUBLIC_KEY);
      if (!subscription) {
        setPushError("Push subscription failed.");
        return;
      }

      // 4. Register pusher with homeserver
      const pushKey = subscription.endpoint;
      const deviceId: string =
        typeof client.getDeviceId === "function" ? (client.getDeviceId() ?? "unknown") : "unknown";
      const pusherData = buildPusherData(
        PUSH_APP_ID,
        pushKey,
        "AgentOS",
        deviceId,
        `profile_${deviceId}`,
      );

      await registerPusher(client, pusherData);

      setPushEnabled(true);
      // Refresh pushers list
      const list = await getPushers(client);
      setPushers(list);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Failed to enable push notifications.";
      setPushError(message);
    } finally {
      setPushLoading(false);
    }
  };

  const handleDisable = async (): Promise<void> => {
    setPushLoading(true);
    setPushError(null);
    try {
      const ourPushers = pushers.filter((p) => p.app_id === PUSH_APP_ID);
      for (const p of ourPushers) {
        await unregisterPusher(client, p);
      }
      setPushEnabled(false);
      const list = await getPushers(client);
      setPushers(list);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Failed to disable push notifications.";
      setPushError(message);
    } finally {
      setPushLoading(false);
    }
  };

  const handleRemovePusher = async (pusher: Pusher): Promise<void> => {
    try {
      await unregisterPusher(client, pusher);
      const list = await getPushers(client);
      setPushers(list);
      const hasOurPusher = list.some((p) => p.app_id === PUSH_APP_ID);
      setPushEnabled(hasOurPusher);
    } catch {
      // best-effort
    }
  };

  if (!supported) {
    return (
      <>
        <div className="h-px bg-border my-6" />
        <h4 className="text-sm font-bold text-primary mb-3">Push Notifications</h4>
        <p className="text-xs text-muted">Push notifications are not supported on this platform.</p>
      </>
    );
  }

  return (
    <>
      <div className="h-px bg-border my-6" />
      <h4 className="text-sm font-bold text-primary mb-3">Push Notifications</h4>

      <div className="space-y-4">
        {/* Status */}
        <div className="flex items-center gap-2">
          <span
            className={`inline-block w-2 h-2 rounded-full ${pushEnabled ? "bg-green-500" : "bg-surface-4"}`}
          />
          <span className="text-sm text-secondary">
            {loadingPushers ? "Loading..." : pushEnabled ? "Registered" : "Not registered"}
          </span>
        </div>

        {/* Enable / Disable button */}
        {pushEnabled ? (
          <button
            onClick={handleDisable}
            disabled={pushLoading}
            className="px-4 py-2 bg-red-600 hover:bg-red-700 disabled:opacity-50 text-inverse text-sm font-medium rounded-lg transition-colors"
          >
            {pushLoading ? "Disabling..." : "Disable Push Notifications"}
          </button>
        ) : (
          <button
            onClick={handleEnable}
            disabled={pushLoading}
            className="px-4 py-2 bg-accent hover:bg-accent-hover disabled:opacity-50 text-inverse text-sm font-medium rounded-lg transition-colors"
          >
            {pushLoading ? "Enabling..." : "Enable Push Notifications"}
          </button>
        )}

        {/* Error */}
        {pushError && <p className="text-xs text-red-400">{pushError}</p>}

        {/* Registered pushers list */}
        {pushers.length > 0 && (
          <div className="mt-4">
            <h5 className="text-xs font-semibold text-muted uppercase tracking-wider mb-2">
              Registered Pushers
            </h5>
            <div className="space-y-2">
              {pushers.map((p, index) => (
                <div
                  key={`${p.app_id}-${p.pushkey}-${index}`}
                  className="flex items-center justify-between bg-surface-2 border border-border rounded-lg px-3 py-2"
                >
                  <div className="min-w-0 flex-1">
                    <p className="text-sm text-primary truncate">{p.app_display_name}</p>
                    <p className="text-xs text-muted truncate">
                      {p.device_display_name} &middot; {p.app_id}
                    </p>
                  </div>
                  <button
                    onClick={() => handleRemovePusher(p)}
                    className="ml-2 p-1 text-muted hover:text-red-400 transition-colors"
                    title="Remove pusher"
                  >
                    <svg
                      className="w-4 h-4"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                      strokeWidth={2}
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        <p className="text-xs text-faint">
          Push notifications deliver messages to your device even when the app is closed. The
          homeserver sends notifications through a push gateway.
        </p>
      </div>
    </>
  );
}

/* ------------------------------------------------------------------ */
/* Toggle                                                              */
/* ------------------------------------------------------------------ */

function Toggle({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
}): React.ReactElement {
  return (
    <label className="flex items-center justify-between py-2">
      <span className="text-sm text-text-secondary">{label}</span>
      <button
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={`relative w-10 h-5 rounded-full transition-colors ${checked ? "bg-accent" : "bg-surface-3"}`}
      >
        <span
          className={`absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full transition-transform ${checked ? "translate-x-5" : ""}`}
        />
      </button>
    </label>
  );
}

/* ------------------------------------------------------------------ */
/* Preferences                                                         */
/* ------------------------------------------------------------------ */

function PreferencesSection({
  settings,
  onUpdate,
}: {
  settings: AppSettings;
  onUpdate: (partial: Partial<AppSettings>) => void;
}): React.ReactElement {
  return (
    <div>
      <h3 className="text-lg font-bold text-primary mb-4">Preferences</h3>

      {/* Timeline */}
      <div className="mb-6">
        <h4 className="text-xs font-semibold text-muted uppercase tracking-wider mb-2">Timeline</h4>
        <Toggle
          label="Show join/leave events"
          checked={settings.showJoinLeaveEvents}
          onChange={(v) => onUpdate({ showJoinLeaveEvents: v })}
        />
        <Toggle
          label="Show avatar changes"
          checked={settings.showAvatarChanges}
          onChange={(v) => onUpdate({ showAvatarChanges: v })}
        />
        <Toggle
          label="Show display name changes"
          checked={settings.showDisplayNameChanges}
          onChange={(v) => onUpdate({ showDisplayNameChanges: v })}
        />
      </div>

      {/* Read Receipts */}
      <div className="mb-6">
        <h4 className="text-xs font-semibold text-muted uppercase tracking-wider mb-2">
          Read Receipts
        </h4>
        <Toggle
          label="Send read receipts"
          checked={settings.sendReadReceipts}
          onChange={(v) => onUpdate({ sendReadReceipts: v })}
        />
        <Toggle
          label="Show read receipts from others"
          checked={settings.showReadReceipts}
          onChange={(v) => onUpdate({ showReadReceipts: v })}
        />
      </div>

      {/* Typing */}
      <div className="mb-6">
        <h4 className="text-xs font-semibold text-muted uppercase tracking-wider mb-2">Typing</h4>
        <Toggle
          label="Send typing notifications"
          checked={settings.sendTypingNotifications}
          onChange={(v) => onUpdate({ sendTypingNotifications: v })}
        />
        <Toggle
          label="Show typing notifications"
          checked={settings.showTypingNotifications}
          onChange={(v) => onUpdate({ showTypingNotifications: v })}
        />
      </div>

      {/* Timestamps */}
      <div className="mb-6">
        <h4 className="text-xs font-semibold text-muted uppercase tracking-wider mb-2">
          Timestamps
        </h4>
        <Toggle
          label="Use 24-hour format"
          checked={settings.use24HourTime}
          onChange={(v) => onUpdate({ use24HourTime: v })}
        />
        <Toggle
          label="Show seconds"
          checked={settings.showSeconds}
          onChange={(v) => onUpdate({ showSeconds: v })}
        />
      </div>

      {/* Composer */}
      <div className="mb-6">
        <h4 className="text-xs font-semibold text-muted uppercase tracking-wider mb-2">Composer</h4>
        <Toggle
          label="Enter to send (otherwise Ctrl+Enter)"
          checked={settings.enterToSend}
          onChange={(v) => onUpdate({ enterToSend: v })}
        />
      </div>

      {/* Content */}
      <div className="mb-6">
        <h4 className="text-xs font-semibold text-muted uppercase tracking-wider mb-2">Content</h4>
        <Toggle
          label="Show URL previews"
          checked={settings.showUrlPreviews}
          onChange={(v) => onUpdate({ showUrlPreviews: v })}
        />
        <Toggle
          label="Big emoji for emoji-only messages"
          checked={settings.bigEmoji}
          onChange={(v) => onUpdate({ bigEmoji: v })}
        />
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Keyboard Shortcuts                                                  */
/* ------------------------------------------------------------------ */

function ShortcutsSection(): React.ReactElement {
  const shortcuts: Array<{ keys: string; description: string }> = [
    { keys: "Cmd+K", description: "Quick switcher" },
    { keys: "Enter", description: "Send message" },
    { keys: "Shift+Enter", description: "New line" },
    { keys: "Escape", description: "Close panels" },
    { keys: "Arrow Up / Down", description: "Navigate in quick switcher" },
    { keys: "Up Arrow (empty input)", description: "Edit last message" },
  ];

  return (
    <div>
      <h3 className="text-lg font-bold text-primary mb-4">Keyboard Shortcuts</h3>

      <div className="space-y-1">
        {shortcuts.map((shortcut) => (
          <div
            key={shortcut.keys}
            className="flex items-center justify-between py-2 px-3 rounded-lg hover:bg-surface-2 transition-colors"
          >
            <span className="text-sm text-secondary">{shortcut.description}</span>
            <kbd className="px-2 py-1 text-xs font-mono bg-surface-3 text-muted border border-border rounded">
              {shortcut.keys}
            </kbd>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* About                                                               */
/* ------------------------------------------------------------------ */

function AboutSection(): React.ReactElement {
  return (
    <div>
      <h3 className="text-lg font-bold text-primary mb-4">About</h3>

      <div className="space-y-3">
        <div>
          <span className="text-sm text-muted">Application</span>
          <p className="text-sm font-medium text-primary">AgentOS</p>
        </div>

        <div>
          <span className="text-sm text-muted">Version</span>
          <p className="text-sm font-medium text-primary">0.1.0</p>
        </div>

        <div>
          <span className="text-sm text-muted">Protocol</span>
          <p className="text-sm font-medium text-primary">Built on the Matrix protocol</p>
        </div>

        <div className="pt-2 flex items-center gap-4">
          <a
            href="https://github.com/openclaw-rocks/agentos"
            target="_blank"
            rel="noopener noreferrer"
            className="text-sm text-accent hover:text-accent-hover transition-colors underline"
          >
            View source code
          </a>
          <button
            onClick={() => {
              window.dispatchEvent(new CustomEvent("openclaw:open-bugreport"));
            }}
            className="px-3 py-1.5 text-sm bg-surface-2 hover:bg-surface-3 text-secondary hover:text-primary rounded-lg transition-colors"
          >
            Report Bug
          </button>
        </div>
      </div>
    </div>
  );
}
