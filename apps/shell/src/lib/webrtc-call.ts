/**
 * WebRTC 1:1 voice and video call manager.
 *
 * Manages a single call using RTCPeerConnection and exchanges signalling
 * through Matrix call events (m.call.invite, m.call.answer,
 * m.call.candidates, m.call.hangup, m.call.reject).
 */
import type { MatrixClient, MatrixEvent, Room } from "matrix-js-sdk";
import { fetchTurnServers, DEFAULT_STUN_SERVERS } from "./turn-server";

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export type CallState = "idle" | "calling" | "ringing" | "connected" | "ended";
export type CallType = "voice" | "video";

export interface CallEventPayload {
  call_id: string;
  version: 0;
  [key: string]: unknown;
}

const CALL_EVENT_TYPES = [
  "m.call.invite",
  "m.call.answer",
  "m.call.candidates",
  "m.call.hangup",
  "m.call.reject",
] as const;

// ---------------------------------------------------------------------------
// WebRTCCall
// ---------------------------------------------------------------------------

export class WebRTCCall {
  private pc: RTCPeerConnection | null = null;
  private localStream: MediaStream | null = null;
  private remoteStream: MediaStream | null = null;
  private pendingCandidates: RTCIceCandidateInit[] = [];
  private callId: string = "";
  private roomId: string = "";
  private callType: CallType = "voice";
  private state: CallState = "idle";
  private client: MatrixClient;
  private boundOnRoomEvent: ((event: MatrixEvent, room: Room | undefined) => void) | null = null;
  private isDestroyed = false;

  /** Direction of the call — outbound = we placed it, inbound = we received it. */
  private direction: "outbound" | "inbound" | null = null;

  /** User callback invoked whenever state changes. */
  onStateChange: ((state: CallState) => void) | null = null;

  constructor(client: MatrixClient) {
    this.client = client;
    this.attachMatrixListeners();
  }

  // -----------------------------------------------------------------------
  // Public getters
  // -----------------------------------------------------------------------

  getState(): CallState {
    return this.state;
  }

  getCallId(): string {
    return this.callId;
  }

  getRoomId(): string {
    return this.roomId;
  }

  getCallType(): CallType {
    return this.callType;
  }

  getDirection(): "outbound" | "inbound" | null {
    return this.direction;
  }

  getLocalStream(): MediaStream | null {
    return this.localStream;
  }

  getRemoteStream(): MediaStream | null {
    return this.remoteStream;
  }

  // -----------------------------------------------------------------------
  // Outgoing call
  // -----------------------------------------------------------------------

  async startCall(roomId: string, type: CallType): Promise<void> {
    if (this.state !== "idle" && this.state !== "ended") {
      throw new Error(`Cannot start call in state "${this.state}"`);
    }

    this.roomId = roomId;
    this.callType = type;
    this.callId = generateCallId();
    this.direction = "outbound";
    this.setState("calling");

    await this.acquireMedia(type);
    const iceServers = await fetchTurnServers(this.client);
    this.createPeerConnection(iceServers);
    this.addLocalTracks();

    const offer = await this.pc!.createOffer();
    await this.pc!.setLocalDescription(offer);

    await this.sendCallEvent(roomId, "m.call.invite", {
      call_id: this.callId,
      version: 0,
      lifetime: 60000,
      offer: {
        type: offer.type,
        sdp: offer.sdp,
      },
    });
  }

  // -----------------------------------------------------------------------
  // Incoming call
  // -----------------------------------------------------------------------

  async answerCall(callId: string): Promise<void> {
    if (this.state !== "ringing") {
      throw new Error(`Cannot answer call in state "${this.state}"`);
    }
    if (this.callId !== callId) {
      throw new Error(`Call ID mismatch: expected "${this.callId}", got "${callId}"`);
    }

    await this.acquireMedia(this.callType);
    this.addLocalTracks();

    const answer = await this.pc!.createAnswer();
    await this.pc!.setLocalDescription(answer);

    // Flush any ICE candidates that arrived before we had a local description
    await this.flushPendingCandidates();

    this.setState("connected");

    await this.sendCallEvent(this.roomId, "m.call.answer", {
      call_id: this.callId,
      version: 0,
      answer: {
        type: answer.type,
        sdp: answer.sdp,
      },
    });
  }

