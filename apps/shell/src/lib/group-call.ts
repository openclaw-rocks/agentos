/**
 * Group call manager using MSC3401 / Element Call protocol.
 *
 * Uses `m.call.member` state events for call membership and a mesh topology
 * where each participant creates an RTCPeerConnection to every other
 * participant. Signalling (offers/answers/candidates) is exchanged via
 * Matrix to-device messages of type `m.call.offer`, `m.call.answer`,
 * and `m.call.candidates`.
 */
import type { MatrixClient, MatrixEvent } from "matrix-js-sdk";
import { fetchTurnServers, DEFAULT_STUN_SERVERS } from "./turn-server";

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export type GroupCallState = "idle" | "joining" | "connected" | "ended";
export type GroupCallType = "voice" | "video";

export interface GroupCallMember {
  userId: string;
  deviceId: string;
  stream?: MediaStream;
  audioMuted: boolean;
  videoMuted: boolean;
  handRaised: boolean;
}

export interface CallMemberContent {
  "m.calls": CallMemberEntry[];
  hand_raised?: boolean;
}

export interface CallMemberEntry {
  "m.call_id": string;
  "m.devices": CallMemberDevice[];
}

export interface CallMemberDevice {
  device_id: string;
  session_id: string;
  feeds: CallFeed[];
}

export interface CallFeed {
  purpose: "m.usermedia" | "m.screenshare";
}

// ---------------------------------------------------------------------------
// Signalling message types (to-device)
// ---------------------------------------------------------------------------

interface SignallingBase {
  call_id: string;
  party_id: string;
  conf_id: string;
  device_id: string;
  sender_session_id: string;
  dest_session_id: string;
  version: "1";
}

interface OfferMessage extends SignallingBase {
  offer: { type: RTCSdpType; sdp: string };
  lifetime: number;
}

interface AnswerMessage extends SignallingBase {
  answer: { type: RTCSdpType; sdp: string };
}

interface CandidatesMessage extends SignallingBase {
  candidates: RTCIceCandidateInit[];
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Resolved ICE servers (populated on join/joinWithDevices). */
let resolvedIceServers: RTCIceServer[] = DEFAULT_STUN_SERVERS;

const CALL_MEMBER_EVENT_TYPE = "m.call.member";

// ---------------------------------------------------------------------------
// PeerEntry — tracks one RTCPeerConnection in the mesh
// ---------------------------------------------------------------------------

interface PeerEntry {
  userId: string;
  deviceId: string;
  pc: RTCPeerConnection;
  stream: MediaStream | null;
}

// ---------------------------------------------------------------------------
// GroupCall
// ---------------------------------------------------------------------------

export class GroupCall {
  private client: MatrixClient;
  private state: GroupCallState = "idle";
  private callType: GroupCallType = "voice";
  private roomId: string = "";
  private callId: string = "";
  private sessionId: string = "";
  private localStream: MediaStream | null = null;
  private members: Map<string, GroupCallMember> = new Map();
  private peers: Map<string, PeerEntry> = new Map();
  private audioMuted: boolean = false;
  private videoMuted: boolean = false;
  private handRaised: boolean = false;
  private isDestroyed: boolean = false;

  private boundOnStateEvent: ((event: MatrixEvent) => void) | null = null;

  private boundOnToDevice: ((event: MatrixEvent) => void) | null = null;
  private boundOnTimeline: ((event: MatrixEvent) => void) | null = null;

  /** Callback invoked when a member joins the call. */
  onMemberJoined: ((member: GroupCallMember) => void) | null = null;

  /** Callback invoked when a member leaves the call. */
  onMemberLeft: ((member: GroupCallMember) => void) | null = null;

  /** Callback invoked when the group call state changes. */
  onStateChange: ((state: GroupCallState) => void) | null = null;

  /** Callback invoked when any member's hand raise state changes. */
  onHandRaiseChange: ((userId: string, raised: boolean) => void) | null = null;

  /** Callback invoked when a reaction is received from a member. */
  onReaction: ((userId: string, emoji: string) => void) | null = null;

  constructor(client: MatrixClient) {
    this.client = client;
    this.sessionId = generateSessionId();
  }

