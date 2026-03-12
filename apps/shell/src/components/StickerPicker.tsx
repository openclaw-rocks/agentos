import React, { useEffect, useMemo, useState } from "react";
import { useMatrix } from "~/lib/matrix-context";
import { mxcToHttpUrl } from "~/lib/media";
import {
  getUserStickerPacks,
  buildStickerEventContent,
  type StickerPack,
} from "~/lib/sticker-utils";

export interface StickerPickerProps {
  onSendSticker: (content: Record<string, unknown>) => void;
  onClose: () => void;
  homeserverUrl: string;
}

export function StickerPicker({
  onSendSticker,
  onClose,
  homeserverUrl,
}: StickerPickerProps): React.ReactElement {
  const { client } = useMatrix();
  const [activePackIndex, setActivePackIndex] = useState(0);

  const packs = useMemo((): StickerPack[] => {
    return getUserStickerPacks(client);
  }, [client]);

  // Close on Escape
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent): void => {
      if (e.key === "Escape") {
        onClose();
      }
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  const activePack = packs[activePackIndex] as StickerPack | undefined;

  const convertMxc = (mxcUrl: string): string | null => {
    return mxcToHttpUrl(mxcUrl, homeserverUrl);
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
      onClick={onClose}
    >
      <div
        className="w-full max-w-sm bg-surface-2 border border-border rounded-xl shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-3 pt-3 pb-2 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-primary">Stickers</h3>
          <button
            onClick={onClose}
            className="p-1 text-muted hover:text-secondary transition-colors"
            title="Close"
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

        {packs.length === 0 ? (
          <div className="px-3 pb-6 pt-4 text-center">
            <p className="text-sm text-muted">No sticker packs installed</p>
          </div>
        ) : (
          <>
            {/* Pack tabs */}
            {packs.length > 1 && (
              <div className="flex items-center gap-0.5 px-2 pb-1 overflow-x-auto">
                {packs.map((pack, idx) => {
                  const avatarHttp = pack.avatarUrl ? convertMxc(pack.avatarUrl) : null;
                  return (
                    <button
                      key={pack.name}
                      type="button"
                      onClick={() => setActivePackIndex(idx)}
                      className={`flex-shrink-0 flex items-center justify-center w-8 h-8 rounded transition-colors ${
                        activePackIndex === idx
                          ? "bg-surface-3 border-b-2 border-accent"
                          : "hover:bg-surface-3 opacity-60 hover:opacity-100"
                      }`}
                      title={pack.name}
                    >
                      {avatarHttp ? (
                        <img
                          src={avatarHttp}
                          alt={pack.name}
                          className="w-5 h-5 rounded object-cover"
                        />
                      ) : (
                        <span className="text-xs text-secondary">
                          {pack.name.charAt(0).toUpperCase()}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            )}

            {/* Sticker grid */}
            <div className="px-3 pb-3 max-h-64 overflow-y-auto">
              {activePack && (
                <>
                  <p className="text-[10px] font-semibold text-muted uppercase tracking-wider mb-1">
                    {activePack.name}
                  </p>
                  <div className="grid grid-cols-4 gap-2">
                    {activePack.stickers.map((sticker) => {
                      const httpUrl = convertMxc(sticker.url);
                      if (!httpUrl) return null;

                      return (
                        <button
                          key={sticker.url}
                          type="button"
                          onClick={() => {
                            const content = buildStickerEventContent(sticker);
                            onSendSticker(content);
                          }}
                          className="flex items-center justify-center p-1 hover:bg-surface-3 rounded-lg transition-colors"
                          title={sticker.name}
                        >
                          <img
                            src={httpUrl}
                            alt={sticker.name}
                            className="w-16 h-16 object-contain"
                            loading="lazy"
                          />
                        </button>
                      );
                    })}
                  </div>
                </>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