  // -----------------------------------------------------------------------
  // Hangup / reject
  // -----------------------------------------------------------------------

  async hangup(callId?: string): Promise<void> {
    const id = callId ?? this.callId;
    if (!id) return;

    const roomId = this.roomId;
    this.cleanup();
    this.setState("ended");

    if (roomId) {
      await this.sendCallEvent(roomId, "m.call.hangup", {
        call_id: id,
        version: 0,
        reason: "user_hangup",
      });
    }
  }

  async rejectCall(callId?: string): Promise<void> {
    const id = callId ?? this.callId;
    if (!id) return;

    const roomId = this.roomId;
    this.cleanup();
    this.setState("ended");

    if (roomId) {
      await this.sendCallEvent(roomId, "m.call.reject", {
        call_id: id,
        version: 0,
      });
    }
  }

  // -----------------------------------------------------------------------
  // Media toggles
  // -----------------------------------------------------------------------

  toggleMute(): boolean {
    if (!this.localStream) return false;
    const audioTracks = this.localStream.getAudioTracks();
    for (const track of audioTracks) {
      track.enabled = !track.enabled;
    }
    return audioTracks.length > 0 ? !audioTracks[0].enabled : false;
  }

  toggleVideo(): boolean {
    if (!this.localStream) return false;
    const videoTracks = this.localStream.getVideoTracks();
    for (const track of videoTracks) {
      track.enabled = !track.enabled;
    }
    return videoTracks.length > 0 ? !videoTracks[0].enabled : false;
  }

  isMuted(): boolean {
    if (!this.localStream) return false;
    const audioTracks = this.localStream.getAudioTracks();
    return audioTracks.length > 0 ? !audioTracks[0].enabled : false;
  }

  isVideoEnabled(): boolean {
    if (!this.localStream) return true;
    const videoTracks = this.localStream.getVideoTracks();
    return videoTracks.length > 0 ? videoTracks[0].enabled : false;
  }

  // -----------------------------------------------------------------------
  // Cleanup
  // -----------------------------------------------------------------------

  destroy(): void {
    this.isDestroyed = true;
    this.detachMatrixListeners();
    this.cleanup();
    this.onStateChange = null;
  }

  // -----------------------------------------------------------------------
  // Handle incoming Matrix call events
  // -----------------------------------------------------------------------

  handleCallEvent(event: MatrixEvent, room: Room | undefined): void {
    if (this.isDestroyed) return;

    const type = event.getType();
    if (!CALL_EVENT_TYPES.includes(type as (typeof CALL_EVENT_TYPES)[number])) return;

    // Ignore our own events
    const sender = event.getSender();
    if (sender === this.client.getUserId()) return;

    const content = event.getContent() as CallEventPayload;
    const eventRoomId = room?.roomId ?? "";

    switch (type) {
      case "m.call.invite":
        this.onCallInvite(eventRoomId, content);
        break;
      case "m.call.answer":
        this.onCallAnswer(content);
        break;
      case "m.call.candidates":
        this.onCallCandidates(content);
        break;
      case "m.call.hangup":
        this.onCallHangup(content);
        break;
      case "m.call.reject":
        this.onCallReject(content);
        break;
    }
  }

  private onCallInvite(roomId: string, content: CallEventPayload): void {
    // Only accept if we're idle
    if (this.state !== "idle" && this.state !== "ended") return;

    this.callId = content.call_id;
    this.roomId = roomId;
    this.direction = "inbound";

    const offer = content.offer as { type: RTCSdpType; sdp: string } | undefined;
    if (!offer) return;

    // Determine call type from SDP (presence of video lines)
    this.callType = offer.sdp?.includes("m=video") ? "video" : "voice";

    fetchTurnServers(this.client).then((iceServers) => {
      this.createPeerConnection(iceServers);
      this.pc!.setRemoteDescription(new RTCSessionDescription(offer)).then(() => {
        this.flushPendingCandidates();
      });

      this.setState("ringing");
    });
  }

  private async onCallAnswer(content: CallEventPayload): Promise<void> {
    if (content.call_id !== this.callId) return;
    if (this.state !== "calling") return;

    const answer = content.answer as { type: RTCSdpType; sdp: string } | undefined;
    if (!answer || !this.pc) return;

    await this.pc.setRemoteDescription(new RTCSessionDescription(answer));
    await this.flushPendingCandidates();
    this.setState("connected");
  }

