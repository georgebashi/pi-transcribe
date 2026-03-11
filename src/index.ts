1#BM:import { CustomEditor, type ExtensionAPI } from "@mariozechner/pi-coding-agent";
2#KM:
3#JH:import { DEFAULT_CONFIG } from "./config.js";
4#JY:import { AudioCapture } from "./audio.js";
5#NB:import { TranscriptionEngine } from "./recognizer.js";
6#BJ:import { DictationSession } from "./dictation.js";
7#HN:
8#MS:/** Number of rapid spaces needed to trigger recording */
9#SZ:const SPACE_TRIGGER_COUNT = 3;
10#JQ:/** Max time between spaces to count as "holding" (ms) */
11#RR:const SPACE_GAP_MS = 150;
12#TV:/** Time after last space to consider key released (ms) */
13#KP:const SPACE_RELEASE_MS = 200;
14#BY:
15#NP:export default function (pi: ExtensionAPI) {
16#QK:  const config = { ...DEFAULT_CONFIG };
17#HV:  let audioCapture: AudioCapture | null = null;
18#TN:  let dictation: DictationSession | null = null;
19#PQ:  let pvrecorderAvailable = true;
20#NS:  let currentCtx: any = null;
21#RJ:
22#PJ:  // Check pvrecorder availability
23#WJ:  try {
24#HB:    require("@picovoice/pvrecorder-node");
25#YH:  } catch {
26#YH:    pvrecorderAvailable = false;
27#PK:  }
28#HQ:
29#HS:  // --- Session lifecycle ---
30#ZM:
31#RS:  pi.on("session_start", async (_event, ctx) => {
32#NM:    currentCtx = ctx;
33#QY:
34#SM:    if (!pvrecorderAvailable) {
35#ST:      ctx.ui.notify(
36#PY:        "pi-transcribe: @picovoice/pvrecorder-node not available. Dictation disabled.",
37#JV:        "error"
38#ZN:      );
39#QM:      return;
40#KR:    }
41#BH:
42#PK:    // Install our custom editor that detects spacebar hold
43#JW:    ctx.ui.setEditorComponent((tui: any, theme: any, keybindings: any) => {
44#KY:      const editor = new DictationEditor(tui, theme, keybindings, {
45#NK:        onRecordingStart: () => startDictation(ctx, editor),
46#ZV:        onRecordingStop: () => stopDictation(ctx, editor),
47#WQ:        pvrecorderAvailable,
48#RN:      });
49#QJ:      return editor;
50#QX:    });
51#VJ:  });
52#NM:
53#KW:  pi.on("session_shutdown", async (_event, ctx) => {
54#YP:    if (dictation?.isActive) {
55#VV:      dictation.cancel(ctx);
56#TT:    }
57#TJ:    audioCapture = null;
58#KN:    dictation = null;
59#NN:    ctx.ui.setStatus("pi-transcribe", undefined);
60#TM:    ctx.ui.setWidget("pi-transcribe", undefined);
61#YH:    currentCtx = null;
62#QJ:  });
63#JN:
64#SR:  // --- Ctrl+Shift+R shortcut (still works as toggle) ---
65#PZ:
66#NP:  pi.registerShortcut("ctrl+shift+r", {
67#BY:    description: "Toggle speech-to-text dictation",
68#BP:    handler: async (ctx) => {
69#SM:      if (!pvrecorderAvailable) {
70#SM:        ctx.ui.notify("pi-transcribe: Audio capture not available.", "error");
71#QM:        return;
72#BK:      }
73#HV:
74#YP:      if (dictation?.isActive) {
75#TN:        await stopDictation(ctx);
76#QM:        return;
77#BZ:      }
78#PX:
79#JR:      await startDictation(ctx);
80#QB:    },
81#RK:  });
82#YR:
83#BP:  // --- Dictation control ---
84#WR:
85#MM:  async function startDictation(ctx: any, editor?: DictationEditor) {
86#TZ:    if (dictation?.isActive) return;
87#XB:
88#WJ:    try {
89#QX:      const engine = new TranscriptionEngine(config);
90#QT:
91#PR:      if (!audioCapture) {
92#MB:        audioCapture = new AudioCapture(config);
93#SH:      }
94#MS:
95#PH:      dictation = new DictationSession(audioCapture, engine, config);
96#KK:      dictation.start(ctx);
97#ZT:
98#YT:      ctx.ui.setStatus("pi-transcribe", "🎤 Recording");
99#BK:
100#QW:      // Widget shows live waveform
101#PK:      ctx.ui.setWidget("pi-transcribe", (tui: any, theme: any) => {
102#YJ:        if (dictation) {
103#XR:          dictation.setTui(tui);
104#VV:        }
105#VS:
106#VT:        return {
107#JT:          render: (width: number) => {
108#ZX:            if (!dictation) return [""];
109#BP:
110#PW:            const elapsed = dictation.getElapsedTime();
111#YB:            const label = "🎤 ";
112#VW:            const time = ` ${elapsed} `;
113#VT:            const hint = " ␣ release to transcribe · Esc cancel";
114#BJ:
115#SM:            const fixedWidth = label.length + time.length + hint.length + 2;
116#XY:            const barCount = Math.max(10, Math.min(50, width - fixedWidth));
117#XX:            const bars = dictation.getWaveformBars(barCount);
118#RM:
119#MY:            const waveStr = bars.map(bar =>
120#VR:              bar === " "
121#HN:                ? (theme?.fg?.("dim", bar) ?? bar)
122#BZ:                : (theme?.fg?.("accent", bar) ?? bar)
123#YX:            ).join("");
124#KZ:
125#PP:            const line = (theme?.fg?.("accent", label) ?? label)
126#RT:              + waveStr
127#SY:              + (theme?.fg?.("muted", time) ?? time)
128#HR:              + (theme?.fg?.("dim", hint) ?? hint);
129#HP:
130#VN:            return [line];
131#QV:          },
132#SV:          invalidate: () => {},
133#QW:        };
134#SR:      }, { placement: "belowEditor" });
135#JX:    } catch (e: any) {
136#NJ:      ctx.ui.notify(`Failed to start recording: ${e.message}`, "error");
137#TM:      ctx.ui.setWidget("pi-transcribe", undefined);
138#NN:      ctx.ui.setStatus("pi-transcribe", undefined);
139#KN:      dictation = null;
140#HP:    }
141#JJ:  }
142#HQ:
143#PJ:  async function stopDictation(ctx: any, editor?: DictationEditor) {
144#TV:    if (!dictation?.isActive) return;
145#VM:
146#VS:    ctx.ui.setStatus("pi-transcribe", "✨ Transcribing...");
147#YR:    ctx.ui.setWidget("pi-transcribe", (tui: any, theme: any) => ({
148#NY:      render: () => [theme?.fg?.("accent", "✨ Transcribing audio...") ?? "✨ Transcribing audio..."],
149#SV:      invalidate: () => {},
150#TY:    }), { placement: "belowEditor" });
151#HV:
152#WJ:    try {
153#PM:      const text = await dictation.stop(ctx);
154#QH:
155#QP:      // Insert transcribed text at cursor position (instead of appending to editor)
156#PN:      if (text && text.length > 0 && editor) {
157#RT:        editor.insertTextAtCursor(text);
158#RV:      }
159#JX:    } catch (e: any) {
160#WK:      ctx.ui.notify(`Transcription error: ${e.message}`, "error");
161#NZ:    }
162#VQ:
163#TM:    ctx.ui.setWidget("pi-transcribe", undefined);
164#NN:    ctx.ui.setStatus("pi-transcribe", undefined);
165#KN:    dictation = null;
166#JB:  }
167#QZ:
168#NJ:  // --- Escape handling ---
169#PN:
170#PT:  pi.registerShortcut("escape", {
171#PT:    description: "Cancel active dictation",
172#BP:    handler: async (ctx) => {
173#TV:      if (!dictation?.isActive) return;
174#VV:      dictation.cancel(ctx);
175#TM:      ctx.ui.setWidget("pi-transcribe", undefined);
176#NN:      ctx.ui.setStatus("pi-transcribe", undefined);
177#KN:      dictation = null;
178#NY:    },
179#YZ:  });
180#PM:}
181#WS:
182#NK:/**
183#SR: * Custom editor that detects spacebar hold-to-record.
184#RZ: *
185#SS: * When the user holds spacebar, rapid auto-repeat generates a stream of space characters.
186#BZ: * After SPACE_TRIGGER_COUNT rapid spaces (within SPACE_GAP_MS of each other),
187#MS: * we switch to recording mode and consume further spaces.
188#HW: * When spaces stop arriving (SPACE_RELEASE_MS timeout), we stop recording.
189#WV: */
190#KX:class DictationEditor extends CustomEditor {
  private lastSpaceTime = 0;
  private rapidCount = 0;
  private consecutiveSpaces = 0;
  private releaseTimer: ReturnType<typeof setTimeout> | null = null;
  private isRecording = false;
  private callbacks: {
    onRecordingStart: () => void;
    onRecordingStop: () => void;
    pvrecorderAvailable: boolean;
  };

  constructor(tui: any, theme: any, keybindings: any, callbacks: {
    onRecordingStart: () => void;
    onRecordingStop: () => void;
    pvrecorderAvailable: boolean;
  }) {
    super(tui, theme, keybindings);
    this.callbacks = callbacks;
  }

  handleInput(data: string): void {
    const now = Date.now();

    if (data === " ") {
      const gap = now - this.lastSpaceTime;
      this.lastSpaceTime = now;

      if (this.isRecording) {
        // Already recording — consume space, reset release timer
        this.clearReleaseTimer();
        this.releaseTimer = setTimeout(() => this.onSpaceRelease(), SPACE_RELEASE_MS);
        return;
      }

      // Track rapid spaces for trigger detection
      if (gap <= SPACE_GAP_MS && this.consecutiveSpaces > 0) {
        this.rapidCount++;
      } else {
        this.rapidCount = 1;
      }

      // Always insert the space immediately — no delay
      super.handleInput(data);
      this.consecutiveSpaces++;

      if (this.rapidCount >= SPACE_TRIGGER_COUNT) {
        // Trigger! Remove ALL consecutive trailing spaces and start recording
        const text = this.getText();
        const toRemove = Math.min(this.consecutiveSpaces, text.length);
        if (toRemove > 0 && text.slice(-toRemove) === " ".repeat(toRemove)) {
          this.setText(text.slice(0, -toRemove));
        }

        this.isRecording = true;
        this.consecutiveSpaces = 0;
        this.rapidCount = 0;

        this.callbacks.onRecordingStart();
        this.releaseTimer = setTimeout(() => this.onSpaceRelease(), SPACE_RELEASE_MS);
        return;
      }

      return;
    }

    // Non-space input — reset space tracking
    if (this.isRecording) {
      this.onSpaceRelease();
      return;
    }

    this.consecutiveSpaces = 0;
    this.rapidCount = 0;
    super.handleInput(data);
  }

  private onSpaceRelease(): void {
    if (!this.isRecording) return;
    this.isRecording = false;
    this.consecutiveSpaces = 0;
    this.rapidCount = 0;
    this.clearReleaseTimer();
    this.callbacks.onRecordingStop();
  }

  private clearReleaseTimer(): void {
    if (this.releaseTimer) {
      clearTimeout(this.releaseTimer);
      this.releaseTimer = null;
    }
  }
}
