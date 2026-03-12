/**
 * Screen sharing utility for WebRTC calls.
 *
 * Manages the lifecycle of a screen share session: acquiring a display media
 * stream, replacing/restoring tracks in an existing RTCPeerConnection, and
 * handling the browser-native "Stop sharing" action.
 */

export class ScreenShareManager {
  private stream: MediaStream | null = null;
  private sharing = false;

  /** Fires when the user stops sharing via the browser chrome (not our UI). */
  onShareEnded: (() => void) | null = null;

  // -------------------------------------------------------------------------
  // Public API
  // -------------------------------------------------------------------------

  /**
   * Prompt the user to select a screen/window/tab and return the resulting
   * MediaStream.  Automatically listens for the browser-level "stop sharing"
   * event so {@link onShareEnded} fires.
   */
  async startScreenShare(): Promise<MediaStream> {
    if (this.sharing && this.stream) {
      return this.stream;
    }

    const stream = await navigator.mediaDevices.getDisplayMedia({
      video: true,
      audio: true,
    });

    this.stream = stream;
    this.sharing = true;

    // The video track ends when the user clicks "Stop sharing" in the browser
    const videoTrack = stream.getVideoTracks()[0];
    if (videoTrack) {
      videoTrack.onended = () => {
        this.sharing = false;
        this.stream = null;
        this.onShareEnded?.();
      };
    }

    return stream;
  }

  /**
   * Stop all tracks in the current screen share stream and reset state.
   */
  stopScreenShare(): void {
    if (this.stream) {
      for (const track of this.stream.getTracks()) {
        track.stop();
      }
      this.stream = null;
    }
    this.sharing = false;
  }

  /**
   * Whether a screen share is currently active.
   */
  isSharing(): boolean {
    return this.sharing;
  }

  /**
   * Return the current screen share MediaStream, or `null` if not sharing.
   */
  getStream(): MediaStream | null {
    return this.stream;
  }

  /**
   * Replace the video track in an existing {@link RTCPeerConnection} with the
   * video track from the screen share stream.
   *
   * This uses `RTCRtpSender.replaceTrack` so that no renegotiation is needed.
   */
  async replaceTrackInPeerConnection(
    pc: RTCPeerConnection,
    screenStream: MediaStream,
  ): Promise<void> {
    const screenVideoTrack = screenStream.getVideoTracks()[0];
    if (!screenVideoTrack) return;

    const sender = pc.getSenders().find((s) => s.track?.kind === "video");

    if (sender) {
      await sender.replaceTrack(screenVideoTrack);
    }
  }

  /**
   * Restore the original camera track in the {@link RTCPeerConnection} after
   * screen sharing ends.
   */
  async restoreCamera(pc: RTCPeerConnection, cameraStream: MediaStream): Promise<void> {
    const cameraVideoTrack = cameraStream.getVideoTracks()[0];
    if (!cameraVideoTrack) return;

    const sender = pc.getSenders().find((s) => s.track?.kind === "video");

    if (sender) {
      await sender.replaceTrack(cameraVideoTrack);
    }

    this.stopScreenShare();
  }
}