  // -----------------------------------------------------------------------
  // Public getters
  // -----------------------------------------------------------------------

  getState(): GroupCallState {
    return this.state;
  }

  getRoomId(): string {
    return this.roomId;
  }

  getCallId(): string {
    return this.callId;
  }

  getCallType(): GroupCallType {
    return this.callType;
  }

  getLocalStream(): MediaStream | null {
    return this.localStream;
  }

  getMembers(): GroupCallMember[] {
    return Array.from(this.members.values());
  }

  /** Returns the internal peers map for external audio monitoring. */
  getPeers(): Map<string, { userId: string; stream: MediaStream | null }> {
    const result = new Map<string, { userId: string; stream: MediaStream | null }>();
    for (const [key, entry] of this.peers) {
      result.set(key, { userId: entry.userId, stream: entry.stream });
    }
    return result;
  }

  isAudioMuted(): boolean {
    return this.audioMuted;
  }

  isVideoMuted(): boolean {
    return this.videoMuted;
  }

  isHandRaised(): boolean {
    return this.handRaised;
  }

  // -----------------------------------------------------------------------
  // Hand raise
  // -----------------------------------------------------------------------

  async raiseHand(): Promise<void> {
    if (this.handRaised) return;
    this.handRaised = true;
    await this.sendMemberStateEvent();
    const myUserId = this.client.getUserId() ?? "";
    this.onHandRaiseChange?.(myUserId, true);
  }

  async lowerHand(): Promise<void> {
    if (!this.handRaised) return;
    this.handRaised = false;
    await this.sendMemberStateEvent();
    const myUserId = this.client.getUserId() ?? "";
    this.onHandRaiseChange?.(myUserId, false);
  }

  // -----------------------------------------------------------------------
  // Emoji reactions
  // -----------------------------------------------------------------------

  async sendReaction(emoji: string): Promise<void> {
    if (!this.roomId) return;
    try {
      /* eslint-disable @typescript-eslint/no-explicit-any -- matrix-js-sdk sendEvent requires `any` for custom event types */
      await this.client.sendEvent(
        this.roomId,
        "m.room.message" as any,
        {
          msgtype: "m.text",
          body: emoji,
          "rocks.openclaw.call_reaction": {
            call_id: this.callId,
            emoji,
          },
        } as any,
      );
      /* eslint-enable @typescript-eslint/no-explicit-any */
    } catch (err) {
      console.error("[GroupCall] Failed to send reaction:", err);
    }
  }

  // -----------------------------------------------------------------------
  // Join
  // -----------------------------------------------------------------------

  async join(roomId: string, type: GroupCallType): Promise<void> {
    if (this.state !== "idle" && this.state !== "ended") {
      throw new Error(`Cannot join call in state "${this.state}"`);
    }

    this.roomId = roomId;
    this.callType = type;
    this.callId = generateCallId();
    this.setState("joining");

    // Acquire local media
    await this.acquireMedia(type);

    // Fetch TURN servers before creating any peer connections
    resolvedIceServers = await fetchTurnServers(this.client);

    // Attach Matrix listeners
    this.attachListeners();

    // Send m.call.member state event to announce our participation
    await this.sendMemberStateEvent();

    // Scan for existing members and connect to them
    await this.syncExistingMembers();

    this.setState("connected");
  }

  // -----------------------------------------------------------------------
  // Leave
  // -----------------------------------------------------------------------

  async leave(): Promise<void> {
    if (this.state === "idle" || this.state === "ended") return;

    const roomId = this.roomId;
    const userId = this.client.getUserId() ?? "";

    // Close all peer connections
    this.cleanupPeers();

    // Stop local media
    this.cleanupLocalMedia();

    // Remove our m.call.member state event
    try {
      /* eslint-disable @typescript-eslint/no-explicit-any -- matrix-js-sdk sendStateEvent requires `any` for custom event types */
      await this.client.sendStateEvent(
        roomId,
        CALL_MEMBER_EVENT_TYPE as any,
        { "m.calls": [] } as any,
        userId,
      );
      /* eslint-enable @typescript-eslint/no-explicit-any */
    } catch (err) {
      console.error("[GroupCall] Failed to remove member state event:", err);
    }

    this.detachListeners();
    this.members.clear();
    this.setState("ended");
  }

