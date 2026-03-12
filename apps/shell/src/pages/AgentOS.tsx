import React, { useCallback, useEffect, useRef, useState } from "react";
import { AgentPanel } from "~/components/AgentPanel";
import { BugReportModal } from "~/components/BugReportModal";
import { CallView } from "~/components/CallView";
import { CanvasView } from "~/components/CanvasView";
import { ChannelList } from "~/components/ChannelList";
import { ChatView } from "~/components/ChatView";
import { CreateChannelModal } from "~/components/CreateChannelModal";
import { CreateSpaceModal } from "~/components/CreateSpaceModal";
import { DevTools } from "~/components/DevTools";
import { EmptyState } from "~/components/EmptyState";
import { FocusView } from "~/components/FocusView";
import { GroupCallView } from "~/components/GroupCallView";
import { IntegrationManager } from "~/components/IntegrationManager";
import { KeyboardShortcutsOverlay } from "~/components/KeyboardShortcutsOverlay";
import { MessageSearch } from "~/components/MessageSearch";
import { MobileNav } from "~/components/MobileNav";
import { NewDMModal } from "~/components/NewDMModal";
import { NotificationPanel, useTotalHighlightCount } from "~/components/NotificationPanel";
import { ProfileSettings } from "~/components/ProfileSettings";
import { QuickSwitcher } from "~/components/QuickSwitcher";
import { loadRecentRooms, saveRecentRooms, addRecentRoom } from "~/components/RoomBreadcrumbs";
import { RoomDirectory } from "~/components/RoomDirectory";
import { SettingsPanel } from "~/components/SettingsPanel";
import { SpaceHierarchy } from "~/components/SpaceHierarchy";
import { SpaceRail } from "~/components/SpaceRail";
import { SpaceSettingsPanel } from "~/components/SpaceSettingsPanel";
import { ThreadListPanel } from "~/components/ThreadListPanel";
import { ThreadPanel } from "~/components/ThreadPanel";
import { ViewModeToggle, type ViewMode } from "~/components/ViewModeToggle";
import { WelcomeBanner } from "~/components/WelcomeBanner";
import { WidgetPanel } from "~/components/WidgetPanel";
import { GroupCall } from "~/lib/group-call";
import type { GroupCallType } from "~/lib/group-call";
import { useMatrix } from "~/lib/matrix-context";
import { getAdjacentRoomId } from "~/lib/room-filters";
import { WebRTCCall } from "~/lib/webrtc-call";
import type { CallType } from "~/lib/webrtc-call";

const WELCOME_DISMISSED_KEY = "openclaw:welcome-dismissed";

function useIsMobile(): boolean {
  const [isMobile, setIsMobile] = useState(() => window.innerWidth < 640);

  useEffect(() => {
    const mql = window.matchMedia("(max-width: 639px)");
    const handler = (e: MediaQueryListEvent) => setIsMobile(e.matches);
    mql.addEventListener("change", handler);
    return () => mql.removeEventListener("change", handler);
  }, []);

  return isMobile;
}