  private async onCallCandidates(content: CallEventPayload): Promise<void> {
    if (content.call_id !== this.callId) return;

    const candidates = content.candidates as RTCIceCandidateInit[] | undefined;
    if (!candidates) return;

    for (const candidate of candidates) {
      if (this.pc && this.pc.remoteDescription) {
        await this.pc.addIceCandidate(new RTCIceCandidate(candidate));
      } else {
        this.pendingCandidates.push(candidate);
      }
    }
  }

  private onCallHangup(content: CallEventPayload): void {
    if (content.call_id !== this.callId) return;
    this.cleanup();
    this.setState("ended");
  }

  private onCallReject(content: CallEventPayload): void {
    if (content.call_id !== this.callId) return;
    this.cleanup();
    this.setState("ended");
  }

  // -----------------------------------------------------------------------
  // Internal helpers
  // -----------------------------------------------------------------------

  private setState(newState: CallState): void {
    if (this.state === newState) return;
    this.state = newState;
    this.onStateChange?.(newState);
  }

  private async acquireMedia(type: CallType): Promise<void> {
    const constraints: MediaStreamConstraints = {
      audio: true,
      video: type === "video",
    };
    this.localStream = await navigator.mediaDevices.getUserMedia(constraints);
  }

  private createPeerConnection(iceServers?: RTCIceServer[]): void {
    const pc = new RTCPeerConnection({ iceServers: iceServers ?? DEFAULT_STUN_SERVERS });

    pc.onicecandidate = (event) => {
      if (event.candidate && this.roomId) {
        this.sendCallEvent(this.roomId, "m.call.candidates", {
          call_id: this.callId,
          version: 0,
          candidates: [event.candidate.toJSON()],
        });
      }
    };

    pc.ontrack = (event) => {
      if (!this.remoteStream) {
        this.remoteStream = new MediaStream();
      }
      this.remoteStream.addTrack(event.track);
    };

    pc.oniceconnectionstatechange = () => {
      if (pc.iceConnectionState === "disconnected" || pc.iceConnectionState === "failed") {
        this.cleanup();
        this.setState("ended");
      }
    };

    this.pc = pc;
  }

  private addLocalTracks(): void {
    if (!this.pc || !this.localStream) return;
    for (const track of this.localStream.getTracks()) {
      this.pc.addTrack(track, this.localStream);
    }
  }

  private async flushPendingCandidates(): Promise<void> {
    if (!this.pc || !this.pc.remoteDescription) return;
    for (const candidate of this.pendingCandidates) {
      await this.pc.addIceCandidate(new RTCIceCandidate(candidate));
    }
    this.pendingCandidates = [];
  }

  private cleanup(): void {
    if (this.pc) {
      this.pc.onicecandidate = null;
      this.pc.ontrack = null;
      this.pc.oniceconnectionstatechange = null;
      this.pc.close();
      this.pc = null;
    }
    if (this.localStream) {
      for (const track of this.localStream.getTracks()) {
        track.stop();
      }
      this.localStream = null;
    }
    this.remoteStream = null;
    this.pendingCandidates = [];
  }

  private async sendCallEvent(
    roomId: string,
    eventType: string,
    content: Record<string, unknown>,
  ): Promise<void> {
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await this.client.sendEvent(roomId, eventType as any, content);
    } catch (err) {
      console.error(`[WebRTCCall] Failed to send ${eventType}:`, err);
    }
  }

  private attachMatrixListeners(): void {
    this.boundOnRoomEvent = (event: MatrixEvent, room: Room | undefined) => {
      this.handleCallEvent(event, room);
    };
    // Use the Timeline event to pick up call signalling events as they arrive
    this.client.on("Room.timeline" as Parameters<MatrixClient["on"]>[0], this.boundOnRoomEvent);
  }

  private detachMatrixListeners(): void {
    if (this.boundOnRoomEvent) {
      this.client.removeListener(
        "Room.timeline" as Parameters<MatrixClient["removeListener"]>[0],
        this.boundOnRoomEvent,
      );
      this.boundOnRoomEvent = null;
    }
  }
}

// ---------------------------------------------------------------------------
// Utilities
// ---------------------------------------------------------------------------

function generateCallId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}