  // -----------------------------------------------------------------------
  // Media toggles
  // -----------------------------------------------------------------------

  toggleMute(): boolean {
    if (!this.localStream) return this.audioMuted;
    const audioTracks = this.localStream.getAudioTracks();
    this.audioMuted = !this.audioMuted;
    for (const track of audioTracks) {
      track.enabled = !this.audioMuted;
    }
    return this.audioMuted;
  }

  toggleVideo(): boolean {
    if (!this.localStream) return this.videoMuted;
    const videoTracks = this.localStream.getVideoTracks();
    this.videoMuted = !this.videoMuted;
    for (const track of videoTracks) {
      track.enabled = !this.videoMuted;
    }
    return this.videoMuted;
  }

  // -----------------------------------------------------------------------
  // Cleanup / destroy
  // -----------------------------------------------------------------------

  destroy(): void {
    this.isDestroyed = true;
    this.cleanupPeers();
    this.cleanupLocalMedia();
    this.detachListeners();
    this.members.clear();
    this.onMemberJoined = null;
    this.onMemberLeft = null;
    this.onStateChange = null;
    this.onHandRaiseChange = null;
    this.onReaction = null;
  }

  // -----------------------------------------------------------------------
  // State management
  // -----------------------------------------------------------------------

  private setState(newState: GroupCallState): void {
    if (this.state === newState) return;
    this.state = newState;
    this.onStateChange?.(newState);
  }

  // -----------------------------------------------------------------------
  // Join with pre-selected devices
  // -----------------------------------------------------------------------

  /** Join with specific device selections from the pre-join screen. */
  async joinWithDevices(
    roomId: string,
    type: GroupCallType,
    options: {
      audioDeviceId?: string;
      videoDeviceId?: string;
      audioMuted?: boolean;
      videoMuted?: boolean;
    },
  ): Promise<void> {
    if (this.state !== "idle" && this.state !== "ended") {
      throw new Error(`Cannot join call in state "${this.state}"`);
    }

    this.roomId = roomId;
    this.callType = type;
    this.callId = generateCallId();
    this.setState("joining");

    // Acquire local media with specific devices
    await this.acquireMedia(type, options.audioDeviceId, options.videoDeviceId);

    // Fetch TURN servers before creating any peer connections
    resolvedIceServers = await fetchTurnServers(this.client);

    // Apply initial mute states
    if (options.audioMuted && this.localStream) {
      for (const track of this.localStream.getAudioTracks()) {
        track.enabled = false;
      }
      this.audioMuted = true;
    }
    if (options.videoMuted && this.localStream) {
      for (const track of this.localStream.getVideoTracks()) {
        track.enabled = false;
      }
      this.videoMuted = true;
    }

    // Attach Matrix listeners
    this.attachListeners();

    // Send m.call.member state event to announce our participation
    await this.sendMemberStateEvent();

    // Scan for existing members and connect to them
    await this.syncExistingMembers();

    this.setState("connected");
  }

  // -----------------------------------------------------------------------
  // Media acquisition
  // -----------------------------------------------------------------------

  private async acquireMedia(
    type: GroupCallType,
    audioDeviceId?: string,
    videoDeviceId?: string,
  ): Promise<void> {
    const constraints: MediaStreamConstraints = {
      audio: audioDeviceId ? { deviceId: { exact: audioDeviceId } } : true,
      video:
        type === "video" ? (videoDeviceId ? { deviceId: { exact: videoDeviceId } } : true) : false,
    };
    this.localStream = await navigator.mediaDevices.getUserMedia(constraints);
  }

  // -----------------------------------------------------------------------
  // m.call.member state event
  // -----------------------------------------------------------------------

