import React, { useCallback, useEffect, useState } from "react";
import { AgentPanel } from "~/components/AgentPanel";
import { CanvasView } from "~/components/CanvasView";
import { ChannelList } from "~/components/ChannelList";
import { ChatView } from "~/components/ChatView";
import { CreateChannelModal } from "~/components/CreateChannelModal";
import { CreateSpaceModal } from "~/components/CreateSpaceModal";
import { EmptyState } from "~/components/EmptyState";
import { FocusView } from "~/components/FocusView";
import { MobileNav } from "~/components/MobileNav";
import { QuickSwitcher } from "~/components/QuickSwitcher";
import { SpaceRail } from "~/components/SpaceRail";
import { ThreadPanel } from "~/components/ThreadPanel";
import { ViewModeToggle, type ViewMode } from "~/components/ViewModeToggle";
import { WelcomeBanner } from "~/components/WelcomeBanner";
import { useMatrix } from "~/lib/matrix-context";

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
  const { ready, logout } = useMatrix();
  const isMobile = useIsMobile();

  const [selectedSpaceId, setSelectedSpaceId] = useState<string | null>(null);
  const [selectedRoomId, setSelectedRoomId] = useState<string | null>(null);
  const [activeThreadId, setActiveThreadId] = useState<string | null>(null);
  const [showAgentPanel, setShowAgentPanel] = useState(false);
  const [showCreateSpace, setShowCreateSpace] = useState(false);
  const [showCreateChannel, setShowCreateChannel] = useState(false);
  const [showQuickSwitcher, setShowQuickSwitcher] = useState(false);

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

  // Cmd+K / Ctrl+K to open quick switcher
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setShowQuickSwitcher((prev) => !prev);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  const handleSelectSpace = useCallback((id: string | null) => {
    setSelectedSpaceId(id);
    setSelectedRoomId(null);
    setActiveThreadId(null);
  }, []);

  const handleSelectRoom = useCallback(
    (id: string) => {
      setSelectedRoomId(id);
      setActiveThreadId(null);
      if (isMobile) {
        setMobileShowSidebar(false);
      }
    },
    [isMobile],
  );

  const handleMobileBack = useCallback(() => {
    setMobileShowSidebar(true);
  }, []);

  if (!ready) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-surface-0">
        <div className="text-center">
          <div className="w-8 h-8 border-2 border-accent border-t-transparent rounded-full animate-spin mx-auto mb-3" />
          <p className="text-sm text-gray-400">Syncing with homeserver...</p>
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
              />
              <ChannelList
                spaceId={selectedSpaceId}
                selectedRoomId={selectedRoomId}
                onSelectRoom={handleSelectRoom}
                onCreateChannel={() => setShowCreateChannel(true)}
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
                  className="p-1.5 text-gray-400 hover:text-white hover:bg-surface-3 rounded-lg transition-colors"
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
          onShowSettings={logout}
        />

        {/* Modals */}
        {showQuickSwitcher && (
          <QuickSwitcher
            onSelectSpace={handleSelectSpace}
            onSelectRoom={handleSelectRoom}
            onClose={() => setShowQuickSwitcher(false)}
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
      </div>
    );
  }

  // Desktop layout
  return (
    <div className="h-screen flex bg-surface-0">
      {/* Space rail */}
      <SpaceRail
        selectedSpaceId={selectedSpaceId}
        onSelectSpace={handleSelectSpace}
        onCreateSpace={() => setShowCreateSpace(true)}
        onLogout={logout}
      />

      {/* Channel list */}
      <ChannelList
        spaceId={selectedSpaceId}
        selectedRoomId={selectedRoomId}
        onSelectRoom={handleSelectRoom}
        onCreateChannel={() => setShowCreateChannel(true)}
      />

      {/* Main content area */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Header with view mode toggle */}
        {selectedRoomId && (
          <div className="h-12 flex items-center justify-between px-4 border-b border-border flex-shrink-0">
            <ViewModeToggle mode={currentViewMode} onChange={setViewMode} />
            {currentViewMode !== "stream" && (
              <button
                onClick={() => setShowAgentPanel(!showAgentPanel)}
                className="px-3 py-1.5 text-xs text-gray-400 hover:text-white bg-surface-2 hover:bg-surface-3 rounded-lg transition-colors"
              >
                Agents
              </button>
            )}
          </div>
        )}

        {renderMainContent()}
      </div>

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

      {/* Quick switcher (Cmd+K) */}
      {showQuickSwitcher && (
        <QuickSwitcher
          onSelectSpace={handleSelectSpace}
          onSelectRoom={handleSelectRoom}
          onClose={() => setShowQuickSwitcher(false)}
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
    </div>
  );
}