export function AgentOS() {
  const { ready, logout, client } = useMatrix();
  const isMobile = useIsMobile();

  const [selectedSpaceId, setSelectedSpaceId] = useState<string | null>(null);
  const [selectedRoomId, setSelectedRoomId] = useState<string | null>(null);
  const [activeThreadId, setActiveThreadId] = useState<string | null>(null);
  const [showAgentPanel, setShowAgentPanel] = useState(false);
  const [showCreateSpace, setShowCreateSpace] = useState(false);
  const [showCreateChannel, setShowCreateChannel] = useState(false);
  const [showNewDM, setShowNewDM] = useState(false);
  const [showQuickSwitcher, setShowQuickSwitcher] = useState(false);
  const [showProfileSettings, setShowProfileSettings] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [showRoomDirectory, setShowRoomDirectory] = useState(false);
  const [showSearch, setShowSearch] = useState(false);
  const [showThreadList, setShowThreadList] = useState(false);
  const [showSpaceSettings, setShowSpaceSettings] = useState(false);
  const [showSpaceHierarchy, setShowSpaceHierarchy] = useState(false);
  const [showKeyboardShortcuts, setShowKeyboardShortcuts] = useState(false);
  const [showDevTools, setShowDevTools] = useState(false);
  const [showNotifications, setShowNotifications] = useState(false);
  const [showWidgetPanel, setShowWidgetPanel] = useState(false);
  const [showIntegrationManager, setShowIntegrationManager] = useState(false);
  const [showBugReport, setShowBugReport] = useState(false);

  // Recent rooms for breadcrumbs
  const [recentRooms, setRecentRooms] = useState<string[]>(loadRecentRooms);

  // Total highlight count for notification bell badge
  const totalHighlights = useTotalHighlightCount();

  // Ref to trigger file upload from keyboard shortcut
  const fileUploadTriggerRef = useRef<(() => void) | null>(null);

  // 1:1 call state
  const callManagerRef = useRef<WebRTCCall | null>(null);
  const [activeCallRoomId, setActiveCallRoomId] = useState<string | null>(null);

  // Group call state
  const groupCallRef = useRef<GroupCall | null>(null);
  const [activeGroupCallRoomId, setActiveGroupCallRoomId] = useState<string | null>(null);
  const [activeGroupCallType, setActiveGroupCallType] = useState<GroupCallType>("video");

  // Initialize call manager when client is ready
  useEffect(() => {
    if (!ready || !client) return;
    const mgr = new WebRTCCall(client);
    callManagerRef.current = mgr;
    return () => {
      mgr.destroy();
      callManagerRef.current = null;
    };
  }, [ready, client]);

  const handleStartCall = useCallback((roomId: string, type: CallType) => {
    const mgr = callManagerRef.current;
    if (!mgr) return;
    mgr.startCall(roomId, type).catch((err) => {
      console.error("[AgentOS] Failed to start call:", err);
    });
    setActiveCallRoomId(roomId);
  }, []);

  const handleCloseCall = useCallback(() => {
    setActiveCallRoomId(null);
  }, []);

  const handleStartGroupCall = useCallback(
    (roomId: string, type: GroupCallType) => {
      if (!client) return;
      const gc = new GroupCall(client);
      groupCallRef.current = gc;
      // Do NOT call gc.join() here — the pre-join screen in GroupCallView
      // will call joinWithDevices() once the user confirms device selection.
      setActiveGroupCallType(type);
      setActiveGroupCallRoomId(roomId);
    },
    [client],
  );

  const handleLeaveGroupCall = useCallback(() => {
    groupCallRef.current?.destroy();
    groupCallRef.current = null;
    setActiveGroupCallRoomId(null);
  }, []);

  // View mode per space (keyed by spaceId, null key = home)
  const [viewModes, setViewModes] = useState<Record<string, ViewMode>>({});
  const currentViewMode = viewModes[selectedSpaceId ?? "__home__"] ?? "stream";

  const setViewMode = useCallback(
    (mode: ViewMode) => {
      setViewModes((prev) => ({
        ...prev,
        [selectedSpaceId ?? "__home__"]: mode,
      }));
    },
    [selectedSpaceId],
  );

  // Mobile: show sidebar or chat
  const [mobileShowSidebar, setMobileShowSidebar] = useState(true);

  // Welcome banner dismissed state
  const [welcomeDismissed, setWelcomeDismissed] = useState(() => {
    try {
      return localStorage.getItem(WELCOME_DISMISSED_KEY) === "true";
    } catch {
      return false;
    }
  });

  const handleDismissWelcome = useCallback(() => {
    setWelcomeDismissed(true);
    try {
      localStorage.setItem(WELCOME_DISMISSED_KEY, "true");
    } catch {
      // Ignore storage errors
    }
  }, []);

  // Listen for /devtools slash command custom event
  useEffect(() => {
    const handleOpenDevTools = () => setShowDevTools(true);
    window.addEventListener("openclaw:open-devtools", handleOpenDevTools);
    return () => window.removeEventListener("openclaw:open-devtools", handleOpenDevTools);
  }, []);

  // Listen for /rageshake slash command custom event
  useEffect(() => {
    const handleOpenBugReport = () => setShowBugReport(true);
    window.addEventListener("openclaw:open-bugreport", handleOpenBugReport);
    return () => window.removeEventListener("openclaw:open-bugreport", handleOpenBugReport);
  }, []);

  // Track visible room IDs from ChannelList for Alt+Up/Down navigation
  const visibleRoomIdsRef = useRef<string[]>([]);
  const handleVisibleRoomIdsChange = useCallback((roomIds: string[]) => {
    visibleRoomIdsRef.current = roomIds;
  }, []);

  // Navigate rooms up/down via Alt+Arrow keys using the visible room list
  const navigateRooms = useCallback(
    (direction: "up" | "down") => {
      const nextRoomId = getAdjacentRoomId(visibleRoomIdsRef.current, selectedRoomId, direction);
      if (nextRoomId) {
        setSelectedRoomId(nextRoomId);
      }
    },
    [selectedRoomId],
  );

  // Global keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Cmd+K / Ctrl+K — toggle quick switcher
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setShowQuickSwitcher((prev) => !prev);
      }
      // Cmd+F / Ctrl+F — toggle search
      if ((e.metaKey || e.ctrlKey) && e.key === "f") {
        e.preventDefault();
        setShowSearch((prev) => !prev);
      }
      // Cmd+/ or Ctrl+/ — toggle keyboard shortcuts overlay
      if ((e.metaKey || e.ctrlKey) && e.key === "/") {
        e.preventDefault();
        setShowKeyboardShortcuts((prev) => !prev);
      }
      // Alt+ArrowUp — select previous room in channel list
      if (e.altKey && e.key === "ArrowUp") {
        e.preventDefault();
        navigateRooms("up");
      }
      // Alt+ArrowDown — select next room in channel list
      if (e.altKey && e.key === "ArrowDown") {
        e.preventDefault();
        navigateRooms("down");
      }
      // Ctrl+Shift+U — trigger file upload
      if (e.ctrlKey && e.shiftKey && e.key === "U") {
        e.preventDefault();
        fileUploadTriggerRef.current?.();
      }
      // Escape — close any open panel/modal
      if (e.key === "Escape") {
        if (showBugReport) {
          setShowBugReport(false);
        } else if (showIntegrationManager) {
          setShowIntegrationManager(false);
        } else if (showWidgetPanel) {
          setShowWidgetPanel(false);
        } else if (showDevTools) {
          setShowDevTools(false);
        } else if (showKeyboardShortcuts) {
          setShowKeyboardShortcuts(false);
        } else if (showQuickSwitcher) {
          setShowQuickSwitcher(false);
        } else if (showSearch) {
          setShowSearch(false);
        } else if (activeThreadId) {
          setActiveThreadId(null);
        } else if (showThreadList) {
          setShowThreadList(false);
        } else if (showAgentPanel) {
          setShowAgentPanel(false);
        } else if (showSettings) {
          setShowSettings(false);
        } else if (showProfileSettings) {
          setShowProfileSettings(false);
        } else if (showSpaceSettings) {
          setShowSpaceSettings(false);
        } else if (showSpaceHierarchy) {
          setShowSpaceHierarchy(false);
        } else if (showRoomDirectory) {
          setShowRoomDirectory(false);
        } else if (showCreateSpace) {
          setShowCreateSpace(false);
        } else if (showCreateChannel) {
          setShowCreateChannel(false);
        } else if (showNewDM) {
          setShowNewDM(false);
        }
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [
    showBugReport,
    showIntegrationManager,
    showWidgetPanel,
    showDevTools,
    showKeyboardShortcuts,
    showQuickSwitcher,
    showSearch,
    activeThreadId,
    showThreadList,
    showAgentPanel,
    showSettings,
    showProfileSettings,
    showSpaceSettings,
    showSpaceHierarchy,
    showRoomDirectory,
    showCreateSpace,
    showCreateChannel,
    showNewDM,
    navigateRooms,
  ]);

  const handleSelectSpace = useCallback((id: string | null) => {
    setSelectedSpaceId(id);
    setSelectedRoomId(null);
    setActiveThreadId(null);
  }, []);

  const handleSelectRoom = useCallback(
    (id: string) => {
      setSelectedRoomId(id);
      setActiveThreadId(null);
      // Track recently visited rooms
      setRecentRooms((prev) => {
        const next = addRecentRoom(prev, id);
        saveRecentRooms(next);
        return next;
      });
      if (isMobile) {
        setMobileShowSidebar(false);
      }
    },
    [isMobile],
  );

  const handleMobileBack = useCallback(() => {
    setMobileShowSidebar(true);
  }, []);

  const handleLeaveRoom = useCallback(() => {
    setSelectedRoomId(null);
    setActiveThreadId(null);
  }, []);

  const handleLeaveSpace = useCallback(async () => {
    if (!selectedSpaceId) return;
    try {
      await client.leave(selectedSpaceId);
      setSelectedSpaceId(null);
      setSelectedRoomId(null);
      setShowSpaceSettings(false);
    } catch (err) {
      console.error("[AgentOS] Failed to leave space:", err);
    }
  }, [client, selectedSpaceId]);

  if (!ready) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-surface-0">
        <div className="text-center">
          <div className="w-8 h-8 border-2 border-accent border-t-transparent rounded-full animate-spin mx-auto mb-3" />
          <p className="text-sm text-secondary">Syncing with homeserver...</p>
        </div>
      </div>
    );
  }

  // Render the main content area based on view mode
  const renderMainContent = () => {
    if (!selectedRoomId) {
      return (
        <div className="flex-1 flex flex-col">
          {!welcomeDismissed && <WelcomeBanner onDismiss={handleDismissWelcome} />}
          <EmptyState />
        </div>
      );
    }

    switch (currentViewMode) {
      case "canvas":
        return <CanvasView roomId={selectedRoomId} />;
      case "focus":
        return <FocusView roomId={selectedRoomId} />;
      case "stream":
      default:
        return (
          <ChatView
            roomId={selectedRoomId}
            onOpenThread={setActiveThreadId}
            onToggleAgentPanel={() => setShowAgentPanel(!showAgentPanel)}
            onLeaveRoom={handleLeaveRoom}
            onOpenSearch={() => setShowSearch(true)}
            onOpenThreadList={() => setShowThreadList((prev) => !prev)}
            onStartCall={(type) => handleStartCall(selectedRoomId, type)}
            onStartGroupCall={(type) => handleStartGroupCall(selectedRoomId, type)}
            onNavigateRoom={(roomId) => setSelectedRoomId(roomId)}
            fileUploadTriggerRef={fileUploadTriggerRef}
          />
        );
    }
  };

  // Mobile layout
  if (isMobile) {
    return (
      <div className="h-screen flex flex-col bg-surface-0">
        {mobileShowSidebar ? (
          <>
            {/* Mobile sidebar: SpaceRail + ChannelList side by side */}
            <div className="flex-1 flex overflow-hidden">
              <SpaceRail
                selectedSpaceId={selectedSpaceId}
                onSelectSpace={handleSelectSpace}
                onCreateSpace={() => setShowCreateSpace(true)}
                onLogout={logout}
                onOpenProfileSettings={() => setShowProfileSettings(true)}
              />
              <ChannelList
                spaceId={selectedSpaceId}
                selectedRoomId={selectedRoomId}
                onSelectRoom={handleSelectRoom}
                onCreateChannel={() => setShowCreateChannel(true)}
                onNewDM={() => setShowNewDM(true)}
                onBrowseRooms={() => setShowRoomDirectory(true)}
                onOpenSpaceSettings={() => setShowSpaceSettings(true)}
                onExploreSpace={() => setShowSpaceHierarchy(true)}
                recentRooms={recentRooms}
                onVisibleRoomIdsChange={handleVisibleRoomIdsChange}
              />
            </div>

            {/* Bottom padding for MobileNav */}
            <div className="h-14" />
          </>
        ) : (
          <>
            {/* Mobile chat view with back button header */}
            <div className="flex-1 flex flex-col min-h-0">
              {/* Mobile header with back button and view toggle */}
              <div className="h-12 flex items-center gap-2 px-3 border-b border-border flex-shrink-0">
                <button
                  onClick={handleMobileBack}
                  className="p-1.5 text-secondary hover:text-primary hover:bg-surface-3 rounded-lg transition-colors"
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
                <div className="flex-1 min-w-0">
                  <ViewModeToggle mode={currentViewMode} onChange={setViewMode} />
                </div>
              </div>

              {renderMainContent()}
            </div>

            {/* Bottom padding for MobileNav */}
            <div className="h-14" />
          </>
        )}

        {/* Mobile bottom nav */}
        <MobileNav
          onShowSpaces={() => setMobileShowSidebar(true)}
          onShowSearch={() => setShowQuickSwitcher(true)}
          onShowSettings={() => setShowSettings(true)}
        />

        {/* Modals */}
        {showQuickSwitcher && (
          <QuickSwitcher
            onSelectSpace={handleSelectSpace}
            onSelectRoom={handleSelectRoom}
            onClose={() => setShowQuickSwitcher(false)}
          />
        )}
        {showSearch && (
          <MessageSearch
            roomId={selectedRoomId ?? undefined}
            onClose={() => setShowSearch(false)}
            onNavigateToMessage={(roomId, _eventId) => {
              setSelectedRoomId(roomId);
              setShowSearch(false);
              setMobileShowSidebar(false);
            }}
          />
        )}
        {showCreateSpace && (
          <CreateSpaceModal
            onClose={() => setShowCreateSpace(false)}
            onCreated={(spaceId) => {
              setShowCreateSpace(false);
              setSelectedSpaceId(spaceId);
              setSelectedRoomId(null);
            }}
          />
        )}
        {showCreateChannel && (
          <CreateChannelModal
            spaceId={selectedSpaceId}
            onClose={() => setShowCreateChannel(false)}
            onCreated={(roomId) => {
              setShowCreateChannel(false);
              setSelectedRoomId(roomId);
              setMobileShowSidebar(false);
            }}
          />
        )}
        {showNewDM && (
          <NewDMModal
            onClose={() => setShowNewDM(false)}
            onCreated={(roomId) => {
              setShowNewDM(false);
              setSelectedRoomId(roomId);
              setMobileShowSidebar(false);
            }}
          />
        )}
        {showProfileSettings && <ProfileSettings onClose={() => setShowProfileSettings(false)} />}
        {showSettings && <SettingsPanel onClose={() => setShowSettings(false)} />}
        {showRoomDirectory && (
          <RoomDirectory
            onClose={() => setShowRoomDirectory(false)}
            onJoined={(roomId) => {
              setShowRoomDirectory(false);
              setSelectedRoomId(roomId);
              setMobileShowSidebar(false);
            }}
          />
        )}
        {showSpaceSettings && selectedSpaceId && (
          <SpaceSettingsPanel
            spaceId={selectedSpaceId}
            onClose={() => setShowSpaceSettings(false)}
            onLeaveSpace={handleLeaveSpace}
          />
        )}
        {showSpaceHierarchy && selectedSpaceId && (
          <SpaceHierarchy
            spaceId={selectedSpaceId}
            onClose={() => setShowSpaceHierarchy(false)}
            onJoinRoom={(roomId) => {
              setSelectedRoomId(roomId);
              setMobileShowSidebar(false);
            }}
          />
        )}
        {showKeyboardShortcuts && (
          <KeyboardShortcutsOverlay onClose={() => setShowKeyboardShortcuts(false)} />
        )}
        {showDevTools && (
          <DevTools roomId={selectedRoomId} onClose={() => setShowDevTools(false)} />
        )}
      </div>
    );
  }

  // Desktop layout
  return (
    <div className="h-screen flex bg-surface-0">
      {/* Skip navigation link for screen readers */}
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:absolute focus:top-2 focus:left-2 focus:z-[200] focus:px-4 focus:py-2 focus:bg-accent focus:text-inverse focus:rounded-lg focus:text-sm focus:font-medium"
      >
        Skip to main content
      </a>

      {/* Space rail */}
      <SpaceRail
        selectedSpaceId={selectedSpaceId}
        onSelectSpace={handleSelectSpace}
        onCreateSpace={() => setShowCreateSpace(true)}
        onLogout={logout}
        onOpenProfileSettings={() => setShowProfileSettings(true)}
      />

      {/* Channel list */}
      <ChannelList
        spaceId={selectedSpaceId}
        selectedRoomId={selectedRoomId}
        onSelectRoom={handleSelectRoom}
        onCreateChannel={() => setShowCreateChannel(true)}
        onNewDM={() => setShowNewDM(true)}
        onBrowseRooms={() => setShowRoomDirectory(true)}
        onOpenSpaceSettings={() => setShowSpaceSettings(true)}
        onExploreSpace={() => setShowSpaceHierarchy(true)}
        recentRooms={recentRooms}
        onVisibleRoomIdsChange={handleVisibleRoomIdsChange}
      />

      {/* Main content area */}
      <div id="main-content" className="flex-1 flex flex-col min-w-0 relative" role="main">
        {/* Header with view mode toggle and notification bell */}
        {selectedRoomId && (
          <div className="h-12 flex items-center justify-between px-4 border-b border-border flex-shrink-0">
            <ViewModeToggle mode={currentViewMode} onChange={setViewMode} />
            <div className="flex items-center gap-2">
              {/* Widget panel toggle */}
              <button
                onClick={() => setShowWidgetPanel((prev) => !prev)}
                className="p-1.5 text-secondary hover:text-primary hover:bg-surface-3 rounded-lg transition-colors"
                title="Widgets"
                aria-label="Toggle widgets panel"
              >
                <svg
                  className="w-5 h-5"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={2}
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M4 5a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1H5a1 1 0 01-1-1V5zM14 5a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1h-4a1 1 0 01-1-1V5zM4 15a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1H5a1 1 0 01-1-1v-4zM14 15a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1h-4a1 1 0 01-1-1v-4z"
                  />
                </svg>
              </button>
              {/* Integration manager */}
              <button
                onClick={() => setShowIntegrationManager(true)}
                className="p-1.5 text-secondary hover:text-primary hover:bg-surface-3 rounded-lg transition-colors"
                title="Integrations"
                aria-label="Open integration manager"
              >
                <svg
                  className="w-5 h-5"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={2}
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M13.5 16.875h3.375m0 0h3.375m-3.375 0V13.5m0 3.375v3.375M6 10.5h2.25a2.25 2.25 0 002.25-2.25V6a2.25 2.25 0 00-2.25-2.25H6A2.25 2.25 0 003.75 6v2.25A2.25 2.25 0 006 10.5zm0 9.75h2.25A2.25 2.25 0 0010.5 18v-2.25a2.25 2.25 0 00-2.25-2.25H6a2.25 2.25 0 00-2.25 2.25V18A2.25 2.25 0 006 20.25zm9.75-9.75H18a2.25 2.25 0 002.25-2.25V6A2.25 2.25 0 0018 3.75h-2.25A2.25 2.25 0 0013.5 6v2.25a2.25 2.25 0 002.25 2.25z"
                  />
                </svg>
              </button>
              {/* Notification bell */}
              <button
                onClick={() => setShowNotifications((prev) => !prev)}
                className="relative p-1.5 text-secondary hover:text-primary hover:bg-surface-3 rounded-lg transition-colors"
                title="Notifications"
              >
                <svg
                  className="w-5 h-5"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={2}
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M14.857 17.082a23.848 23.848 0 005.454-1.31A8.967 8.967 0 0118 9.75v-.7V9A6 6 0 006 9v.75a8.967 8.967 0 01-2.312 6.022c1.733.64 3.56 1.085 5.455 1.31m5.714 0a24.255 24.255 0 01-5.714 0m5.714 0a3 3 0 11-5.714 0"
                  />
                </svg>
                {totalHighlights > 0 && (
                  <span className="absolute -top-0.5 -right-0.5 min-w-[16px] h-4 flex items-center justify-center px-1 bg-red-500 text-inverse text-[9px] font-bold rounded-full">
                    {totalHighlights > 99 ? "99+" : totalHighlights}
                  </span>
                )}
              </button>
              {currentViewMode !== "stream" && (
                <button
                  onClick={() => setShowAgentPanel(!showAgentPanel)}
                  className="px-3 py-1.5 text-xs text-secondary hover:text-primary bg-surface-2 hover:bg-surface-3 rounded-lg transition-colors"
                >
                  Agents
                </button>
              )}
            </div>
          </div>
        )}

        {renderMainContent()}

        {/* Notification panel dropdown */}
        {showNotifications && (
          <NotificationPanel
            onNavigateToRoom={handleSelectRoom}
            onClose={() => setShowNotifications(false)}
          />
        )}
      </div>

      {/* Thread list panel */}
      {showThreadList && selectedRoomId && !activeThreadId && (
        <ThreadListPanel
          roomId={selectedRoomId}
          onOpenThread={(threadRootId) => {
            setActiveThreadId(threadRootId);
            setShowThreadList(false);
          }}
          onClose={() => setShowThreadList(false)}
        />
      )}

      {/* Thread panel */}
      {activeThreadId && selectedRoomId && (
        <ThreadPanel
          roomId={selectedRoomId}
          threadRootId={activeThreadId}
          onClose={() => setActiveThreadId(null)}
        />
      )}

      {/* Agent panel */}
      {showAgentPanel && selectedRoomId && (
        <div className="w-72 flex-shrink-0 border-l border-border">
          <AgentPanel roomId={selectedRoomId} />
        </div>
      )}

      {/* Widget panel */}
      {showWidgetPanel && selectedRoomId && (
        <WidgetPanel roomId={selectedRoomId} onClose={() => setShowWidgetPanel(false)} />
      )}

      {/* Integration manager modal */}
      {showIntegrationManager && (
        <IntegrationManager onClose={() => setShowIntegrationManager(false)} />
      )}

      {/* Bug report modal */}
      {showBugReport && <BugReportModal onClose={() => setShowBugReport(false)} />}

      {/* Quick switcher (Cmd+K) */}
      {showQuickSwitcher && (
        <QuickSwitcher
          onSelectSpace={handleSelectSpace}
          onSelectRoom={handleSelectRoom}
          onClose={() => setShowQuickSwitcher(false)}
        />
      )}

      {/* Message search (Cmd+F) */}
      {showSearch && (
        <MessageSearch
          roomId={selectedRoomId ?? undefined}
          onClose={() => setShowSearch(false)}
          onNavigateToMessage={(roomId, _eventId) => {
            setSelectedRoomId(roomId);
            setShowSearch(false);
          }}
        />
      )}

      {/* Create space modal */}
      {showCreateSpace && (
        <CreateSpaceModal
          onClose={() => setShowCreateSpace(false)}
          onCreated={(spaceId) => {
            setShowCreateSpace(false);
            setSelectedSpaceId(spaceId);
            setSelectedRoomId(null);
          }}
        />
      )}

      {/* Create channel modal */}
      {showCreateChannel && (
        <CreateChannelModal
          spaceId={selectedSpaceId}
          onClose={() => setShowCreateChannel(false)}
          onCreated={(roomId) => {
            setShowCreateChannel(false);
            setSelectedRoomId(roomId);
          }}
        />
      )}

      {/* New DM modal */}
      {showNewDM && (
        <NewDMModal
          onClose={() => setShowNewDM(false)}
          onCreated={(roomId) => {
            setShowNewDM(false);
            setSelectedRoomId(roomId);
          }}
        />
      )}

      {/* Profile settings modal */}
      {showProfileSettings && <ProfileSettings onClose={() => setShowProfileSettings(false)} />}

      {/* Settings panel modal */}
      {showSettings && <SettingsPanel onClose={() => setShowSettings(false)} />}

      {/* Room directory modal */}
      {showRoomDirectory && (
        <RoomDirectory
          onClose={() => setShowRoomDirectory(false)}
          onJoined={(roomId) => {
            setShowRoomDirectory(false);
            setSelectedRoomId(roomId);
          }}
        />
      )}

      {/* Space settings modal */}
      {showSpaceSettings && selectedSpaceId && (
        <SpaceSettingsPanel
          spaceId={selectedSpaceId}
          onClose={() => setShowSpaceSettings(false)}
          onLeaveSpace={handleLeaveSpace}
        />
      )}

      {/* Space hierarchy browser modal */}
      {showSpaceHierarchy && selectedSpaceId && (
        <SpaceHierarchy
          spaceId={selectedSpaceId}
          onClose={() => setShowSpaceHierarchy(false)}
          onJoinRoom={(roomId) => {
            setSelectedRoomId(roomId);
          }}
        />
      )}

      {/* 1:1 Call floating overlay */}
      {activeCallRoomId && callManagerRef.current && (
        <CallView
          roomId={activeCallRoomId}
          callManager={callManagerRef.current}
          onClose={handleCloseCall}
        />
      )}

      {/* Group call floating overlay */}
      {activeGroupCallRoomId && groupCallRef.current && (
        <div className="fixed bottom-20 right-4 z-[100] w-[480px] h-[400px] bg-surface-1 border border-border rounded-xl shadow-2xl overflow-hidden">
          <GroupCallView
            roomId={activeGroupCallRoomId}
            groupCall={groupCallRef.current}
            callType={activeGroupCallType}
            onLeave={handleLeaveGroupCall}
          />
        </div>
      )}

      {/* Keyboard shortcuts overlay */}
      {showKeyboardShortcuts && (
        <KeyboardShortcutsOverlay onClose={() => setShowKeyboardShortcuts(false)} />
      )}

      {/* Developer tools modal */}
      {showDevTools && <DevTools roomId={selectedRoomId} onClose={() => setShowDevTools(false)} />}
    </div>
  );
}