  private async sendMemberStateEvent(): Promise<void> {
    const userId = this.client.getUserId() ?? "";
    const deviceId = this.client.getDeviceId() ?? "";

    const content: CallMemberContent = {
      "m.calls": [
        {
          "m.call_id": this.callId,
          "m.devices": [
            {
              device_id: deviceId,
              session_id: this.sessionId,
              feeds: [{ purpose: "m.usermedia" }],
            },
          ],
        },
      ],
      hand_raised: this.handRaised,
    };

    /* eslint-disable @typescript-eslint/no-explicit-any -- matrix-js-sdk sendStateEvent requires `any` for custom event types */
    await this.client.sendStateEvent(
      this.roomId,
      CALL_MEMBER_EVENT_TYPE as any,
      content as any,
      userId,
    );
    /* eslint-enable @typescript-eslint/no-explicit-any */
  }

  // -----------------------------------------------------------------------
  // Sync existing members from room state
  // -----------------------------------------------------------------------

  private async syncExistingMembers(): Promise<void> {
    const room = this.client.getRoom(this.roomId);
    if (!room) return;

    const myUserId = this.client.getUserId() ?? "";
    const stateEvents = room.currentState.getStateEvents(CALL_MEMBER_EVENT_TYPE);

    for (const event of stateEvents) {
      const sender = event.getStateKey() ?? event.getSender() ?? "";
      if (sender === myUserId) continue;

      const content = event.getContent() as CallMemberContent;
      if (!content["m.calls"]?.length) continue;

      for (const call of content["m.calls"]) {
        for (const device of call["m.devices"]) {
          const memberKey = `${sender}:${device.device_id}`;
          if (!this.peers.has(memberKey)) {
            await this.connectToPeer(sender, device.device_id, device.session_id, true);
          }
        }
      }
    }
  }

  // -----------------------------------------------------------------------
  // Peer connection management (mesh topology)
  // -----------------------------------------------------------------------

  private async connectToPeer(
    userId: string,
    deviceId: string,
    _destSessionId: string,
    isInitiator: boolean,
  ): Promise<void> {
    const memberKey = `${userId}:${deviceId}`;
    if (this.peers.has(memberKey)) return;

    const pc = new RTCPeerConnection({ iceServers: resolvedIceServers });

    const entry: PeerEntry = {
      userId,
      deviceId,
      pc,
      stream: null,
    };

    this.peers.set(memberKey, entry);

    // Add local tracks
    if (this.localStream) {
      for (const track of this.localStream.getTracks()) {
        pc.addTrack(track, this.localStream);
      }
    }

    // Handle incoming tracks
    pc.ontrack = (event) => {
      if (!entry.stream) {
        entry.stream = new MediaStream();
      }
      entry.stream.addTrack(event.track);

      // Update member record
      const member = this.members.get(memberKey);
      if (member) {
        member.stream = entry.stream;
      }
    };

    // Handle ICE candidates
    pc.onicecandidate = (event) => {
      if (event.candidate) {
        this.sendToDevice(userId, deviceId, "m.call.candidates", {
          call_id: this.callId,
          party_id: this.client.getDeviceId() ?? "",
          conf_id: this.callId,
          device_id: this.client.getDeviceId() ?? "",
          sender_session_id: this.sessionId,
          dest_session_id: _destSessionId,
          version: "1",
          candidates: [event.candidate.toJSON()],
        });
      }
    };

    // Handle connection state changes
    pc.oniceconnectionstatechange = () => {
      if (pc.iceConnectionState === "disconnected" || pc.iceConnectionState === "failed") {
        this.removePeer(memberKey);
      }
    };

    // Register member
    const member: GroupCallMember = {
      userId,
      deviceId,
      stream: undefined,
      audioMuted: false,
      videoMuted: false,
      handRaised: false,
    };
    this.members.set(memberKey, member);
    this.onMemberJoined?.(member);

    // If we're the initiator, create and send an offer
    if (isInitiator) {
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);

      await this.sendToDevice(userId, deviceId, "m.call.offer", {
        call_id: this.callId,
        party_id: this.client.getDeviceId() ?? "",
        conf_id: this.callId,
        device_id: this.client.getDeviceId() ?? "",
        sender_session_id: this.sessionId,
        dest_session_id: _destSessionId,
        version: "1",
        offer: { type: offer.type!, sdp: offer.sdp! },
        lifetime: 60000,
      });
    }
  }

  private removePeer(memberKey: string): void {
    const entry = this.peers.get(memberKey);
    if (!entry) return;

    entry.pc.onicecandidate = null;
    entry.pc.ontrack = null;
    entry.pc.oniceconnectionstatechange = null;
    entry.pc.close();
    this.peers.delete(memberKey);

    const member = this.members.get(memberKey);
    if (member) {
      this.members.delete(memberKey);
      this.onMemberLeft?.(member);
    }
  }

  // -----------------------------------------------------------------------
  // Signalling — to-device messages
  // -----------------------------------------------------------------------

  private async sendToDevice(
    userId: string,
    deviceId: string,
    eventType: string,
    content: Record<string, unknown>,
  ): Promise<void> {
    try {
      await this.client.sendToDevice(
        eventType,
        new Map([[userId, new Map([[deviceId, content]])]]),
      );
    } catch (err) {
      console.error(`[GroupCall] Failed to send ${eventType} to ${userId}:${deviceId}:`, err);
    }
  }

  // -----------------------------------------------------------------------
  // Handle incoming signalling messages
  // -----------------------------------------------------------------------

  private handleToDeviceEvent(event: MatrixEvent): void {
    if (this.isDestroyed) return;

    const type = event.getType();
    const content = event.getContent() as Record<string, unknown>;
    const sender = event.getSender() ?? "";
    const myUserId = this.client.getUserId() ?? "";

    if (sender === myUserId) return;

    switch (type) {
      case "m.call.offer":
        this.handleOffer(sender, content as unknown as OfferMessage);
        break;
      case "m.call.answer":
        this.handleAnswer(sender, content as unknown as AnswerMessage);
        break;
      case "m.call.candidates":
        this.handleCandidates(sender, content as unknown as CandidatesMessage);
        break;
    }
  }

  private async handleOffer(sender: string, msg: OfferMessage): Promise<void> {
    if (msg.conf_id !== this.callId && msg.call_id !== this.callId) return;

    const memberKey = `${sender}:${msg.device_id}`;

    // If no peer exists yet, create one (they are the initiator)
    if (!this.peers.has(memberKey)) {
      await this.connectToPeer(sender, msg.device_id, msg.sender_session_id, false);
    }

    const entry = this.peers.get(memberKey);
    if (!entry) return;

    await entry.pc.setRemoteDescription(new RTCSessionDescription(msg.offer));
    const answer = await entry.pc.createAnswer();
    await entry.pc.setLocalDescription(answer);

    await this.sendToDevice(sender, msg.device_id, "m.call.answer", {
      call_id: this.callId,
      party_id: this.client.getDeviceId() ?? "",
      conf_id: this.callId,
      device_id: this.client.getDeviceId() ?? "",
      sender_session_id: this.sessionId,
      dest_session_id: msg.sender_session_id,
      version: "1",
      answer: { type: answer.type!, sdp: answer.sdp! },
    });
  }

  private async handleAnswer(sender: string, msg: AnswerMessage): Promise<void> {
    if (msg.conf_id !== this.callId && msg.call_id !== this.callId) return;

    const memberKey = `${sender}:${msg.device_id}`;
    const entry = this.peers.get(memberKey);
    if (!entry) return;

    await entry.pc.setRemoteDescription(new RTCSessionDescription(msg.answer));
  }

  private async handleCandidates(sender: string, msg: CandidatesMessage): Promise<void> {
    if (msg.conf_id !== this.callId && msg.call_id !== this.callId) return;

    const memberKey = `${sender}:${msg.device_id}`;
    const entry = this.peers.get(memberKey);
    if (!entry) return;

    for (const candidate of msg.candidates) {
      if (entry.pc.remoteDescription) {
        await entry.pc.addIceCandidate(new RTCIceCandidate(candidate));
      }
    }
  }

  // -----------------------------------------------------------------------
  // Handle m.call.member state event changes
  // -----------------------------------------------------------------------

  private handleMemberStateEvent(event: MatrixEvent): void {
    if (this.isDestroyed) return;
    if (event.getType() !== CALL_MEMBER_EVENT_TYPE) return;

    const sender = event.getStateKey() ?? event.getSender() ?? "";
    const myUserId = this.client.getUserId() ?? "";
    if (sender === myUserId) return;

    const content = event.getContent() as CallMemberContent;
    const calls = content["m.calls"] ?? [];

    if (calls.length === 0) {
      // Member left — remove all peers for this user
      for (const [key] of this.peers) {
        if (key.startsWith(`${sender}:`)) {
          this.removePeer(key);
        }
      }
      return;
    }

    // Track hand raise state from the state event
    const handRaised = content["hand_raised"] === true;

    // Member joined — connect to their devices
    for (const call of calls) {
      for (const device of call["m.devices"]) {
        const memberKey = `${sender}:${device.device_id}`;
        if (!this.peers.has(memberKey)) {
          this.connectToPeer(sender, device.device_id, device.session_id, true);
        }

        // Update hand raise on existing members
        const member = this.members.get(memberKey);
        if (member && member.handRaised !== handRaised) {
          member.handRaised = handRaised;
          this.onHandRaiseChange?.(sender, handRaised);
        }
      }
    }
  }

  // -----------------------------------------------------------------------
  // Handle incoming room messages for reactions
  // -----------------------------------------------------------------------

  private handleRoomMessage(event: MatrixEvent): void {
    if (this.isDestroyed) return;
    if (event.getType() !== "m.room.message") return;

    const content = event.getContent() as Record<string, unknown>;
    const reactionData = content["rocks.openclaw.call_reaction"] as
      | { call_id: string; emoji: string }
      | undefined;
    if (!reactionData) return;
    if (reactionData.call_id !== this.callId) return;

    const sender = event.getSender() ?? "";
    const myUserId = this.client.getUserId() ?? "";
    if (sender === myUserId) return;

    this.onReaction?.(sender, reactionData.emoji);
  }

  // -----------------------------------------------------------------------
  // Matrix event listeners
  // -----------------------------------------------------------------------

  private attachListeners(): void {
    this.boundOnStateEvent = (event: MatrixEvent) => {
      this.handleMemberStateEvent(event);
    };
    this.boundOnToDevice = (event: MatrixEvent) => {
      this.handleToDeviceEvent(event);
    };
    this.boundOnTimeline = (event: MatrixEvent) => {
      this.handleRoomMessage(event);
    };

    this.client.on("RoomState.events" as Parameters<MatrixClient["on"]>[0], this.boundOnStateEvent);
    this.client.on("toDeviceEvent" as Parameters<MatrixClient["on"]>[0], this.boundOnToDevice);
    this.client.on("Room.timeline" as Parameters<MatrixClient["on"]>[0], this.boundOnTimeline);
  }

  private detachListeners(): void {
    if (this.boundOnStateEvent) {
      this.client.removeListener(
        "RoomState.events" as Parameters<MatrixClient["removeListener"]>[0],
        this.boundOnStateEvent,
      );
      this.boundOnStateEvent = null;
    }
    if (this.boundOnToDevice) {
      this.client.removeListener(
        "toDeviceEvent" as Parameters<MatrixClient["removeListener"]>[0],
        this.boundOnToDevice,
      );
      this.boundOnToDevice = null;
    }
    if (this.boundOnTimeline) {
      this.client.removeListener(
        "Room.timeline" as Parameters<MatrixClient["removeListener"]>[0],
        this.boundOnTimeline,
      );
      this.boundOnTimeline = null;
    }
  }

  // -----------------------------------------------------------------------
  // Cleanup helpers
  // -----------------------------------------------------------------------

  private cleanupPeers(): void {
    for (const [, entry] of this.peers) {
      entry.pc.onicecandidate = null;
      entry.pc.ontrack = null;
      entry.pc.oniceconnectionstatechange = null;
      entry.pc.close();
    }
    this.peers.clear();
  }

  private cleanupLocalMedia(): void {
    if (this.localStream) {
      for (const track of this.localStream.getTracks()) {
        track.stop();
      }
      this.localStream = null;
    }
  }
}

// ---------------------------------------------------------------------------
// AudioLevelMonitor — active speaker detection via Web Audio API
// ---------------------------------------------------------------------------

interface AudioLevelEntry {
  userId: string;
  analyser: AnalyserNode;
  source: MediaStreamAudioSourceNode;
  level: number;
}

export class AudioLevelMonitor {
  private audioContext: AudioContext | null = null;
  private entries: Map<string, AudioLevelEntry> = new Map();
  private activeSpeaker: string | null = null;
  private lastSpeakerChange: number = 0;
  private rafId: number = 0;
  private isRunning: boolean = false;

  /** Minimum time (ms) between active speaker changes. */
  private readonly debounceDuration = 500;

  /** Audio level threshold below which a user is considered silent. */
  private readonly silenceThreshold = 0.05;

  /** Callback invoked when the active speaker changes. */
  onActiveSpeakerChange: ((userId: string | null) => void) | null = null;

  private ensureAudioContext(): AudioContext {
    if (!this.audioContext) {
      this.audioContext = new AudioContext();
    }
    return this.audioContext;
  }

  /** Add a remote participant's audio stream to monitoring. */
  addStream(userId: string, stream: MediaStream): void {
    // Remove existing entry for this user if present
    this.removeStream(userId);

    const audioTracks = stream.getAudioTracks();
    if (audioTracks.length === 0) return;

    const ctx = this.ensureAudioContext();
    const source = ctx.createMediaStreamSource(stream);
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 256;
    analyser.smoothingTimeConstant = 0.5;
    source.connect(analyser);

    this.entries.set(userId, {
      userId,
      analyser,
      source,
      level: 0,
    });

    if (!this.isRunning && this.entries.size > 0) {
      this.start();
    }
  }

  /** Remove a participant's audio stream from monitoring. */
  removeStream(userId: string): void {
    const entry = this.entries.get(userId);
    if (!entry) return;

    entry.source.disconnect();
    this.entries.delete(userId);

    if (this.activeSpeaker === userId) {
      this.activeSpeaker = null;
      this.onActiveSpeakerChange?.(null);
    }

    if (this.entries.size === 0) {
      this.stop();
    }
  }

  /** Returns the userId of the current active speaker, or null. */
  getActiveSpeaker(): string | null {
    return this.activeSpeaker;
  }

  /** Returns current audio levels per user (0..1). */
  getAudioLevels(): Map<string, number> {
    const levels = new Map<string, number>();
    for (const [userId, entry] of this.entries) {
      levels.set(userId, entry.level);
    }
    return levels;
  }

  private start(): void {
    this.isRunning = true;
    this.tick();
  }

  private stop(): void {
    this.isRunning = false;
    if (this.rafId) {
      cancelAnimationFrame(this.rafId);
      this.rafId = 0;
    }
  }

  private tick = (): void => {
    if (!this.isRunning) return;

    const dataArray = new Uint8Array(128);
    let loudestUser: string | null = null;
    let loudestLevel = 0;

    for (const [userId, entry] of this.entries) {
      entry.analyser.getByteFrequencyData(dataArray);

      // Compute RMS-like level from frequency data (0..1)
      let sum = 0;
      for (let i = 0; i < dataArray.length; i++) {
        const normalized = dataArray[i] / 255;
        sum += normalized * normalized;
      }
      const rms = Math.sqrt(sum / dataArray.length);
      entry.level = rms;

      if (rms > loudestLevel && rms > this.silenceThreshold) {
        loudestLevel = rms;
        loudestUser = userId;
      }
    }

    // Debounce speaker changes
    const now = Date.now();
    if (loudestUser !== this.activeSpeaker) {
      if (now - this.lastSpeakerChange >= this.debounceDuration) {
        this.activeSpeaker = loudestUser;
        this.lastSpeakerChange = now;
        this.onActiveSpeakerChange?.(loudestUser);
      }
    }

    this.rafId = requestAnimationFrame(this.tick);
  };

  /** Tear down all resources. */
  destroy(): void {
    this.stop();
    for (const [, entry] of this.entries) {
      entry.source.disconnect();
    }
    this.entries.clear();
    this.activeSpeaker = null;
    this.onActiveSpeakerChange = null;

    if (this.audioContext) {
      this.audioContext.close().catch(() => {
        /* ignore */
      });
      this.audioContext = null;
    }
  }
}

// ---------------------------------------------------------------------------
// Utilities
// ---------------------------------------------------------------------------

function generateCallId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function generateSessionId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 12)}`;
}
