/**
 * Autonomous Multi-Agent AI Research Assistant
 * Production-Ready Voice Assistant Controller for Search / Input Bar
 * Compatible with Brave Browser, Google Chrome, Safari, and Edge.
 */

(function () {
  "use strict";

  if (window.__voiceAssistantLoaded) {
    return;
  }
  window.__voiceAssistantLoaded = true;

  console.log("[Voice Assistant] Initializing Universal Voice Assistant for Search Bar...");

  // State
  let isListening = false;
  let audioContext = null;
  let mediaStream = null;
  let scriptProcessor = null;
  let analyserNode = null;
  let pcmChunks = [];
  let recordingSeconds = 0;
  let timerInterval = null;
  let silenceTimer = null;
  let lastVolumeTime = Date.now();
  let speechDetected = false;
  let activeUtterance = null;
  let isSpeaking = false;
  let accumulatedTranscript = "";
  let optionalSpeechRec = null;

  // Audio chimes
  function playAudioChime(type) {
    try {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (!AudioCtx) return;
      const ctx = new AudioCtx();
      const now = ctx.currentTime;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.connect(gain);
      gain.connect(ctx.destination);

      if (type === "start") {
        osc.type = "sine";
        osc.frequency.setValueAtTime(520, now);
        osc.frequency.exponentialRampToValueAtTime(780, now + 0.14);
        gain.gain.setValueAtTime(0.12, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.22);
        osc.start(now);
        osc.stop(now + 0.22);
      } else if (type === "stop") {
        osc.type = "sine";
        osc.frequency.setValueAtTime(650, now);
        osc.frequency.exponentialRampToValueAtTime(440, now + 0.16);
        gain.gain.setValueAtTime(0.1, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.24);
        osc.start(now);
        osc.stop(now + 0.24);
      }
    } catch (e) {
      // AudioContext policy
    }
  }

  // Force-update a React controlled input
  function updateInputValue(el, value, skipExternalBroadcast = false) {
    if (!el) return;
    const proto = Object.getPrototypeOf(el);
    const setter = Object.getOwnPropertyDescriptor(proto, "value")?.set;
    if (setter) {
      setter.call(el, value);
    } else {
      el.value = value;
    }
    if (el._valueTracker) {
      el._valueTracker.setValue("");
    }
    el.dispatchEvent(new Event("input", { bubbles: true }));
    el.dispatchEvent(new Event("change", { bubbles: true }));
    if (!skipExternalBroadcast) {
      try {
        window.dispatchEvent(
          new CustomEvent("nexus:external-input", { detail: { value: String(value || "") } })
        );
      } catch (e) {}
    }
  }

  // Find composer, input, submit button
  function getComposerElements() {
    const composer =
      document.getElementById("message-composer") ||
      document.getElementById("chat-input-container") ||
      document.querySelector("div[id*='composer']");

    const input =
      document.getElementById("chat-input") ||
      (composer ? composer.querySelector("textarea") : null);

    const submitBtn =
      document.getElementById("chat-submit") ||
      document.getElementById("submit-button") ||
      (composer
        ? composer.querySelector(
            "#chat-submit, button[id*='submit'], button[data-testid*='submit'], button[type='submit']"
          )
        : null);

    return { composer, input, submitBtn };
  }

  // Smooth Search Transition Choreography
  function triggerSmoothSearchTransition(rawQuery = "") {
    try {
      document.body.classList.add("nx-search-transitioning", "nx-chat-active");

      // Mount or restart sleek top progress bar
      let bar = document.getElementById("nx-search-transition-bar");
      if (!bar) {
        bar = document.createElement("div");
        bar.id = "nx-search-transition-bar";
        document.body.appendChild(bar);
      }
      bar.classList.remove("is-active");
      void bar.offsetWidth;
      bar.classList.add("is-active");

      // Smooth fade-and-lift on welcome hero if present
      const welcome = document.getElementById("welcome-screen") || document.querySelector(".welcome-screen");
      if (welcome) {
        welcome.classList.add("nx-welcome-exiting");
      }

      // Smoothly glide composer dock into view
      const { composer } = getComposerElements();
      if (composer) {
        composer.classList.add("nx-composer-dock-enter");
        setTimeout(() => composer.classList.remove("nx-composer-dock-enter"), 650);
      }

      setTimeout(() => {
        document.body.classList.remove("nx-search-transitioning");
        if (bar) bar.classList.remove("is-active");
      }, 1400);
    } catch (e) {}
  }

  window.__triggerSearchTransition = triggerSmoothSearchTransition;

  // Submit any prompt reliably through Chainlit's native composer
  function submitChainlitPrompt(rawQuery, source = "text") {
    const query = String(rawQuery || "").trim();
    if (!query) return false;

    window.__chainlitSubmittingUntil = Date.now() + 3000;
    const mount = document.getElementById("animated-ai-chat-mount");
    if (mount) {
      mount.style.display = "none";
    }

    const { composer, input, submitBtn } = getComposerElements();
    if (!input) return false;

    try {
      if (typeof clearRestoredChatView === "function") clearRestoredChatView();
      triggerSmoothSearchTransition(query);
      if (typeof HistoryManager !== "undefined" && HistoryManager.addSearch) {
        HistoryManager.addSearch(query, source);
        HistoryManager.addOrUpdateChat(query, "", "in_progress");
      }
    } catch (e) {}

    if (composer) {
      composer.style.visibility = "visible";
      composer.style.display = "";
      composer.style.opacity = "1";
      composer.style.pointerEvents = "auto";
      composer.style.position = "";
      composer.style.bottom = "";
      composer.style.left = "";
    }

    updateInputValue(input, query, true);
    input.focus();

    const tryClickSubmit = (attempt = 0) => {
      const { input: curInput, submitBtn: curBtn } = getComposerElements();
      if (curBtn && !curBtn.disabled) {
        curBtn.click();
        return;
      }
      if (attempt < 6) {
        setTimeout(() => tryClickSubmit(attempt + 1), 45);
      } else if (curInput) {
        curInput.dispatchEvent(
          new KeyboardEvent("keydown", {
            key: "Enter",
            code: "Enter",
            keyCode: 13,
            which: 13,
            bubbles: true,
            cancelable: true,
          })
        );
      }
    };

    setTimeout(() => tryClickSubmit(0), 35);
    return true;
  }

  window.__submitChainlitPrompt = submitChainlitPrompt;
  window.__syncChainlitInput = function (val) {
    const { input } = getComposerElements();
    if (input) {
      updateInputValue(input, val, true);
    }
  };

  // UI Icons
  const MIC_ICON_SVG = `
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
      <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z"></path>
      <path d="M19 10v2a7 7 0 0 1-14 0v-2"></path>
      <line x1="12" y1="19" x2="12" y2="22"></line>
    </svg>
  `;

  const STOP_ICON_SVG = `
    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
      <rect x="6" y="6" width="12" height="12" rx="2"></rect>
    </svg>
  `;

  // Helper to detect noise / empty strings
  function isNoiseText(text) {
    if (!text) return true;
    const t = String(text).trim();
    if (!t || t.length < 2) return true;
    if (t === "00:00") return true;
    if (/^<[^>]+>$/.test(t)) return true;
    if (/^(?:noise|silence|music|inaudible|whisper|unintelligible|static|cough|sigh)$/i.test(t)) return true;
    return false;
  }

  // Create or retrieve floating Voice Assistant HUD Modal
  function getOrCreateVoiceModal() {
    // Remove any legacy inline banner that might exist inside composer
    const oldBanner = document.getElementById("voice-assistant-banner");
    if (oldBanner) oldBanner.remove();

    let modal = document.getElementById("voice-assistant-modal");
    if (!modal) {
      modal = document.createElement("div");
      modal.id = "voice-assistant-modal";
      modal.className = "va-modal-overlay";
      modal.style.display = "none";
      modal.innerHTML = `
        <div class="va-modal-backdrop" id="va-backdrop"></div>
        <div class="va-modal-card" role="dialog" aria-modal="true" aria-label="Voice Search Assistant">
          <!-- Top Bar -->
          <div class="va-modal-header">
            <div class="va-badge-group">
              <div class="va-status-pill" id="va-status-pill">
                <span class="va-pulse-beacon"></span>
                <span class="va-status-label" id="va-status-badge">RECORDING</span>
              </div>
              <span class="va-timer-badge" id="va-timer">0:00</span>
            </div>
            <div class="va-brand-tag">
              <span>NexusAI Voice</span>
            </div>
            <button type="button" class="va-close-btn" id="va-action-cancel-top" title="Cancel (Esc)">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
                <line x1="18" y1="6" x2="6" y2="18"></line>
                <line x1="6" y1="6" x2="18" y2="18"></line>
              </svg>
            </button>
          </div>

          <!-- Center Stage: Orb & Dynamic Spectrum -->
          <div class="va-center-stage">
            <div class="va-orb-container">
              <div class="va-orb-ring ring-3"></div>
              <div class="va-orb-ring ring-2"></div>
              <div class="va-orb-ring ring-1"></div>
              <div class="va-center-orb" id="va-orb">
                <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z"></path>
                  <path d="M19 10v2a7 7 0 0 1-14 0v-2"></path>
                  <line x1="12" y1="19" x2="12" y2="22"></line>
                </svg>
              </div>
            </div>

            <div class="va-spectrum-bars" id="va-spectrum-container">
              <span class="va-bar"></span>
              <span class="va-bar"></span>
              <span class="va-bar"></span>
              <span class="va-bar"></span>
              <span class="va-bar"></span>
              <span class="va-bar"></span>
              <span class="va-bar"></span>
              <span class="va-bar"></span>
              <span class="va-bar"></span>
              <span class="va-bar"></span>
              <span class="va-bar"></span>
            </div>

            <div class="va-stage-instruction" id="va-status-text">
              Listening... Speak your research topic
            </div>
          </div>

          <!-- Live Transcript Preview Card -->
          <div class="va-transcript-card">
            <div class="va-transcript-header">
              <span class="va-transcript-badge">LIVE TRANSCRIPT</span>
              <span class="va-transcript-hint" id="va-transcript-hint">Speak clearly into your microphone</span>
            </div>
            <div class="va-transcript-body" id="va-preview-box">
              <span id="va-confirmed-text" class="va-text-confirmed"></span><span id="va-interim-text" class="va-text-interim">Say anything (e.g. "Break down FlashAttention-3 architecture and speedups")...</span>
            </div>
          </div>

          <!-- Footer Controls -->
          <div class="va-modal-footer">
            <div class="va-kbd-hints">
              <span class="va-kbd">esc</span> to cancel
              <span class="va-kbd-divider">•</span>
              <span class="va-kbd">enter</span> to search
            </div>
            <div class="va-footer-actions">
              <button type="button" class="va-btn-pill va-btn-cancel" id="va-action-cancel">
                Cancel
              </button>
              <button type="button" class="va-btn-pill va-btn-done" id="va-action-done">
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round">
                  <polyline points="20 6 9 17 4 12"></polyline>
                </svg>
                Done & Search
              </button>
            </div>
          </div>
        </div>
      `;

      document.body.appendChild(modal);

      modal.querySelector("#va-backdrop")?.addEventListener("click", (e) => {
        e.preventDefault();
        stopVoiceRecognition(false, true);
      });

      modal.querySelector("#va-action-cancel-top")?.addEventListener("click", (e) => {
        e.preventDefault();
        stopVoiceRecognition(false, true);
      });

      modal.querySelector("#va-action-cancel")?.addEventListener("click", (e) => {
        e.preventDefault();
        stopVoiceRecognition(false, true);
      });

      modal.querySelector("#va-action-done")?.addEventListener("click", (e) => {
        e.preventDefault();
        stopVoiceRecognition(true, false);
      });
    }
    return modal;
  }

  function getOrCreateBanner() {
    return getOrCreateVoiceModal();
  }

  function showVoiceModal() {
    const modal = getOrCreateVoiceModal();
    modal.style.display = "flex";
    requestAnimationFrame(() => {
      modal.classList.add("va-active");
    });
    return modal;
  }

  function hideVoiceModal() {
    const modal = document.getElementById("voice-assistant-modal");
    if (!modal) return;
    modal.classList.remove("va-active");
    setTimeout(() => {
      if (!isListening) {
        modal.style.display = "none";
      }
    }, 220);
  }

  // Update transcript text preview inside modal
  function updateBannerPreview(finalText, interimText) {
    const confirmedEl = document.getElementById("va-confirmed-text");
    const interimEl = document.getElementById("va-interim-text");
    if (confirmedEl) confirmedEl.textContent = finalText ? finalText + " " : "";
    if (interimEl) {
      interimEl.textContent =
        interimText ||
        (finalText ? "" : 'Say anything (e.g. "Break down FlashAttention-3 architecture and speedups")...');
      if (interimText) {
        interimEl.classList.add("va-has-text");
      } else {
        interimEl.classList.remove("va-has-text");
      }
    }
  }

  // Animate 11-bar waveform spectrum & central orb to real voice volume
  function updateVisualizer(volumeRms) {
    const waveBars = document.querySelectorAll("#va-spectrum-container .va-bar");
    const centerOrb = document.getElementById("va-orb");
    if (centerOrb) {
      const scale = Math.min(1.24, 1 + volumeRms * 1.4);
      centerOrb.style.transform = `scale(${scale.toFixed(3)})`;
      centerOrb.style.boxShadow = `0 0 ${(20 + volumeRms * 75).toFixed(0)}px rgba(244, 63, 94, ${Math.min(0.95, 0.45 + volumeRms * 1.2).toFixed(2)}), inset 0 2px 4px rgba(255, 255, 255, 0.35)`;
    }
    if (!waveBars || waveBars.length === 0) return;
    const multipliers = [0.32, 0.52, 0.78, 1.08, 1.38, 1.65, 1.38, 1.08, 0.78, 0.52, 0.32];
    waveBars.forEach((bar, idx) => {
      const mult = multipliers[idx] || 1;
      const h = Math.min(54, Math.max(6, volumeRms * 310 * mult));
      bar.style.height = `${h.toFixed(1)}px`;
    });
  }

  // Keyboard shortcut handler while Voice Modal is active
  function handleVoiceKeydown(e) {
    if (!isListening) return;
    if (e.key === "Escape") {
      e.preventDefault();
      e.stopPropagation();
      stopVoiceRecognition(false, true);
    } else if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      e.stopPropagation();
      stopVoiceRecognition(true, false);
    }
  }

  // ─────────────────── Universal MediaRecorder Voice Assistant ───────────────────
  let mediaRecorder = null;
  let recordedAudioChunks = [];
  let visualizerInterval = null;

  function getSupportedAudioMimeType() {
    if (typeof MediaRecorder === "undefined") return "";
    const types = [
      "audio/webm;codecs=opus",
      "audio/webm",
      "audio/mp4",
      "audio/ogg;codecs=opus",
      "audio/wav",
    ];
    for (const t of types) {
      if (MediaRecorder.isTypeSupported(t)) return t;
    }
    return "";
  }

  function cleanupMediaStream() {
    if (mediaStream) {
      mediaStream.getTracks().forEach((track) => track.stop());
      mediaStream = null;
    }
    if (visualizerInterval) {
      clearInterval(visualizerInterval);
      visualizerInterval = null;
    }
    if (audioContext) {
      try { audioContext.close(); } catch (e) {}
      audioContext = null;
    }
  }

  // Start Universal Voice Assistant
  async function startVoiceRecognition() {
    const { input } = getComposerElements();
    const animatedTextarea = document.querySelector("#animated-ai-chat-mount textarea");

    // Close any open popovers/dropdowns so UI is clean
    try {
      if (typeof toggleQuickSearchDropdown === "function") toggleQuickSearchDropdown(true);
      if (typeof closeAttachCategoryMenu === "function") closeAttachCategoryMenu();
    } catch (e) {}

    const micBtn = document.getElementById("voice-assistant-mic-btn");
    showVoiceModal();

    const statusPill = document.getElementById("va-status-pill");
    const statusBadge = document.getElementById("va-status-badge");
    const statusText = document.getElementById("va-status-text");
    const transcriptHint = document.getElementById("va-transcript-hint");
    const timerEl = document.getElementById("va-timer");

    const currentVal = (animatedTextarea && animatedTextarea.value) || (input && input.value) || "";
    accumulatedTranscript = currentVal.trim();
    recordedAudioChunks = [];
    recordingSeconds = 0;
    speechDetected = false;
    lastVolumeTime = Date.now();

    if (statusPill) statusPill.className = "va-status-pill";
    if (statusBadge) statusBadge.textContent = "CONNECTING";
    if (statusText) statusText.textContent = "Requesting microphone access...";
    if (transcriptHint) transcriptHint.textContent = "Speak clearly into your microphone";
    if (timerEl) timerEl.textContent = "0:00";
    updateBannerPreview(accumulatedTranscript, "");
    updateVisualizer(0.01);

    // Request microphone access
    try {
      mediaStream = await navigator.mediaDevices.getUserMedia({
        audio: {
          channelCount: 1,
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });
    } catch (err) {
      console.error("[Voice Assistant] Microphone permission error:", err);
      if (statusPill) statusPill.className = "va-status-pill va-error";
      if (statusBadge) statusBadge.textContent = "BLOCKED";
      if (statusText) {
        statusText.textContent = "Microphone access blocked. Allow microphone in your browser address bar.";
      }
      updateBannerPreview("", "Click the lock/tune icon in your address bar and set Microphone to Allow.");
      setTimeout(() => {
        if (!isListening) hideVoiceModal();
      }, 4500);
      return;
    }

    isListening = true;
    window.addEventListener("keydown", handleVoiceKeydown, true);

    if (micBtn) {
      micBtn.classList.add("is-recording");
      micBtn.innerHTML = STOP_ICON_SVG;
      micBtn.setAttribute("title", "Click to stop listening");
    }

    if (statusPill) statusPill.className = "va-status-pill";
    if (statusBadge) statusBadge.textContent = "RECORDING";
    if (statusText) statusText.textContent = "Listening... Speak your research topic";
    updateBannerPreview(accumulatedTranscript, "");

    playAudioChime("start");

    // Start timer
    timerInterval = setInterval(() => {
      recordingSeconds++;
      const mins = Math.floor(recordingSeconds / 60);
      const secs = recordingSeconds % 60;
      const tEl = document.getElementById("va-timer");
      if (tEl) {
        tEl.textContent = `${mins}:${secs < 10 ? "0" : ""}${secs}`;
      }
      if (recordingSeconds >= 45) {
        stopVoiceRecognition(true);
      }
    }, 1000);

    // 1. Initialize native MediaRecorder (immune to Brave AudioContext farbling)
    try {
      const mimeType = getSupportedAudioMimeType();
      const options = mimeType ? { mimeType } : undefined;
      mediaRecorder = new MediaRecorder(mediaStream, options);
      recordedAudioChunks = [];

      mediaRecorder.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) {
          recordedAudioChunks.push(e.data);
        }
      };

      mediaRecorder.start(200);
    } catch (recorderErr) {
      console.warn("[Voice Assistant] MediaRecorder init fallback:", recorderErr);
    }

    // 2. Initialize AnalyserNode solely for live volume waveform (NO speaker destination)
    try {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (AudioCtx) {
        audioContext = new AudioCtx();
        const source = audioContext.createMediaStreamSource(mediaStream);
        analyserNode = audioContext.createAnalyser();
        analyserNode.fftSize = 64;
        source.connect(analyserNode);

        const dataArray = new Uint8Array(analyserNode.frequencyBinCount);
        visualizerInterval = setInterval(() => {
          if (!isListening || !analyserNode) return;
          analyserNode.getByteFrequencyData(dataArray);
          let sum = 0;
          for (let i = 0; i < dataArray.length; i++) {
            sum += dataArray[i];
          }
          const rms = sum / dataArray.length / 255;
          updateVisualizer(rms);

          if (rms > 0.04) {
            speechDetected = true;
            lastVolumeTime = Date.now();
          } else if (speechDetected && Date.now() - lastVolumeTime > 3800 && recordingSeconds >= 3) {
            stopVoiceRecognition(false);
          }
        }, 70);
      }
    } catch (audioErr) {
      console.warn("[Voice Assistant] Visualizer metering notice:", audioErr);
    }

    // 3. Optional: Start Web Speech API in background for live preview if browser supports it
    const SpeechRec = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (SpeechRec) {
      try {
        optionalSpeechRec = new SpeechRec();
        optionalSpeechRec.continuous = true;
        optionalSpeechRec.interimResults = true;
        optionalSpeechRec.lang = "en-US";

        optionalSpeechRec.onresult = (e) => {
          let interim = "";
          for (let i = e.resultIndex; i < e.results.length; ++i) {
            const transcript = e.results[i][0].transcript;
            if (e.results[i].isFinal) {
              accumulatedTranscript += (accumulatedTranscript ? " " : "") + transcript.trim();
            } else {
              interim += transcript;
            }
          }
          const full = accumulatedTranscript + (interim ? " " + interim : "");
          updateInputValue(input, full);
          updateBannerPreview(accumulatedTranscript, interim);
        };

        optionalSpeechRec.onerror = () => {};
        optionalSpeechRec.start();
      } catch (e) {}
    }
  }

  // Stop recognition and process audio with Google Gemini
  async function stopVoiceRecognition(shouldSubmit = false, cancelled = false) {
    if (!isListening) return;
    isListening = false;
    window.removeEventListener("keydown", handleVoiceKeydown, true);

    clearInterval(timerInterval);
    clearTimeout(silenceTimer);
    if (visualizerInterval) {
      clearInterval(visualizerInterval);
      visualizerInterval = null;
    }

    updateVisualizer(0.01);

    const micBtn = document.getElementById("voice-assistant-mic-btn");
    const statusPill = document.getElementById("va-status-pill");
    const statusBadge = document.getElementById("va-status-badge");
    const statusText = document.getElementById("va-status-text");
    const transcriptHint = document.getElementById("va-transcript-hint");

    if (micBtn) {
      micBtn.classList.remove("is-recording");
      micBtn.innerHTML = MIC_ICON_SVG;
      micBtn.setAttribute("title", "Voice Assistant (Click to Speak)");
    }

    playAudioChime("stop");

    if (optionalSpeechRec) {
      try {
        optionalSpeechRec.stop();
      } catch (e) {}
      optionalSpeechRec = null;
    }

    if (cancelled) {
      hideVoiceModal();
      if (mediaRecorder && mediaRecorder.state !== "inactive") {
        try { mediaRecorder.stop(); } catch (e) {}
      }
      cleanupMediaStream();
      return;
    }

    // Wait for MediaRecorder to finish encoding chunks
    let audioBlob = null;
    let actualMime = "audio/webm";

    if (mediaRecorder && mediaRecorder.state !== "inactive") {
      audioBlob = await new Promise((resolve) => {
        mediaRecorder.onstop = () => {
          actualMime = mediaRecorder.mimeType || getSupportedAudioMimeType() || "audio/webm";
          const blob = new Blob(recordedAudioChunks, { type: actualMime });
          resolve(blob);
        };
        try {
          mediaRecorder.stop();
        } catch (e) {
          resolve(new Blob(recordedAudioChunks, { type: "audio/webm" }));
        }
      });
    } else if (recordedAudioChunks.length > 0) {
      actualMime = getSupportedAudioMimeType() || "audio/webm";
      audioBlob = new Blob(recordedAudioChunks, { type: actualMime });
    }

    cleanupMediaStream();

    // Verify audio data
    if (!audioBlob || audioBlob.size < 400) {
      if (statusPill) statusPill.className = "va-status-pill va-error";
      if (statusBadge) statusBadge.textContent = "TOO SHORT";
      if (statusText) statusText.textContent = "Audio clip was too short. Speak clearly and try again.";
      setTimeout(() => {
        if (!isListening) hideVoiceModal();
      }, 2000);
      return;
    }

    if (statusPill) statusPill.className = "va-status-pill va-processing";
    if (statusBadge) statusBadge.textContent = "TRANSCRIBING";
    if (statusText) statusText.textContent = "Transcribing speech with Google Gemini...";
    if (transcriptHint) transcriptHint.textContent = "Processing high-accuracy audio...";
    updateBannerPreview(accumulatedTranscript, "Synthesizing your voice input...");

    const ext = actualMime.includes("mp4") ? "mp4" : actualMime.includes("ogg") ? "ogg" : "webm";
    const formData = new FormData();
    formData.append("file", audioBlob, `voice_input.${ext}`);

    try {
      const resp = await fetch("/api/voice/transcribe", {
        method: "POST",
        body: formData,
      });
      const data = await resp.json();
      const cleanText = data && data.text ? data.text.trim() : "";
      const finalSpeech = !isNoiseText(cleanText)
        ? cleanText
        : !isNoiseText(accumulatedTranscript)
        ? accumulatedTranscript
        : "";

      if (finalSpeech) {
        const { input } = getComposerElements();
        const fullText =
          accumulatedTranscript &&
          finalSpeech !== accumulatedTranscript &&
          !finalSpeech.toLowerCase().includes(accumulatedTranscript.toLowerCase())
            ? accumulatedTranscript + " " + finalSpeech
            : finalSpeech;
        if (input) updateInputValue(input, fullText);
        try {
          window.dispatchEvent(
            new CustomEvent("nexus:external-input", { detail: { value: fullText } })
          );
        } catch (e) {}
        updateBannerPreview(fullText, "");
        if (statusPill) statusPill.className = "va-status-pill va-success";
        if (statusBadge) statusBadge.textContent = "READY";
        if (statusText) statusText.textContent = "Transcribed successfully";
        if (transcriptHint) transcriptHint.textContent = "Inserted into prompt composer";

        setTimeout(() => {
          if (!isListening) hideVoiceModal();
        }, 650);

        if (shouldSubmit && fullText.trim().length > 0) {
          setTimeout(() => {
            submitChainlitPrompt(fullText, "voice");
          }, 550);
        }
      } else {
        if (statusPill) statusPill.className = "va-status-pill va-error";
        if (statusBadge) statusBadge.textContent = "NO SPEECH";
        if (statusText) {
          statusText.textContent = "No clear speech detected. Please speak closer to your microphone.";
        }
        updateBannerPreview(accumulatedTranscript, "Could not hear clear words. Click the mic to try again.");
        setTimeout(() => {
          if (!isListening) hideVoiceModal();
        }, 2500);
      }
    } catch (fetchErr) {
      console.error("[Voice Assistant] Gemini STT error:", fetchErr);
      if (!isNoiseText(accumulatedTranscript)) {
        const { input } = getComposerElements();
        if (input) updateInputValue(input, accumulatedTranscript);
        hideVoiceModal();
        if (shouldSubmit) {
          setTimeout(() => submitChainlitPrompt(accumulatedTranscript, "voice"), 400);
        }
        return;
      }
      if (statusPill) statusPill.className = "va-status-pill va-error";
      if (statusBadge) statusBadge.textContent = "ERROR";
      if (statusText) statusText.textContent = "Transcription service unavailable. Please try again.";
      setTimeout(() => {
        if (!isListening) hideVoiceModal();
      }, 2400);
    }
  }

  function toggleVoiceAssistant() {
    if (isListening) {
      stopVoiceRecognition(true, false);
    } else {
      startVoiceRecognition();
    }
  }
  window.__toggleVoiceAssistant = toggleVoiceAssistant;

  // Text-To-Speech: Read aloud assistant responses
  function readAloud(text, buttonEl) {
    if (!("speechSynthesis" in window)) return;

    if (isSpeaking) {
      window.speechSynthesis.cancel();
      isSpeaking = false;
      document.querySelectorAll(".va-read-aloud-btn").forEach((b) => {
        b.classList.remove("is-speaking");
        b.innerHTML = `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"></polygon><path d="M15.54 8.46a5 5 0 0 1 0 7.07"></path></svg> <span>Read Aloud</span>`;
      });
      return;
    }

    const cleanText = text
      .replace(/\[\^?\d+\](?:\([^)]*\))?/g, "")
      .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
      .replace(/[#*`_~]/g, "")
      .replace(/\n+/g, ". ")
      .slice(0, 1600);

    activeUtterance = new SpeechSynthesisUtterance(cleanText);
    activeUtterance.rate = 1.02;
    activeUtterance.pitch = 1.0;

    const voices = window.speechSynthesis.getVoices();
    const preferredVoice = voices.find(
      (v) => (v.name.includes("Natural") || v.name.includes("Google") || v.name.includes("Samantha") || v.name.includes("Daniel")) && v.lang.startsWith("en")
    );
    if (preferredVoice) activeUtterance.voice = preferredVoice;

    buttonEl.classList.add("is-speaking");
    buttonEl.innerHTML = `<span>⏹️</span> <span>Stop Reading</span>`;
    isSpeaking = true;

    activeUtterance.onend = () => {
      isSpeaking = false;
      buttonEl.classList.remove("is-speaking");
      buttonEl.innerHTML = `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"></polygon><path d="M15.54 8.46a5 5 0 0 1 0 7.07"></path></svg> <span>Read Aloud</span>`;
    };

    activeUtterance.onerror = () => {
      isSpeaking = false;
      buttonEl.classList.remove("is-speaking");
      buttonEl.innerHTML = `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"></polygon><path d="M15.54 8.46a5 5 0 0 1 0 7.07"></path></svg> <span>Read Aloud</span>`;
    };

    window.speechSynthesis.speak(activeUtterance);
  }

  // Add Read Aloud buttons to assistant responses
  function injectReadAloudButtons() {
    const assistantBubbles = document.querySelectorAll(
      ".message-content, [class*='markdown']"
    );
    assistantBubbles.forEach((bubble) => {
      if (bubble.querySelector(".va-read-aloud-btn")) return;
      if (bubble.closest("#welcome-screen") || bubble.closest("[class*='welcome']") || bubble.closest(".starter")) return;
      const text = bubble.innerText.trim();
      if (text.includes("Multi-Agent Autonomous Research Assistant") || text.includes("What would you like to research today?")) {
        return;
      }
      if (text.length > 250 && (text.includes("Synthesis") || text.includes("Report") || text.includes("Findings") || text.includes("References") || text.includes("Analysis") || text.includes("Executive Summary"))) {
        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = "va-read-aloud-btn";
        btn.innerHTML = `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"></polygon><path d="M15.54 8.46a5 5 0 0 1 0 7.07"></path></svg> <span>Read Aloud</span>`;
        btn.addEventListener("click", () => readAloud(text, btn));
        bubble.appendChild(btn);
      }
    });
  }

  // Create Microphone Button element
  function createMicButton() {
    const micBtn = document.createElement("button");
    micBtn.type = "button";
    micBtn.id = "voice-assistant-mic-btn";
    micBtn.setAttribute("title", "Voice Assistant (Click to Speak)");
    micBtn.setAttribute("aria-label", "Voice Assistant");
    micBtn.innerHTML = MIC_ICON_SVG;

    micBtn.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      toggleVoiceAssistant();
    });

    return micBtn;
  }

  // ─────────────────── Search History & Chat History Manager ───────────────────
  const HISTORY_SEARCH_KEY = "research_search_history";
  const HISTORY_CHAT_KEY = "research_chat_history";

  const DEFAULT_SEARCHES = [
    {
      id: "sh_default_1",
      query: "Explain FlashAttention-3 architectural improvements, hardware asynchrony, and FP8 acceleration.",
      timestamp: Date.now() - 1000 * 60 * 18,
      source: "starter",
      count: 2
    },
    {
      id: "sh_default_2",
      query: "What are the trade-offs of Test-Time Compute vs Pre-training scaling in Large Language Models?",
      timestamp: Date.now() - 1000 * 60 * 45,
      source: "text",
      count: 1
    },
    {
      id: "sh_default_3",
      query: "Recent breakthroughs in CRISPR-Cas9 prime editing mechanisms and clinical delivery systems.",
      timestamp: Date.now() - 1000 * 60 * 120,
      source: "voice",
      count: 1
    }
  ];

  const DEFAULT_CHATS = [
    {
      id: "chat_default_1",
      query: "Explain FlashAttention-3 architectural improvements, hardware asynchrony, and FP8 acceleration.",
      title: "FlashAttention-3 Architecture & Hardware Asynchrony",
      timestamp: Date.now() - 1000 * 60 * 18,
      updatedAt: Date.now() - 1000 * 60 * 17,
      preview: "FlashAttention-3 exploits Hopper architecture tensor cores with warp-specialization and ping-pong GEMM scheduling, delivering up to 1.5-2.0x speedups over FlashAttention-2...",
      fullReport: "### Executive Summary\nFlashAttention-3 leverages NVIDIA Hopper GPU architecture features, introducing asynchronous tensor memory transfers (TMA), warp specialization, and FP8 low-precision tensor operations.\n\n### Key Architectural Pillars\n1. **Hardware Asynchrony**: Overlaps GEMM and softmax computation.\n2. **Warp Specialization**: Separates producer and consumer warps to prevent execution stall.\n3. **FP8 GEMM Scaling**: Maintains numerical stability via per-block quantization.",
      status: "completed"
    },
    {
      id: "chat_default_2",
      query: "What are the trade-offs of Test-Time Compute vs Pre-training scaling in Large Language Models?",
      title: "Test-Time Compute vs Pre-training Scaling Trade-offs",
      timestamp: Date.now() - 1000 * 60 * 45,
      updatedAt: Date.now() - 1000 * 60 * 43,
      preview: "Analysis of inference compute budgeting (Monte Carlo Tree Search, Best-of-N, Beam Search, and iterative verification) compared with standard parameter scaling laws...",
      fullReport: "### Test-Time Compute Analysis\nInvestigating scaling inference-time computation shows exponential problem-solving gains on mathematical and code benchmarks without requiring larger parameter sizes.",
      status: "completed"
    }
  ];

  const HistoryManager = {
    getSearches() {
      try {
        const raw = localStorage.getItem(HISTORY_SEARCH_KEY);
        if (!raw) {
          localStorage.setItem(HISTORY_SEARCH_KEY, JSON.stringify(DEFAULT_SEARCHES));
          return DEFAULT_SEARCHES;
        }
        const parsed = JSON.parse(raw) || [];
        const cleaned = parsed.filter((item) => !isNoiseText(item.query));
        if (cleaned.length !== parsed.length) {
          this.saveSearches(cleaned);
        }
        return cleaned;
      } catch (e) {
        return DEFAULT_SEARCHES;
      }
    },

    saveSearches(list) {
      try {
        localStorage.setItem(HISTORY_SEARCH_KEY, JSON.stringify(list.slice(0, 60)));
      } catch (e) {}
    },

    addSearch(query, source = "text") {
      const q = (query || "").trim();
      if (!q || isNoiseText(q)) return;
      const list = this.getSearches();
      const existingIdx = list.findIndex((item) => item.query.toLowerCase() === q.toLowerCase());
      if (existingIdx !== -1) {
        const item = list.splice(existingIdx, 1)[0];
        item.timestamp = Date.now();
        item.source = source;
        item.count = (item.count || 1) + 1;
        list.unshift(item);
      } else {
        list.unshift({
          id: "sh_" + Date.now() + "_" + Math.random().toString(36).substring(2, 6),
          query: q,
          timestamp: Date.now(),
          source: source,
          count: 1
        });
      }
      this.saveSearches(list);
      updateHistoryBadge();
    },

    removeSearch(id) {
      const list = this.getSearches().filter((item) => item.id !== id);
      this.saveSearches(list);
      updateHistoryBadge();
    },

    clearSearches() {
      this.saveSearches([]);
      updateHistoryBadge();
    },

    getChats() {
      try {
        const raw = localStorage.getItem(HISTORY_CHAT_KEY);
        if (!raw) {
          localStorage.setItem(HISTORY_CHAT_KEY, JSON.stringify(DEFAULT_CHATS));
          return DEFAULT_CHATS;
        }
        const parsed = JSON.parse(raw) || [];
        const cleaned = parsed.filter((c) => !isNoiseText(c.query) && !isNoiseText(c.title));
        if (cleaned.length !== parsed.length) {
          this.saveChats(cleaned);
        }
        return cleaned;
      } catch (e) {
        return DEFAULT_CHATS;
      }
    },

    saveChats(list) {
      try {
        localStorage.setItem(HISTORY_CHAT_KEY, JSON.stringify(list.slice(0, 40)));
      } catch (e) {}
    },

    addOrUpdateChat(query, answerText = "", status = "completed", fullHtml = "") {
      const q = (query || "").trim();
      if (!q || isNoiseText(q)) return;
      const list = this.getChats();
      const title = q.length > 55 ? q.slice(0, 55) + "…" : q;
      const existingIdx = list.findIndex((c) => c.query.toLowerCase() === q.toLowerCase());
      
      const snippet = answerText
        ? answerText.replace(/[#*`_~]/g, "").slice(0, 220) + (answerText.length > 220 ? "…" : "")
        : "Autonomous multi-agent research inquiry initiated...";

      if (existingIdx !== -1) {
        list[existingIdx].updatedAt = Date.now();
        if (answerText) {
          list[existingIdx].preview = snippet;
          list[existingIdx].fullReport = answerText;
          if (fullHtml) list[existingIdx].fullHtml = fullHtml;
          list[existingIdx].status = status;
        }
        const updated = list.splice(existingIdx, 1)[0];
        list.unshift(updated);
      } else {
        list.unshift({
          id: "chat_" + Date.now() + "_" + Math.random().toString(36).substring(2, 6),
          query: q,
          title: title,
          timestamp: Date.now(),
          updatedAt: Date.now(),
          preview: snippet,
          fullReport: answerText || "",
          fullHtml: fullHtml || "",
          status: status
        });
      }
      this.saveChats(list);
      updateHistoryBadge();
    },

    removeChat(id) {
      const list = this.getChats().filter((item) => item.id !== id);
      this.saveChats(list);
      updateHistoryBadge();
    },

    clearChats() {
      this.saveChats([]);
      updateHistoryBadge();
    },

    exportAll() {
      const data = {
        searches: this.getSearches(),
        chats: this.getChats(),
        exportedAt: new Date().toISOString(),
        system: "Autonomous Multi-Agent AI Research Assistant"
      };
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `research_history_${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
    }
  };

  function formatTimeAgo(ts) {
    const diff = Math.max(0, Date.now() - ts);
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return "Just now";
    if (mins < 60) return `${mins}m ago`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    if (days === 1) return "Yesterday";
    if (days < 7) return `${days}d ago`;
    return new Date(ts).toLocaleDateString(undefined, { month: "short", day: "numeric" });
  }

  // Icons
  const HISTORY_ICON_SVG = `
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <circle cx="12" cy="12" r="10"></circle>
      <polyline points="12 6 12 12 16 14"></polyline>
    </svg>
  `;

  const SEARCH_ICON_SVG = `
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <circle cx="11" cy="11" r="8"></circle>
      <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
    </svg>
  `;

  const TRASH_ICON_SVG = `
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <polyline points="3 6 5 6 21 6"></polyline>
      <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
    </svg>
  `;

  const CLOSE_ICON_SVG = `
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <line x1="18" y1="6" x2="6" y2="18"></line>
      <line x1="6" y1="6" x2="18" y2="18"></line>
    </svg>
  `;

  let activeHistoryTab = "search"; // "search" | "chat"
  let historySearchFilter = "";
  let activeRestoredChatId = null;

  function updateHistoryBadge() {
    const searches = HistoryManager.getSearches().length;
    const chats = HistoryManager.getChats().length;
    const badge = document.getElementById("history-drawer-counter");
    if (badge) badge.textContent = String(searches + chats);
    const headerCounter = document.getElementById("header-history-counter");
    if (headerCounter) {
      headerCounter.textContent = String(chats);
      headerCounter.style.display = chats > 0 ? "inline-flex" : "none";
    }
    try { renderActiveSidebarFeed(); } catch (e) {}
  }

  function formatMarkdownLite(mdText) {
    if (!mdText) return "<p>No report content recorded for this session yet.</p>";
    const lines = String(mdText).split("\n");
    let html = "";
    let inList = false;
    for (let rawLine of lines) {
      const line = escapeHtml(rawLine)
        .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
        .replace(/`([^`]+)`/g, "<code>$1</code>");
      if (/^###\s+(.+)/.test(line)) {
        if (inList) { html += "</ul>"; inList = false; }
        html += `<h3 style="margin:18px 0 8px;font-size:1.12rem;font-weight:700;">${line.replace(/^###\s+/, "")}</h3>`;
      } else if (/^##\s+(.+)/.test(line)) {
        if (inList) { html += "</ul>"; inList = false; }
        html += `<h2 style="margin:20px 0 10px;font-size:1.25rem;font-weight:700;">${line.replace(/^##\s+/, "")}</h2>`;
      } else if (/^#\s+(.+)/.test(line)) {
        if (inList) { html += "</ul>"; inList = false; }
        html += `<h1 style="margin:22px 0 12px;font-size:1.4rem;font-weight:800;">${line.replace(/^#\s+/, "")}</h1>`;
      } else if (/^(\d+\.|-|\*)\s+(.+)/.test(line)) {
        if (!inList) { html += `<ul style="margin:8px 0 12px 20px;padding:0;list-style:disc;">`; inList = true; }
        html += `<li style="margin:5px 0;line-height:1.68;">${line.replace(/^(\d+\.|-|\*)\s+/, "")}</li>`;
      } else if (line.trim() === "") {
        if (inList) { html += "</ul>"; inList = false; }
      } else {
        if (inList) { html += "</ul>"; inList = false; }
        html += `<p style="margin:8px 0;line-height:1.74;">${line}</p>`;
      }
    }
    if (inList) html += "</ul>";
    return html;
  }

  function clearRestoredChatView() {
    activeRestoredChatId = null;
    const stage = document.getElementById("restored-chat-stage");
    if (stage) stage.remove();
    document.body.classList.remove("viewing-restored-chat");
    document.querySelectorAll(".active-sidebar-item.is-selected").forEach((el) => {
      el.classList.remove("is-selected");
    });
  }

  function findMainChatColumn() {
    const welcomeScreen =
      document.getElementById("welcome-screen") ||
      document.querySelector(".welcome-screen");
    if (welcomeScreen && welcomeScreen.parentElement) {
      return welcomeScreen.parentElement;
    }
    const firstStep = document.querySelector(".step");
    if (firstStep) {
      const col = firstStep.closest(".flex.flex-col.mx-auto.w-full.flex-grow");
      if (col) return col;
      if (firstStep.parentElement) return firstStep.parentElement;
    }
    const { composer } = getComposerElements();
    return (
      document.querySelector(".overflow-y-auto > .flex.flex-col.mx-auto.w-full.flex-grow") ||
      document.querySelector(".overflow-y-auto .flex.flex-col.mx-auto.w-full") ||
      composer?.parentElement?.parentElement ||
      document.querySelector("main") ||
      document.getElementById("root") ||
      document.body
    );
  }

  function restoreChatInMainView(chatInput) {
    if (!chatInput) return;

    // Sync any live DOM messages into HistoryManager before restoring
    try { observeAssistantResponsesForHistory(true); } catch (e) {}

    const freshChat =
      HistoryManager.getChats().find((c) => c.id === chatInput.id) ||
      HistoryManager.getChats().find(
        (c) => (c.query || "").toLowerCase() === (chatInput.query || "").toLowerCase()
      ) ||
      chatInput;

    activeRestoredChatId = freshChat.id;
    toggleQuickSearchDropdown(true);

    let stage = document.getElementById("restored-chat-stage");
    if (!stage) {
      stage = document.createElement("div");
      stage.id = "restored-chat-stage";
    }

    const mainColumn = findMainChatColumn();
    if (mainColumn && (stage.parentElement !== mainColumn || mainColumn.firstElementChild !== stage)) {
      mainColumn.insertBefore(stage, mainColumn.firstChild);
    }

    document.body.classList.add("viewing-restored-chat");

    const hasSavedAnswer = Boolean(
      (freshChat.fullHtml && freshChat.fullHtml.trim()) ||
      (freshChat.fullReport && freshChat.fullReport.trim())
    );

    const bodyContentHtml = freshChat.fullHtml
      ? freshChat.fullHtml
      : hasSavedAnswer
      ? formatMarkdownLite(freshChat.fullReport)
      : `
        <div style="padding: 18px 20px; border-radius: 14px; background: rgba(99, 102, 241, 0.08); border: 1px solid rgba(129, 140, 248, 0.25);">
          <p style="margin: 0 0 10px 0; font-family: var(--font-sans); font-size: 0.95rem;">
            This session was saved before the final synthesis completed. Click below to run or resume this inquiry now:
          </p>
          <button type="button" class="restored-chat-action-btn restored-chat-primary-btn" id="restored-chat-run-now-btn" style="padding: 8px 16px !important; font-size: 0.85rem !important;">
            Run "${escapeHtml(freshChat.query)}" Now
          </button>
        </div>
      `;

    stage.innerHTML = `
      <div class="restored-chat-inner">
        <div class="restored-chat-banner">
          <div class="restored-chat-banner-left">
            <span class="restored-chat-dot"></span>
            <span>Previous Chat Session</span>
            <span style="opacity:0.5;">•</span>
            <span style="color:#94a3b8;font-weight:500;">${formatTimeAgo(freshChat.updatedAt || freshChat.timestamp)}</span>
          </div>
          <div class="restored-chat-banner-actions">
            <button type="button" class="restored-chat-action-btn" id="restored-chat-continue-btn" title="Re-run or continue this topic in live chat">
              Continue / Re-run
            </button>
            <button type="button" class="restored-chat-action-btn" id="restored-chat-copy-btn" title="Copy full response">
              Copy
            </button>
            <button type="button" class="restored-chat-action-btn restored-chat-primary-btn" id="restored-chat-back-btn" title="Return to active chat">
              Back to Live Chat
            </button>
          </div>
        </div>

        <div class="restored-chat-messages">
          <div class="restored-user-row">
            <div class="restored-user-bubble">${escapeHtml(freshChat.query)}</div>
          </div>
          <div class="restored-assistant-row">
            <div class="restored-assistant-content message-content">
              ${bodyContentHtml}
            </div>
          </div>
        </div>
      </div>
    `;

    stage.querySelector("#restored-chat-back-btn")?.addEventListener("click", () => {
      clearRestoredChatView();
    });

    const rerunHandler = () => {
      const q = freshChat.query;
      clearRestoredChatView();
      applySearchToInput(q, true);
    };
    stage.querySelector("#restored-chat-continue-btn")?.addEventListener("click", rerunHandler);
    stage.querySelector("#restored-chat-run-now-btn")?.addEventListener("click", rerunHandler);

    stage.querySelector("#restored-chat-copy-btn")?.addEventListener("click", (e) => {
      const btn = e.currentTarget;
      const textToCopy = `# ${freshChat.query}\n\n${freshChat.fullReport || freshChat.preview || ""}`;
      navigator.clipboard.writeText(textToCopy).then(() => {
        btn.textContent = "Copied";
        setTimeout(() => { btn.textContent = "Copy"; }, 1800);
      });
    });

    // Ensure composer is visible at the bottom so user can type anytime
    const { composer } = getComposerElements();
    if (composer) {
      composer.style.visibility = "visible";
      composer.style.display = "";
      composer.style.opacity = "1";
      composer.style.pointerEvents = "auto";
      composer.style.position = "";
      composer.style.bottom = "";
      composer.style.left = "";
    }

    renderActiveSidebarFeed();
    try { renderMermaidDiagrams(); } catch (e) {}
  }

  // Quick Search & Chat History Dropdown (pops above input)
  let quickDropdownTab = "chats"; // "chats" | "searches"

  function toggleQuickSearchDropdown(forceClose = false) {
    let dropdown = document.getElementById("search-history-dropdown");
    let backdrop = document.getElementById("search-history-backdrop");

    if (forceClose) {
      if (dropdown) dropdown.style.display = "none";
      if (backdrop) backdrop.style.display = "none";
      return;
    }

    if (!dropdown) {
      dropdown = document.createElement("div");
      dropdown.id = "search-history-dropdown";
      dropdown.style.display = "none";
      document.body.appendChild(dropdown);
    } else if (dropdown.parentElement !== document.body) {
      document.body.appendChild(dropdown);
    }

    if (!backdrop) {
      backdrop = document.createElement("div");
      backdrop.id = "search-history-backdrop";
      backdrop.style.cssText = "position:fixed;top:0;left:0;right:0;bottom:0;z-index:9990;background:rgba(0,0,0,0.25);backdrop-filter:blur(2px);-webkit-backdrop-filter:blur(2px);display:none;";
      document.body.appendChild(backdrop);
      backdrop.addEventListener("pointerdown", (e) => {
        e.preventDefault();
        e.stopPropagation();
        toggleQuickSearchDropdown(true);
      }, true);
      backdrop.addEventListener("click", (e) => {
        e.preventDefault();
        e.stopPropagation();
        toggleQuickSearchDropdown(true);
      }, true);
    }

    if (dropdown.style.display === "flex") {
      dropdown.style.display = "none";
      if (backdrop) backdrop.style.display = "none";
      return;
    }

    // Position dropdown neatly above the active searchbar (AnimatedAIChat or native composer)
    const animatedCard = document.querySelector("#animated-ai-chat-mount textarea")?.closest(".backdrop-blur-2xl");
    const { composer } = getComposerElements();
    const anchor = animatedCard || composer;
    if (anchor) {
      const rect = anchor.getBoundingClientRect();
      const width = Math.min(640, Math.max(320, rect.width));
      const left = Math.max(12, Math.min(window.innerWidth - width - 12, rect.left));
      const bottom = Math.max(16, window.innerHeight - rect.top + 10);
      dropdown.style.position = "fixed";
      dropdown.style.left = `${Math.round(left)}px`;
      dropdown.style.bottom = `${Math.round(bottom)}px`;
      dropdown.style.width = `${Math.round(width)}px`;
      dropdown.style.right = "auto";
      dropdown.style.zIndex = "9995";
    }

    renderQuickSearchDropdown(dropdown);
    dropdown.style.display = "flex";
    if (backdrop) backdrop.style.display = "block";
  }
  window.__toggleQuickSearchDropdown = toggleQuickSearchDropdown;

  function renderQuickSearchDropdown(dropdown) {
    const chats = HistoryManager.getChats().slice(0, 6);
    const searches = HistoryManager.getSearches().slice(0, 6);

    let itemsHtml = "";
    if (quickDropdownTab === "chats") {
      if (chats.length === 0) {
        itemsHtml = `
          <div style="padding: 16px; text-align: center; color: #94a3b8; font-size: 0.8rem;">
            No research sessions recorded yet
          </div>
        `;
      } else {
        itemsHtml = chats.map((chat, index) => `
          <div class="history-quick-item history-card-animated" data-id="${chat.id}" style="animation-delay: ${(index * 0.03).toFixed(2)}s;">
            <div class="history-quick-left">
              <span style="color: #10b981;"></span>
              <span class="history-quick-text">${escapeHtml(chat.title || chat.query)}</span>
            </div>
            <div style="display: flex; align-items: center; gap: 6px;">
              <span style="font-size: 0.7rem; color: #94a3b8;">${formatTimeAgo(chat.updatedAt || chat.timestamp)}</span>
              <button type="button" class="history-quick-view-btn" data-id="${chat.id}" style="background: rgba(99,102,241,0.12); color: #6366f1; border:none; border-radius: 4px; padding: 2px 6px; font-size: 10px; font-weight:600; cursor:pointer;" title="View Report">View</button>
              <button type="button" class="history-quick-delete-chat" data-id="${chat.id}" title="Remove">
                ${TRASH_ICON_SVG}
              </button>
            </div>
          </div>
        `).join("");
      }
    } else {
      if (searches.length === 0) {
        itemsHtml = `
          <div style="padding: 16px; text-align: center; color: #94a3b8; font-size: 0.8rem;">
            No recent searches yet
          </div>
        `;
      } else {
        itemsHtml = searches.map((item, index) => `
          <div class="history-quick-item history-card-animated" data-query="${encodeURIComponent(item.query)}" style="animation-delay: ${(index * 0.03).toFixed(2)}s;">
            <div class="history-quick-left">
              <span style="color: #6366f1;">${SEARCH_ICON_SVG}</span>
              <span class="history-quick-text">${escapeHtml(item.query)}</span>
            </div>
            <div style="display: flex; align-items: center; gap: 6px;">
              <span style="font-size: 0.7rem; color: #94a3b8;">${formatTimeAgo(item.timestamp)}</span>
              <button type="button" class="history-quick-delete" data-id="${item.id}" title="Remove">
                ${TRASH_ICON_SVG}
              </button>
            </div>
          </div>
        `).join("");
      }
    }

    dropdown.innerHTML = `
      <div class="history-dropdown-header">
        <div style="display: flex; align-items: center; gap: 6px;">
          <button type="button" class="history-dropdown-tab-btn ${quickDropdownTab === 'chats' ? 'is-active font-bold text-indigo-600 dark:text-indigo-400' : 'text-slate-500'}" id="quick-tab-chats" style="background:transparent;border:none;cursor:pointer;font-size:0.8rem;">
            Chat Sessions (${chats.length})
          </button>
          <span style="color:#94a3b8;">•</span>
          <button type="button" class="history-dropdown-tab-btn ${quickDropdownTab === 'searches' ? 'is-active font-bold text-indigo-600 dark:text-indigo-400' : 'text-slate-500'}" id="quick-tab-searches" style="background:transparent;border:none;cursor:pointer;font-size:0.8rem;">
            Searches (${searches.length})
          </button>
        </div>
        <div class="history-dropdown-actions" style="display: flex; align-items: center; gap: 8px;">
          <button type="button" class="history-dropdown-action-btn" id="history-dropdown-open-full" style="color:#6366f1;font-weight:700;">Open Sidebar ↗</button>
          <button type="button" id="history-dropdown-close-btn" class="history-dropdown-close-btn" title="Close (Esc)" aria-label="Close History" style="width:24px;height:24px;border-radius:50%;background:rgba(255,255,255,0.08);border:1px solid rgba(255,255,255,0.15);color:#94a3b8;display:inline-flex;align-items:center;justify-content:center;font-size:13px;line-height:1;cursor:pointer;transition:all 0.15s ease;">✕</button>
        </div>
      </div>
      <div class="history-quick-list">
        ${itemsHtml}
      </div>
      <div style="padding-top: 6px; border-top: 1px solid rgba(226,232,240,0.7); display:flex; justify-content:space-between; align-items:center;">
        <button type="button" id="quick-open-sidebar-btn" style="background: rgba(99, 102, 241, 0.12); color: #4f46e5; border: 1px solid rgba(99, 102, 241, 0.25); border-radius: 8px; padding: 4px 10px; font-size: 0.74rem; font-weight: 600; cursor: pointer;">
          Open Full History Sidebar
        </button>
        <button type="button" id="history-dropdown-clear" style="background:transparent; border:none; color: #ef4444; font-size: 0.72rem; cursor: pointer;">
          Clear ${quickDropdownTab === 'chats' ? 'Chats' : 'Searches'}
        </button>
      </div>
    `;

    // Explicit Close Button Handler
    dropdown.querySelector("#history-dropdown-close-btn")?.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      toggleQuickSearchDropdown(true);
    });

    // Tab buttons
    dropdown.querySelector("#quick-tab-chats")?.addEventListener("click", () => {
      quickDropdownTab = "chats";
      renderQuickSearchDropdown(dropdown);
    });

    dropdown.querySelector("#quick-tab-searches")?.addEventListener("click", () => {
      quickDropdownTab = "searches";
      renderQuickSearchDropdown(dropdown);
    });

    // Open sidebar handlers
    const openSidebarHandler = () => {
      toggleQuickSearchDropdown(true);
      toggleActiveSidebar(true);
    };
    dropdown.querySelector("#history-dropdown-open-full")?.addEventListener("click", openSidebarHandler);
    dropdown.querySelector("#quick-open-sidebar-btn")?.addEventListener("click", openSidebarHandler);

    // Chat view button
    dropdown.querySelectorAll(".history-quick-view-btn").forEach((btn) => {
      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        const id = btn.getAttribute("data-id");
        const chat = HistoryManager.getChats().find((c) => c.id === id);
        if (chat) {
          toggleQuickSearchDropdown(true);
          restoreChatInMainView(chat);
        }
      });
    });

    // Delete chat button
    dropdown.querySelectorAll(".history-quick-delete-chat").forEach((btn) => {
      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        const id = btn.getAttribute("data-id");
        if (id) {
          if (activeRestoredChatId === id) clearRestoredChatView();
          HistoryManager.removeChat(id);
          renderQuickSearchDropdown(dropdown);
        }
      });
    });

    // Hook click events on search item
    dropdown.querySelectorAll(".history-quick-item").forEach((el) => {
      el.addEventListener("click", (e) => {
        if (e.target.closest("button")) return;
        if (quickDropdownTab === "chats") {
          const id = el.getAttribute("data-id");
          const chat = HistoryManager.getChats().find((c) => c.id === id);
          if (chat) {
            toggleQuickSearchDropdown(true);
            restoreChatInMainView(chat);
          }
        } else {
          const q = decodeURIComponent(el.getAttribute("data-query") || "");
          clearRestoredChatView();
          applySearchToInput(q, true, el);
          setTimeout(() => {
            toggleQuickSearchDropdown(true);
          }, 160);
        }
      });
    });

    dropdown.querySelectorAll(".history-quick-delete").forEach((btn) => {
      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        const id = btn.getAttribute("data-id");
        if (id) {
          HistoryManager.removeSearch(id);
          renderQuickSearchDropdown(dropdown);
        }
      });
    });

    dropdown.querySelector("#history-dropdown-clear")?.addEventListener("click", () => {
      if (quickDropdownTab === "chats") {
        clearRestoredChatView();
        HistoryManager.clearChats();
      } else {
        HistoryManager.clearSearches();
      }
      renderQuickSearchDropdown(dropdown);
    });
  }

  function escapeHtml(str) {
    return (str || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  function applySearchToInput(query, autoSubmit = false, triggerEl = null) {
    const { input, composer } = getComposerElements();
    if (!input) return;

    if (triggerEl) {
      triggerEl.classList.add("item-clicked-flash");
      setTimeout(() => triggerEl.classList.remove("item-clicked-flash"), 300);
    }

    updateInputValue(input, query);
    const animatedTextarea = document.querySelector("#animated-ai-chat-mount textarea");
    if (animatedTextarea) {
      animatedTextarea.focus();
    } else {
      input.focus();
    }

    // Visual pulse transition effect on search bar
    const targetEl = animatedTextarea?.closest(".backdrop-blur-2xl") || composer || input;
    if (targetEl) {
      targetEl.classList.remove("input-pulse-glow");
      void targetEl.offsetWidth;
      targetEl.classList.add("input-pulse-glow");
      setTimeout(() => targetEl.classList.remove("input-pulse-glow"), 850);
    }

    if (autoSubmit) {
      setTimeout(() => {
        submitChainlitPrompt(query, "history");
      }, 150);
    }
  }

  // ─────────────────── Active Left Chat History Sidebar ───────────────────
  const SIDEBAR_STORAGE_KEY = "nexus_sidebar_collapsed_v3";
  let activeSidebarTab = "chats"; // "chats" | "queries"
  let activeSidebarFilter = "";

  function toggleActiveSidebar(forceState) {
    const sidebar = document.getElementById("active-chat-history-sidebar");
    if (!sidebar) {
      initActiveChatHistorySidebar();
      return;
    }
    const isCurrentlyCollapsed = sidebar.classList.contains("is-collapsed");
    const willCollapse = typeof forceState === "boolean" ? !forceState : !isCurrentlyCollapsed;

    if (willCollapse) {
      sidebar.classList.add("is-collapsed");
      document.body.classList.remove("has-active-sidebar");
      localStorage.setItem(SIDEBAR_STORAGE_KEY, "true");
    } else {
      sidebar.classList.remove("is-collapsed");
      document.body.classList.add("has-active-sidebar");
      localStorage.setItem(SIDEBAR_STORAGE_KEY, "false");
    }
  }

  function initActiveChatHistorySidebar() {
    ensureSidebarOpenTab();
    if (document.getElementById("active-chat-history-sidebar")) {
      injectHeaderSidebarToggle();
      return;
    }

    const backdrop = document.createElement("div");
    backdrop.id = "active-sidebar-backdrop";
    backdrop.addEventListener("click", () => toggleActiveSidebar(false));
    document.body.appendChild(backdrop);

    const sidebar = document.createElement("aside");
    sidebar.id = "active-chat-history-sidebar";
    sidebar.innerHTML = `
      <div class="active-sidebar-top">
        <div class="active-sidebar-brand">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#818cf8" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path></svg>
          <div>
            <div style="font-weight: 700; font-size: 0.88rem; line-height: 1.2;">Previous Chats</div>
            <div style="font-size: 0.68rem; color: #10b981; font-weight: 600; display: flex; align-items: center; gap: 4px;"><span style="width: 6px; height: 6px; border-radius: 50%; background: #10b981; display: inline-block;"></span> Chat & Search History</div>
          </div>
        </div>
        <button type="button" class="active-sidebar-collapse-btn" id="active-sidebar-collapse-btn" title="Collapse Sidebar (Cmd+H)">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><polyline points="15 18 9 12 15 6"></polyline></svg>
        </button>
      </div>

      <button type="button" class="active-sidebar-new-btn" id="active-sidebar-new-btn" title="Start a fresh chat">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>
        <span>New Chat</span>
      </button>

      <div class="active-sidebar-search-box">
        <svg style="position: absolute; left: 8px; top: 8px; width: 14px; height: 14px; color: #94a3b8;" fill="none" stroke="currentColor" viewBox="0 0 24 24"><circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line></svg>
        <input type="text" class="active-sidebar-search-input" id="active-sidebar-filter-input" placeholder="Search previous chats..." />
      </div>

      <div class="active-sidebar-tabs">
        <button type="button" class="active-sidebar-tab-btn is-active" id="active-sidebar-tab-chats">Previous Chats</button>
        <button type="button" class="active-sidebar-tab-btn" id="active-sidebar-tab-queries">Queries</button>
      </div>

      <div class="active-sidebar-feed" id="active-sidebar-feed"></div>

      <div class="active-sidebar-footer">
        <span id="active-sidebar-count-label">0 chats</span>
        <div style="display: flex; gap: 8px; align-items: center;">
          <button type="button" id="active-sidebar-export-btn" style="background:transparent;border:none;color:#6366f1;cursor:pointer;font-weight:600;font-size:11px;">Export</button>
          <span style="opacity:0.4;">•</span>
          <button type="button" id="active-sidebar-clear-btn" style="background:transparent;border:none;color:#ef4444;cursor:pointer;font-weight:600;font-size:11px;">Clear</button>
        </div>
      </div>
    `;

    document.body.appendChild(sidebar);

    // Initial state: default is OPEN (Active History)
    const savedCollapsed = localStorage.getItem(SIDEBAR_STORAGE_KEY);
    if (savedCollapsed === "true") {
      sidebar.classList.add("is-collapsed");
      document.body.classList.remove("has-active-sidebar");
    } else {
      sidebar.classList.remove("is-collapsed");
      document.body.classList.add("has-active-sidebar");
    }

    // Attach Sidebar event listeners
    sidebar.querySelector("#active-sidebar-collapse-btn")?.addEventListener("click", () => {
      toggleActiveSidebar(false);
    });

    sidebar.querySelector("#active-sidebar-new-btn")?.addEventListener("click", () => {
      clearRestoredChatView();
      const nativeNewChat =
        document.getElementById("new-chat-button") ||
        document.querySelector('button[aria-label="New Chat"], button[title="New Chat"], a[href="/"]');
      if (nativeNewChat) {
        nativeNewChat.click();
      } else {
        const { input } = getComposerElements();
        if (input) {
          input.value = "";
          input.focus();
        }
      }
    });

    const filterInput = sidebar.querySelector("#active-sidebar-filter-input");
    filterInput?.addEventListener("input", (e) => {
      activeSidebarFilter = (e.target).value.toLowerCase();
      renderActiveSidebarFeed();
    });

    const tabChats = sidebar.querySelector("#active-sidebar-tab-chats");
    const tabQueries = sidebar.querySelector("#active-sidebar-tab-queries");

    tabChats?.addEventListener("click", () => {
      activeSidebarTab = "chats";
      tabChats.classList.add("is-active");
      tabQueries.classList.remove("is-active");
      renderActiveSidebarFeed();
    });

    tabQueries?.addEventListener("click", () => {
      activeSidebarTab = "queries";
      tabQueries.classList.add("is-active");
      tabChats.classList.remove("is-active");
      renderActiveSidebarFeed();
    });

    sidebar.querySelector("#active-sidebar-export-btn")?.addEventListener("click", () => {
      HistoryManager.exportAll();
    });

    sidebar.querySelector("#active-sidebar-clear-btn")?.addEventListener("click", () => {
      if (confirm(`Are you sure you want to clear your saved ${activeSidebarTab === "chats" ? "previous chats" : "queries"}?`)) {
        if (activeSidebarTab === "chats") {
          clearRestoredChatView();
          HistoryManager.clearChats();
        } else {
          HistoryManager.clearSearches();
        }
        updateHistoryBadge();
      }
    });

    injectHeaderSidebarToggle();
    renderActiveSidebarFeed();
  }

  function injectHeaderSidebarToggle() {
    const newChatBtn = document.getElementById("new-chat-button");
    if (newChatBtn && !newChatBtn.__clearRestoredHooked) {
      newChatBtn.__clearRestoredHooked = true;
      newChatBtn.addEventListener("click", () => {
        clearRestoredChatView();
      });
    }

    const existingBtn = document.getElementById("header-toggle-history-sidebar");
    if (existingBtn) {
      const counter = document.getElementById("header-history-counter");
      const count = String(HistoryManager.getChats().length);
      if (counter) {
        if (counter.textContent !== count) {
          counter.textContent = count;
        }
        const nextDisplay = Number(count) > 0 ? "inline-flex" : "none";
        if (counter.style.display !== nextDisplay) {
          counter.style.display = nextDisplay;
        }
      }
      return;
    }

    const header =
      document.getElementById("header") ||
      document.querySelector("header") ||
      document.querySelector("nav");
    if (!header) return;

    const count = HistoryManager.getChats().length;
    const toggleBtn = document.createElement("button");
    toggleBtn.type = "button";
    toggleBtn.id = "header-toggle-history-sidebar";
    toggleBtn.title = "Toggle Chat History (Cmd+H)";
    toggleBtn.setAttribute("aria-label", "Toggle Chat History");
    toggleBtn.innerHTML = `
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.85" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2.5" ry="2.5"></rect><line x1="9" y1="3" x2="9" y2="21"></line></svg>
      <span>History</span>
      <span id="header-history-counter" class="header-history-counter" style="display: ${count > 0 ? "inline-flex" : "none"};">
        ${count}
      </span>
    `;

    toggleBtn.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      toggleActiveSidebar();
    });

    const leftContainer =
      (newChatBtn && newChatBtn.parentElement) ||
      header.querySelector(".flex.items-center") ||
      header.firstElementChild;
    if (leftContainer) {
      leftContainer.appendChild(toggleBtn);
    } else {
      header.appendChild(toggleBtn);
    }
  }

  function ensureSidebarOpenTab() {
    const staleTab = document.getElementById("sidebar-dock-tab-btn");
    if (staleTab) staleTab.remove();
  }

  function renderActiveSidebarFeed() {
    const feed = document.getElementById("active-sidebar-feed");
    if (!feed) return;

    if (activeSidebarTab === "chats") {
      let chats = HistoryManager.getChats();
      if (activeSidebarFilter) {
        chats = chats.filter(c => 
          (c.title && c.title.toLowerCase().includes(activeSidebarFilter)) ||
          (c.query && c.query.toLowerCase().includes(activeSidebarFilter))
        );
      }

      const countLabel = document.getElementById("active-sidebar-count-label");
      if (countLabel) countLabel.textContent = `${chats.length} saved chats`;

      const headerCounter = document.getElementById("header-history-counter");
      if (headerCounter) headerCounter.textContent = String(chats.length);

      if (chats.length === 0) {
        feed.innerHTML = `
          <div style="padding: 24px 12px; text-align: center; color: #94a3b8; font-size: 0.8rem;">
            <div>No previous chats yet</div>
            <div style="font-size: 0.72rem; margin-top: 4px;">Ask any question to automatically save your chat history here.</div>
          </div>
        `;
        return;
      }

      feed.innerHTML = chats.map((chat, index) => `
        <div class="active-sidebar-item history-card-animated ${activeRestoredChatId === chat.id ? 'is-selected' : ''}" data-id="${chat.id}" style="animation-delay: ${(index * 0.03).toFixed(2)}s;">
          <div class="active-sidebar-item-title">${escapeHtml(chat.title || chat.query)}</div>
          <div class="active-sidebar-item-meta">
            <span style="display:flex;align-items:center;gap:4px;color:#10b981;font-weight:600;">
              <span style="width:5px;height:5px;border-radius:50%;background:#10b981;"></span>
              ${chat.status === "completed" ? "Saved Chat" : "Active"}
            </span>
            <span>${formatTimeAgo(chat.updatedAt || chat.timestamp)}</span>
          </div>
          <div class="active-sidebar-item-actions">
            <button type="button" class="active-sidebar-btn-del active-sidebar-btn-view" data-id="${chat.id}" title="Popup View">
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
            </button>
            <button type="button" class="active-sidebar-btn-del active-sidebar-btn-delete" data-id="${chat.id}" title="Delete chat">
              ✕
            </button>
          </div>
        </div>
      `).join("");

      feed.querySelectorAll(".active-sidebar-item").forEach(item => {
        item.addEventListener("click", (e) => {
          if (e.target.closest(".active-sidebar-btn-del")) return;
          const id = item.getAttribute("data-id");
          const chat = HistoryManager.getChats().find(c => c.id === id);
          if (chat) {
            restoreChatInMainView(chat);
          }
        });
      });

      feed.querySelectorAll(".active-sidebar-btn-view").forEach(btn => {
        btn.addEventListener("click", (e) => {
          e.stopPropagation();
          const id = btn.getAttribute("data-id");
          const chat = HistoryManager.getChats().find(c => c.id === id);
          if (chat) openChatDetailModal(chat);
        });
      });

      feed.querySelectorAll(".active-sidebar-btn-delete").forEach(btn => {
        btn.addEventListener("click", (e) => {
          e.stopPropagation();
          const id = btn.getAttribute("data-id");
          if (id) {
            if (activeRestoredChatId === id) clearRestoredChatView();
            const card = btn.closest(".active-sidebar-item");
            if (card) {
              card.classList.add("history-card-deleting");
              setTimeout(() => {
                HistoryManager.removeChat(id);
                updateHistoryBadge();
                renderActiveSidebarFeed();
              }, 220);
            } else {
              HistoryManager.removeChat(id);
              updateHistoryBadge();
              renderActiveSidebarFeed();
            }
          }
        });
      });

    } else {
      // Queries Tab
      let searches = HistoryManager.getSearches();
      if (activeSidebarFilter) {
        searches = searches.filter(s => s.query.toLowerCase().includes(activeSidebarFilter));
      }

      const countLabel = document.getElementById("active-sidebar-count-label");
      if (countLabel) countLabel.textContent = `${searches.length} queries`;

      if (searches.length === 0) {
        feed.innerHTML = `
          <div style="padding: 24px 12px; text-align: center; color: #94a3b8; font-size: 0.8rem;">
            <div>No queries found</div>
          </div>
        `;
        return;
      }

      feed.innerHTML = searches.map((item, index) => `
        <div class="active-sidebar-item history-card-animated" data-query="${encodeURIComponent(item.query)}" style="animation-delay: ${(index * 0.03).toFixed(2)}s;">
          <div class="active-sidebar-item-title">${escapeHtml(item.query)}</div>
          <div class="active-sidebar-item-meta">
            <span>${item.source === "voice" ? "Voice" : item.source === "starter" ? "Starter" : "Text"}</span>
            <span>${formatTimeAgo(item.timestamp)}</span>
          </div>
          <div class="active-sidebar-item-actions">
            <button type="button" class="active-sidebar-btn-del active-sidebar-btn-del-query" data-id="${item.id}" title="Delete query">
              ✕
            </button>
          </div>
        </div>
      `).join("");

      feed.querySelectorAll(".active-sidebar-item").forEach(item => {
        item.addEventListener("click", (e) => {
          if (e.target.closest(".active-sidebar-btn-del")) return;
          const q = decodeURIComponent(item.getAttribute("data-query") || "");
          if (q) {
            clearRestoredChatView();
            applySearchToInput(q, true);
          }
        });
      });

      feed.querySelectorAll(".active-sidebar-btn-del-query").forEach(btn => {
        btn.addEventListener("click", (e) => {
          e.stopPropagation();
          const id = btn.getAttribute("data-id");
          if (id) {
            const card = btn.closest(".active-sidebar-item");
            if (card) {
              card.classList.add("history-card-deleting");
              setTimeout(() => {
                HistoryManager.removeSearch(id);
                updateHistoryBadge();
                renderActiveSidebarFeed();
              }, 220);
            } else {
              HistoryManager.removeSearch(id);
              updateHistoryBadge();
              renderActiveSidebarFeed();
            }
          }
        });
      });
    }
  }

  // Full History Drawer fallback
  function openHistoryDrawer(tab = "chat") {
    toggleActiveSidebar(true);
  }

  function closeHistoryDrawer() {
    toggleActiveSidebar(false);
  }

  function createHistoryDrawerDOM() {
    initActiveChatHistorySidebar();
  }

  function renderHistoryDrawerContent() {
    const container = document.getElementById("history-content-area");
    const tabSearch = document.getElementById("history-tab-btn-search");
    const tabChat = document.getElementById("history-tab-btn-chat");
    if (!container) return;

    if (activeHistoryTab === "search") {
      tabSearch?.classList.add("history-tab-active");
      tabChat?.classList.remove("history-tab-active");

      let searches = HistoryManager.getSearches();
      if (historySearchFilter) {
        searches = searches.filter((s) => s.query.toLowerCase().includes(historySearchFilter));
      }

      if (searches.length === 0) {
        container.innerHTML = `
          <div class="history-empty-state">
            <div class="history-empty-icon">${SEARCH_ICON_SVG}</div>
            <div class="history-empty-text">${historySearchFilter ? "No matching searches found" : "No search history yet"}</div>
            <div class="history-empty-sub">Your queries will automatically appear here as you explore research topics.</div>
          </div>
        `;
        return;
      }

      container.innerHTML = searches.map((item, index) => {
        let badgeClass = "history-badge-text";
        let badgeLabel = "Text";
        if (item.source === "voice") {
          badgeClass = "history-badge-voice";
          badgeLabel = "Voice";
        } else if (item.source === "starter") {
          badgeClass = "history-badge-starter";
          badgeLabel = "Starter";
        }

        return `
          <div class="history-search-card history-card-animated" data-id="${item.id}" style="animation-delay: ${(index * 0.04).toFixed(2)}s;">
            <div class="history-card-header">
              <span class="history-source-badge ${badgeClass}">${badgeLabel}</span>
              <span class="history-card-time">${formatTimeAgo(item.timestamp)}</span>
            </div>
            <div class="history-card-query">${escapeHtml(item.query)}</div>
            <div class="history-card-actions">
              <div class="history-action-left">
                <button type="button" class="history-btn-search-now" data-query="${encodeURIComponent(item.query)}">
                  Search Now
                </button>
                <button type="button" class="history-btn-edit" data-query="${encodeURIComponent(item.query)}">
                  Edit
                </button>
              </div>
              <button type="button" class="history-btn-icon-only history-btn-delete-search" data-id="${item.id}" title="Delete query">
                ${TRASH_ICON_SVG}
              </button>
            </div>
          </div>
        `;
      }).join("");

      // Action hooks
      container.querySelectorAll(".history-btn-search-now").forEach((btn) => {
        btn.addEventListener("click", () => {
          const q = decodeURIComponent(btn.getAttribute("data-query") || "");
          applySearchToInput(q, true);
          closeHistoryDrawer();
        });
      });

      container.querySelectorAll(".history-btn-edit").forEach((btn) => {
        btn.addEventListener("click", () => {
          const q = decodeURIComponent(btn.getAttribute("data-query") || "");
          applySearchToInput(q, false);
          closeHistoryDrawer();
        });
      });

      container.querySelectorAll(".history-btn-delete-search").forEach((btn) => {
        btn.addEventListener("click", () => {
          const id = btn.getAttribute("data-id");
          if (id) {
            const card = btn.closest(".history-search-card");
            if (card) {
              card.classList.add("history-card-deleting");
              setTimeout(() => {
                HistoryManager.removeSearch(id);
                renderHistoryDrawerContent();
              }, 220);
            } else {
              HistoryManager.removeSearch(id);
              renderHistoryDrawerContent();
            }
          }
        });
      });

    } else {
      // Chat History Tab
      tabChat?.classList.add("history-tab-active");
      tabSearch?.classList.remove("history-tab-active");

      let chats = HistoryManager.getChats();
      if (historySearchFilter) {
        chats = chats.filter((c) =>
          c.query.toLowerCase().includes(historySearchFilter) ||
          (c.preview && c.preview.toLowerCase().includes(historySearchFilter)) ||
          (c.title && c.title.toLowerCase().includes(historySearchFilter))
        );
      }

      if (chats.length === 0) {
        container.innerHTML = `
          <div class="history-empty-state">
            <div class="history-empty-icon">${HISTORY_ICON_SVG}</div>
            <div class="history-empty-text">${historySearchFilter ? "No matching chats found" : "No research chats yet"}</div>
            <div class="history-empty-sub">Multi-agent investigation summaries and reports will be saved here automatically.</div>
          </div>
        `;
        return;
      }

      container.innerHTML = chats.map((chat, index) => `
        <div class="history-chat-card history-card-animated" data-id="${chat.id}" style="animation-delay: ${(index * 0.04).toFixed(2)}s;">
          <div class="history-card-header">
            <span style="font-size: 0.72rem; color: #10b981; font-weight: 600; display: inline-flex; align-items: center; gap: 4px;">
              <span style="width: 6px; height: 6px; border-radius: 50%; background: #10b981;"></span> Research Session
            </span>
            <span class="history-card-time">${formatTimeAgo(chat.updatedAt || chat.timestamp)}</span>
          </div>
          <div class="history-chat-title">${escapeHtml(chat.title || chat.query)}</div>
          <div class="history-chat-preview">${escapeHtml(chat.preview || "Inquiry completed.")}</div>
          <div class="history-card-actions">
            <div class="history-action-left">
              <button type="button" class="history-btn-search-now history-btn-view-chat" data-id="${chat.id}">
                View Report
              </button>
              <button type="button" class="history-btn-edit history-btn-rerun-chat" data-query="${encodeURIComponent(chat.query)}">
                Re-run
              </button>
            </div>
            <button type="button" class="history-btn-icon-only history-btn-delete-chat" data-id="${chat.id}" title="Delete session">
              ${TRASH_ICON_SVG}
            </button>
          </div>
        </div>
      `).join("");

      // Chat actions
      container.querySelectorAll(".history-btn-view-chat").forEach((btn) => {
        btn.addEventListener("click", () => {
          const id = btn.getAttribute("data-id");
          const chat = HistoryManager.getChats().find((c) => c.id === id);
          if (chat) openChatDetailModal(chat);
        });
      });

      container.querySelectorAll(".history-btn-rerun-chat").forEach((btn) => {
        btn.addEventListener("click", () => {
          const q = decodeURIComponent(btn.getAttribute("data-query") || "");
          applySearchToInput(q, true);
          closeHistoryDrawer();
        });
      });

      container.querySelectorAll(".history-btn-delete-chat").forEach((btn) => {
        btn.addEventListener("click", () => {
          const id = btn.getAttribute("data-id");
          if (id) {
            const card = btn.closest(".history-chat-card");
            if (card) {
              card.classList.add("history-card-deleting");
              setTimeout(() => {
                HistoryManager.removeChat(id);
                renderHistoryDrawerContent();
              }, 220);
            } else {
              HistoryManager.removeChat(id);
              renderHistoryDrawerContent();
            }
          }
        });
      });
    }
  }

  // Modal to view full report of a previous chat
  function openChatDetailModal(chat) {
    let modal = document.getElementById("history-chat-modal");
    if (modal) modal.remove();

    modal = document.createElement("div");
    modal.id = "history-chat-modal";
    modal.innerHTML = `
      <div class="history-modal-card">
        <div class="history-modal-header">
          <div style="font-weight: 700; font-size: 1rem; color: #6366f1; display: flex; align-items: center; gap: 8px;">
            Research Inquiry Report
          </div>
          <button type="button" class="history-drawer-close-btn" id="history-modal-close-btn">
            ${CLOSE_ICON_SVG}
          </button>
        </div>
        <div class="history-modal-body">
          <div style="font-size: 1.05rem; font-weight: 700; margin-bottom: 6px;">${escapeHtml(chat.query)}</div>
          <div style="font-size: 0.76rem; color: #94a3b8; margin-bottom: 16px;">
            Logged: ${new Date(chat.timestamp).toLocaleString()}
          </div>
          <div style="white-space: pre-wrap; font-size: 0.88rem; line-height: 1.6; border: 1px solid rgba(226, 232, 240, 0.8); border-radius: 12px; padding: 14px; background: rgba(0,0,0,0.02);">
            ${escapeHtml(chat.fullReport || chat.preview || "No report body stored.")}
          </div>
        </div>
        <div class="history-modal-footer">
          <button type="button" class="history-footer-btn history-btn-export" id="history-modal-copy-btn">
            Copy Report
          </button>
          <button type="button" class="history-btn-search-now" id="history-modal-rerun-btn">
            Re-run Research
          </button>
        </div>
      </div>
    `;

    document.body.appendChild(modal);

    modal.querySelector("#history-modal-close-btn")?.addEventListener("click", () => modal.remove());
    modal.addEventListener("click", (e) => {
      if (e.target === modal) modal.remove();
    });

    modal.querySelector("#history-modal-copy-btn")?.addEventListener("click", (e) => {
      const textToCopy = `# ${chat.query}\n\n${chat.fullReport || chat.preview}`;
      navigator.clipboard.writeText(textToCopy).then(() => {
        (e.target).textContent = "Copied!";
        setTimeout(() => {
          (e.target).textContent = "Copy Report";
        }, 2000);
      });
    });

    modal.querySelector("#history-modal-rerun-btn")?.addEventListener("click", () => {
      modal.remove();
      closeHistoryDrawer();
      applySearchToInput(chat.query, true);
    });
  }

  // UI Icons
  const SPOTLIGHT_ICON_SVG = `
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
      <circle cx="11" cy="11" r="8"></circle>
      <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
    </svg>
  `;

  // Create Apple Spotlight Trigger Button for Search Bar
  function createSpotlightButton() {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.id = "apple-spotlight-trigger-btn";
    btn.setAttribute("title", "Apple Spotlight Live Search (⌘K)");
    btn.setAttribute("aria-label", "Apple Spotlight Search");
    btn.innerHTML = SPOTLIGHT_ICON_SVG;

    btn.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      const openFn = window.__openSpotlight;
      if (typeof openFn === "function") {
        openFn();
      } else {
        window.dispatchEvent(new KeyboardEvent("keydown", { key: "k", metaKey: true, bubbles: true }));
      }
    });

    return btn;
  }

  // Create Search Bar History Trigger Button (next to mic)
  function createSearchHistoryButton() {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.id = "search-history-trigger-btn";
    btn.setAttribute("title", "Search & Chat History (Click to view)");
    btn.setAttribute("aria-label", "Search History");
    btn.innerHTML = HISTORY_ICON_SVG;

    btn.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      toggleQuickSearchDropdown();
    });

    return btn;
  }

  // Create Header History Button
  function createHeaderHistoryButton() {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.id = "history-drawer-toggle-btn";
    btn.setAttribute("title", "Open Research History (Cmd+H)");
    btn.innerHTML = `
      ${HISTORY_ICON_SVG}
      <span>History</span>
      <span class="history-counter-badge" id="history-drawer-counter">
        ${HistoryManager.getSearches().length + HistoryManager.getChats().length}
      </span>
    `;

    btn.addEventListener("click", (e) => {
      e.preventDefault();
      openHistoryDrawer("search");
    });

    return btn;
  }

  // Hook query inputs to save to history automatically
  function hookHistoryCaptures() {
    // 1. Hook Starter buttons
    document.querySelectorAll('[data-testid="starter"], [class*="starter"] button, button[class*="starter"]').forEach((btn) => {
      if (btn.__historyHooked) return;
      btn.__historyHooked = true;
      btn.addEventListener("click", () => {
        clearRestoredChatView();
        const text = btn.dataset.message || btn.getAttribute("data-message") || btn.innerText?.trim() || "";
        triggerSmoothSearchTransition(text);
        if (text) {
          HistoryManager.addSearch(text, "starter");
          HistoryManager.addOrUpdateChat(text, "", "in_progress");
        }
      });
    });

    // 2. Hook Input submission
    const { input, submitBtn } = getComposerElements();
    if (input && !input.__historyHooked) {
      input.__historyHooked = true;
      input.addEventListener("keydown", (e) => {
        if (e.key === "Enter" && !e.shiftKey) {
          clearRestoredChatView();
          const val = input.value.trim();
          triggerSmoothSearchTransition(val);
          if (val) {
            HistoryManager.addSearch(val, "text");
            HistoryManager.addOrUpdateChat(val, "", "in_progress");
          }
        }
      });
    }

    if (submitBtn && !submitBtn.__historyHooked) {
      submitBtn.__historyHooked = true;
      submitBtn.addEventListener("click", () => {
        clearRestoredChatView();
        const val = input ? input.value.trim() : "";
        triggerSmoothSearchTransition(val);
        if (val) {
          HistoryManager.addSearch(val, "text");
          HistoryManager.addOrUpdateChat(val, "", "in_progress");
        }
      });
    }

    if (!window.__historyWindowListenersHooked) {
      window.__historyWindowListenersHooked = true;

      // 3. Close quick dropdown on outside click (capture phase so React/Chainlit never blocks it)
      window.addEventListener("pointerdown", (e) => {
        const dropdown = document.getElementById("search-history-dropdown");
        const trigger = document.getElementById("search-history-trigger-btn");
        if (dropdown && dropdown.style.display === "flex") {
          if (!dropdown.contains(e.target) && !trigger?.contains(e.target)) {
            toggleQuickSearchDropdown(true);
          }
        }
      }, true);

      window.addEventListener("click", (e) => {
        const dropdown = document.getElementById("search-history-dropdown");
        const trigger = document.getElementById("search-history-trigger-btn");
        if (dropdown && dropdown.style.display === "flex") {
          if (!dropdown.contains(e.target) && !trigger?.contains(e.target)) {
            toggleQuickSearchDropdown(true);
          }
        }
      }, true);

      // 4. Keyboard shortcut: Cmd+H or Ctrl+H toggles Active Chat History Sidebar, Escape closes dropdowns
      window.addEventListener("keydown", (e) => {
        if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "h") {
          e.preventDefault();
          toggleActiveSidebar();
        }
        if (e.key === "Escape") {
          const modal = document.getElementById("history-chat-modal");
          if (modal) modal.remove();
          toggleQuickSearchDropdown(true);
        }
      }, true);
    }
  }

  // Observe assistant answers to update Chat History
  function observeAssistantResponsesForHistory(force = false) {
    if (!force && document.body.classList.contains("viewing-restored-chat")) return;

    const allSteps = Array.from(
      document.querySelectorAll('div[data-step-type="user_message"], div[data-step-type="assistant_message"]')
    );
    if (allSteps.length === 0) return;

    const chats = HistoryManager.getChats();
    let currentQuery = "";
    let lastAssistantForCurrentQuery = null;

    const flushTurn = (qText, assistantEl) => {
      if (!qText || !assistantEl || isNoiseText(qText)) return;
      const contentEl = assistantEl.querySelector(".message-content, [class*='markdown']") || assistantEl;
      const text = (contentEl.innerText || "").replace(/\bRead Aloud\b|\bStop Reading\b/g, "").trim();
      if (text.length < 2) return;

      const clone = contentEl.cloneNode(true);
      clone.querySelectorAll(".va-read-aloud-btn").forEach((b) => b.remove());
      const cleanHtml = clone.innerHTML;

      const existing = chats.find((c) => (c.query || "").toLowerCase() === qText.toLowerCase());
      if (!existing || existing.fullReport !== text || !existing.fullHtml) {
        HistoryManager.addOrUpdateChat(qText, text, "completed", cleanHtml);
      }
    };

    for (const stepEl of allSteps) {
      const stType = stepEl.getAttribute("data-step-type");
      if (stType === "user_message") {
        if (currentQuery && lastAssistantForCurrentQuery) {
          flushTurn(currentQuery, lastAssistantForCurrentQuery);
        }
        currentQuery = (stepEl.innerText || "").trim();
        lastAssistantForCurrentQuery = null;
      } else if (stType === "assistant_message") {
        lastAssistantForCurrentQuery = stepEl;
      }
    }

    if (!currentQuery && chats.length > 0) {
      currentQuery = chats[0].query;
    }
    if (currentQuery && lastAssistantForCurrentQuery) {
      flushTurn(currentQuery, lastAssistantForCurrentQuery);
    }
  }

  // ─────────────────── Apple Spotlight Live Search Modal ───────────────────
  let spotlightSelectedIndex = 0;

  function openAppleSpotlightModal() {
    let modal = document.getElementById("apple-spotlight-modal");
    if (!modal) {
      modal = document.createElement("div");
      modal.id = "apple-spotlight-modal";
      modal.innerHTML = `
        <div class="apple-spotlight-backdrop"></div>
        <div class="apple-spotlight-card">
          <div class="apple-spotlight-input-row">
            <div class="apple-spotlight-icon-wrap">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <circle cx="11" cy="11" r="8"></circle>
                <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
              </svg>
              <span class="apple-spotlight-live-dot" title="Live Agent Active"></span>
            </div>
            <input
              type="text"
              id="apple-spotlight-input"
              placeholder="Ask anything or search arXiv, agents, architectures…"
              autocomplete="off"
              spellcheck="false"
            />
            <button type="button" class="apple-spotlight-esc-btn" id="apple-spotlight-close">esc</button>
          </div>
          <div class="apple-spotlight-results" id="apple-spotlight-results"></div>
          <div class="apple-spotlight-footer">
            <div class="apple-spotlight-status">
              <span class="apple-spotlight-status-dot"></span>
              <span>Autonomous Multi-Agent Assistant (LangGraph + Gemini)</span>
            </div>
            <div class="apple-spotlight-shortcuts">
              <span>↑↓ Navigate</span>
              <span>↵ Execute</span>
              <span>ESC Close</span>
            </div>
          </div>
        </div>
      `;
      document.body.appendChild(modal);

      modal.querySelector(".apple-spotlight-backdrop").addEventListener("click", closeAppleSpotlightModal);
      modal.querySelector("#apple-spotlight-close").addEventListener("click", closeAppleSpotlightModal);

      const input = modal.querySelector("#apple-spotlight-input");
      input.addEventListener("input", () => {
        spotlightSelectedIndex = 0;
        renderSpotlightResults();
      });

      input.addEventListener("keydown", (e) => {
        const items = modal.querySelectorAll(".apple-spotlight-item");
        if (e.key === "ArrowDown") {
          e.preventDefault();
          if (items.length > 0) {
            spotlightSelectedIndex = (spotlightSelectedIndex + 1) % items.length;
            updateSpotlightSelection(items);
          }
        } else if (e.key === "ArrowUp") {
          e.preventDefault();
          if (items.length > 0) {
            spotlightSelectedIndex = (spotlightSelectedIndex - 1 + items.length) % items.length;
            updateSpotlightSelection(items);
          }
        } else if (e.key === "Enter") {
          e.preventDefault();
          const selected = items[spotlightSelectedIndex];
          const query = selected ? decodeURIComponent(selected.dataset.query) : input.value.trim();
          if (query) {
            executeSpotlightQuery(query);
          }
        } else if (e.key === "Escape") {
          e.preventDefault();
          closeAppleSpotlightModal();
        }
      });
    }

    modal.style.display = "flex";
    const input = document.getElementById("apple-spotlight-input");
    if (input) {
      input.value = "";
      spotlightSelectedIndex = 0;
      renderSpotlightResults();
      setTimeout(() => input.focus(), 60);
    }
  }

  function closeAppleSpotlightModal() {
    const modal = document.getElementById("apple-spotlight-modal");
    if (modal) {
      modal.style.display = "none";
    }
  }

  function updateSpotlightSelection(items) {
    items.forEach((item, idx) => {
      if (idx === spotlightSelectedIndex) {
        item.classList.add("apple-spotlight-item-selected");
        item.scrollIntoView({ block: "nearest" });
      } else {
        item.classList.remove("apple-spotlight-item-selected");
      }
    });
  }

  function executeSpotlightQuery(query) {
    closeAppleSpotlightModal();
    const { input, submitBtn } = getComposerElements();
    if (input) {
      updateInputValue(input, query);
      setTimeout(() => {
        if (submitBtn && !submitBtn.disabled) {
          submitBtn.click();
        } else {
          input.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", code: "Enter", keyCode: 13, bubbles: true }));
        }
      }, 80);
    }
  }

  function renderSpotlightResults() {
    const input = document.getElementById("apple-spotlight-input");
    const container = document.getElementById("apple-spotlight-results");
    if (!input || !container) return;

    const query = input.value.trim();
    let items = [];

    if (query) {
      items = [
        {
          icon: "",
          label: `Research "${query}" with Autonomous Swarm`,
          desc: "Full 5-agent pipeline: Triage → Planner → Researcher → Critic → Synthesis",
          category: "agent",
          query: query
        },
        {
          icon: "",
          label: `Search arXiv for "${query}"`,
          desc: "Fetch recent preprints, author citations, and LaTeX formulations",
          category: "arxiv",
          query: `Search arXiv: ${query}`
        },
        {
          icon: "",
          label: `Generate Mermaid Architecture for "${query}"`,
          desc: "Synthesize visual system flowchart, comparison table & roadmap",
          category: "diagram",
          query: `Generate a Mermaid flowchart and detailed architectural comparison for ${query}`
        },
        {
          icon: "",
          label: `Web & Literature Synthesis on "${query}"`,
          desc: "Multi-source web synthesis cross-referenced with scientific databases",
          category: "web",
          query: query
        },
        {
          icon: "",
          label: `Verification & Fact-Check on "${query}"`,
          desc: "Rigorous citation audit and hallucination detection",
          category: "critic",
          query: `Verify facts and perform rigorous literature audit on: ${query}`
        }
      ];
    } else {
      const searches = HistoryManager.getSearches().slice(0, 4);
      searches.forEach((s) => {
        items.push({
          icon: "",
          label: s.query,
          desc: "Recent Search History",
          category: "history",
          query: s.query
        });
      });

      items.push(
        {
          icon: "",
          label: "FlashAttention-3 Architecture & Hardware Asynchrony",
          desc: "Hopper GPU warp-specialization and FP8 tensor operations",
          category: "starter",
          query: "Explain FlashAttention-3 architectural improvements, hardware asynchrony, and FP8 acceleration."
        },
        {
          icon: "",
          label: "Test-Time Compute Scaling vs Pre-training",
          desc: "Trade-offs in reasoning compute budgeting and search algorithms",
          category: "starter",
          query: "What are the trade-offs of Test-Time Compute vs Pre-training scaling in Large Language Models?"
        },
        {
          icon: "",
          label: "CRISPR-Cas9 Prime Editing Mechanisms",
          desc: "Breakthroughs in prime editing and clinical delivery systems",
          category: "starter",
          query: "Recent breakthroughs in CRISPR-Cas9 prime editing mechanisms and clinical delivery systems."
        }
      );
    }

    container.innerHTML = items.map((item, idx) => `
      <div class="apple-spotlight-item ${idx === spotlightSelectedIndex ? "apple-spotlight-item-selected" : ""}" data-query="${encodeURIComponent(item.query)}" data-index="${idx}">
        <div class="apple-spotlight-item-left">
          <span class="apple-spotlight-item-icon">${item.icon}</span>
          <div class="apple-spotlight-item-texts">
            <div class="apple-spotlight-item-label-row">
              <span class="apple-spotlight-item-label">${escapeHtml(item.label)}</span>
              <span class="apple-spotlight-badge apple-spotlight-badge-${item.category}">${item.category}</span>
            </div>
            <div class="apple-spotlight-item-desc">${escapeHtml(item.desc)}</div>
          </div>
        </div>
        <div class="apple-spotlight-item-right">
          <span class="apple-spotlight-press-hint">Press ↵</span>
          <span class="apple-spotlight-arrow">›</span>
        </div>
      </div>
    `).join("");

    container.querySelectorAll(".apple-spotlight-item").forEach((el) => {
      el.addEventListener("click", () => {
        const q = decodeURIComponent(el.dataset.query);
        executeSpotlightQuery(q);
      });
      el.addEventListener("mouseenter", () => {
        spotlightSelectedIndex = parseInt(el.dataset.index, 10);
        updateSpotlightSelection(container.querySelectorAll(".apple-spotlight-item"));
      });
    });
  }

  // Hook global Cmd+K / Ctrl+K
  window.addEventListener("keydown", (e) => {
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
      e.preventDefault();
      const modal = document.getElementById("apple-spotlight-modal");
      if (modal && modal.style.display === "flex") {
        closeAppleSpotlightModal();
      } else {
        openAppleSpotlightModal();
      }
    }
  });

  // Create Spotlight Button element
  function createSpotlightButton() {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.id = "apple-spotlight-trigger-btn";
    btn.setAttribute("title", "Apple Spotlight Live Search (Cmd+K)");
    btn.setAttribute("aria-label", "Spotlight Search");
    btn.innerHTML = `
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
        <circle cx="11" cy="11" r="8"></circle>
        <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
      </svg>
    `;

    btn.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      openAppleSpotlightModal();
    });

    return btn;
  }

  // Create Microphone Button element
  function createMicButton() {
    const micBtn = document.createElement("button");
    micBtn.type = "button";
    micBtn.id = "voice-assistant-mic-btn";
    micBtn.setAttribute("title", "Voice Assistant (Click to Speak)");
    micBtn.setAttribute("aria-label", "Voice Assistant");
    micBtn.innerHTML = MIC_ICON_SVG;

    micBtn.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      toggleVoiceAssistant();
    });

    return micBtn;
  }

  // Bulletproof injection into search bar (isolated from React's submit/stop button container)
  function ensureVoiceButton() {
    const { composer } = getComposerElements();
    if (!composer) return null;

    getOrCreateBanner(composer);

    const legacyToolsBox = document.getElementById("nexus-composer-tools");
    if (legacyToolsBox) {
      legacyToolsBox.id = "nexus-toolbar-actions";
    }

    let toolsBox = document.getElementById("nexus-toolbar-actions");
    if (!toolsBox) {
      toolsBox = document.createElement("div");
      toolsBox.id = "nexus-toolbar-actions";
      toolsBox.style.cssText = "display:inline-flex;align-items:center;gap:6px;margin-left:6px;background:transparent;border:none;padding:0;box-shadow:none;";
    }

    const staleHistBtn = document.getElementById("search-history-trigger-btn");
    if (staleHistBtn) {
      staleHistBtn.remove();
    }

    let micBtn = document.getElementById("voice-assistant-mic-btn");
    if (!micBtn) {
      micBtn = createMicButton();
    }
    if (!toolsBox.contains(micBtn)) {
      toolsBox.appendChild(micBtn);
    }

    const actionRow =
      composer.querySelector(".flex.items-center.justify-between") ||
      composer;
    const leftGroup =
      (actionRow !== composer && actionRow.firstElementChild) || actionRow;

    if (leftGroup && !leftGroup.contains(toolsBox)) {
      leftGroup.appendChild(toolsBox);
    }
    return micBtn;
  }

  // ─────────────────── Attachment Category Selector ("Attach Research Material") ───────────────────
  const ATTACH_CATEGORIES = [
    {
      id: "pdf",
      iconSvg: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/></svg>`,
      name: "Research Papers & Documents",
      desc: "PDF, DOCX, TXT, LaTeX, Markdown",
      iconClass: "attach-icon-docs",
      accept: ".pdf,.doc,.docx,.txt,.csv,.md,.json,.xlsx,.pptx,.tex,application/pdf,text/*"
    },
    {
      id: "code",
      iconSvg: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/></svg>`,
      name: "Datasets & Code Repositories",
      desc: "CSV, JSON, Python, Jupyter, YAML",
      iconClass: "attach-icon-code",
      accept: ".csv,.json,.py,.ipynb,.yaml,.yml,.tsv,.sql,text/*"
    },
    {
      id: "photos",
      iconSvg: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>`,
      name: "Figures & Visual Evidence",
      desc: "PNG, JPG, SVG, WebP, Architecture Diagrams",
      iconClass: "attach-icon-figures",
      accept: "image/*,.png,.jpg,.jpeg,.webp,.gif,.svg,.heic"
    },
    {
      id: "audio",
      iconSvg: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" y1="19" x2="12" y2="23"/><line x1="8" y1="23" x2="16" y2="23"/></svg>`,
      name: "Audio & Lecture Notes",
      desc: "MP3, WAV, M4A, OGG, Voice Dictation",
      iconClass: "attach-icon-audio",
      accept: "audio/*,.mp3,.wav,.m4a,.ogg,.flac"
    },
    {
      id: "all",
      iconSvg: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg>`,
      name: "All Supported Formats",
      desc: "Any document, dataset, or archive package",
      iconClass: "attach-icon-all",
      accept: "*/*"
    }
  ];

  let attachMenuAnchorBtn = null;

  function closeAttachCategoryMenu() {
    const popover = document.getElementById("attach-category-popover");
    if (popover) {
      popover.remove();
    }
    attachMenuAnchorBtn = null;
  }

  function selectAttachCategory(acceptValue) {
    const targetAnchor = attachMenuAnchorBtn;
    closeAttachCategoryMenu();

    const fileInput =
      document.getElementById("upload-button-input") ||
      targetAnchor?.parentElement?.querySelector('input[type="file"]') ||
      document.querySelector('#message-composer input[type="file"]') ||
      document.querySelector('input[type="file"]');

    if (fileInput) {
      if (acceptValue) {
        fileInput.setAttribute("accept", acceptValue);
        fileInput.accept = acceptValue;
      }
      setTimeout(() => {
        fileInput.click();
      }, 50);
    }
  }

  function openAttachCategoryMenu(anchorBtn) {
    closeAttachCategoryMenu();
    attachMenuAnchorBtn = anchorBtn;

    // Suppress any active Radix/Chainlit tooltip so it doesn't leak out
    document.querySelectorAll('[role="tooltip"], [data-radix-popper-content-wrapper]').forEach((el) => {
      el.style.display = "none";
    });

    const rect = anchorBtn.getBoundingClientRect();
    const popover = document.createElement("div");
    popover.id = "attach-category-popover";
    popover.setAttribute("role", "dialog");
    popover.setAttribute("aria-label", "Attach Research Material");

    // Position popover right above the attach button
    const popoverWidth = 320;
    const popoverLeft = Math.max(12, Math.min(window.innerWidth - popoverWidth - 12, rect.left - 4));
    const popoverBottom = Math.max(12, Math.round(window.innerHeight - rect.top + 8));
    const arrowLeft = Math.max(16, Math.min(popoverWidth - 24, Math.round(rect.left + rect.width / 2 - popoverLeft)));

    popover.style.left = `${popoverLeft}px`;
    popover.style.bottom = `${popoverBottom}px`;

    // Dynamic style for arrow alignment
    const arrowStyle = document.createElement("style");
    arrowStyle.textContent = `#attach-category-popover::after { left: ${arrowLeft}px !important; }`;
    popover.appendChild(arrowStyle);

    // Build content
    popover.innerHTML += `
      <div class="attach-menu-header">
        <div class="attach-menu-header-text">
          <div class="attach-menu-title">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" style="opacity: 0.85;">
              <path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"></path>
            </svg>
            <span>Attach Research Material</span>
          </div>
          <div class="attach-menu-subtitle">Upload context to ground multi-agent synthesis</div>
        </div>
        <button type="button" class="attach-menu-close" id="attach-menu-close-btn" aria-label="Close">
          ${CLOSE_ICON_SVG}
        </button>
      </div>
      <div class="attach-options-list">
        ${ATTACH_CATEGORIES.map(
          (cat) => `
          <button type="button" class="attach-option-btn" data-accept="${cat.accept}">
            <div class="attach-option-icon ${cat.iconClass}">
              ${cat.iconSvg}
            </div>
            <div class="attach-option-content">
              <div class="attach-option-name">${cat.name}</div>
              <div class="attach-option-desc">${cat.desc}</div>
            </div>
          </button>
        `
        ).join("")}
      </div>
    `;

    document.body.appendChild(popover);

    // Event handlers
    popover.querySelector("#attach-menu-close-btn")?.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      closeAttachCategoryMenu();
    });

    popover.querySelectorAll(".attach-option-btn").forEach((btn) => {
      btn.addEventListener("click", (e) => {
        e.preventDefault();
        e.stopPropagation();
        const accept = btn.getAttribute("data-accept") || "*/*";
        selectAttachCategory(accept);
      });
    });
  }

  function toggleAttachCategoryMenu(anchorBtn) {
    const popover = document.getElementById("attach-category-popover");
    if (popover) {
      closeAttachCategoryMenu();
    } else {
      openAttachCategoryMenu(anchorBtn);
    }
  }

  function isAttachButton(el) {
    if (!el) return null;
    if (!(el instanceof Element)) {
      el = el.parentElement;
    }
    if (!el) return null;
    // Crucial: never intercept the file input element itself
    if (el.tagName === "INPUT" || el.type === "file" || el.closest("input")) return null;

    return el.closest(
      'button#upload-button, button#upload-button-loading, button[id*="upload"], button[data-testid*="upload"], button[aria-label*="attach" i], button[title*="attach" i], button[aria-label*="file" i]'
    );
  }

  // Global capture click handler for attachment button intercept
  function setupAttachFileInterceptor() {
    if (window.__attachInterceptorInitialized) return;
    window.__attachInterceptorInitialized = true;

    // Intercept in capture phase so React Dropzone doesn't immediately open the file picker
    document.addEventListener(
      "click",
      (e) => {
        // If clicking inside the popover itself, allow its internal events
        if (e.target.closest("#attach-category-popover")) {
          return;
        }

        const attachBtn = isAttachButton(e.target);
        if (attachBtn) {
          e.preventDefault();
          e.stopPropagation();
          e.stopImmediatePropagation();
          toggleAttachCategoryMenu(attachBtn);
          return;
        }

        // Outside click closes the popover
        const popover = document.getElementById("attach-category-popover");
        if (popover && !popover.contains(e.target)) {
          closeAttachCategoryMenu();
        }
      },
      true // CAPTURE PHASE!
    );

    // Close on Escape key
    window.addEventListener("keydown", (e) => {
      if (e.key === "Escape") {
        closeAttachCategoryMenu();
      }
    });

    // Close on window resize / scroll to prevent detached popover
    window.addEventListener("resize", closeAttachCategoryMenu, { passive: true });
    window.addEventListener("scroll", closeAttachCategoryMenu, { passive: true });
    window.__openAttachCategoryMenu = openAttachCategoryMenu;
  }

  // Bulletproof injection into search bar & header
  function ensureHistoryAndVoiceUI() {
    // 0. Ensure Active Left Chat History Sidebar is mounted & visible
    initActiveChatHistorySidebar();
    injectHeaderSidebarToggle();

    // 1. Remove any stale/broken MorphOrb mount if present
    const staleMount = document.getElementById("morph-orb-mount");
    if (staleMount) {
      staleMount.remove();
      console.log("[UI] Removed stale morph-orb mount.");
    }

    const { composer, submitBtn } = getComposerElements();
    if (composer) {
      const welcomeScreen = document.getElementById("welcome-screen") || document.querySelector(".welcome-screen");
      const animatedChatMount = document.getElementById("animated-ai-chat-mount");
      const hasMessages =
        document.body.classList.contains("viewing-restored-chat") ||
        document.querySelectorAll('.step[data-step-type="user_message"], .step[data-step-type="assistant_message"], .ai-message').length > 0;
      const isSubmitting = (window.__chainlitSubmittingUntil || 0) > Date.now();
      if (welcomeScreen && animatedChatMount && !hasMessages && !isSubmitting) {
        // Tuck native composer off-screen while AnimatedAIChat is active on welcome screen
        composer.style.opacity = "0";
        composer.style.pointerEvents = "none";
        composer.style.position = "fixed";
        composer.style.bottom = "-250px";
        composer.style.left = "0";
      } else {
        // Guarantee the composer and search bar are ALWAYS visible during active chat
        composer.style.visibility = "visible";
        composer.style.display = "";
        composer.style.height = "auto";
        composer.style.overflow = "visible";
        composer.style.pointerEvents = "auto";
        composer.style.opacity = "1";
        composer.style.position = "";
        composer.style.bottom = "";
        composer.style.left = "";
      }
    }

    ensureVoiceButton();

    hookHistoryCaptures();
    observeAssistantResponsesForHistory();
  }

  // ────────────────── Mermaid Interactive Diagram Renderer ──────────────────
  let mermaidLoaded = false;
  let mermaidLoading = false;
  let mermaidCounter = 0;

  function loadMermaidScript(callback) {
    if (window.mermaid) {
      mermaidLoaded = true;
      if (callback) callback();
      return;
    }
    if (mermaidLoading) {
      if (callback) {
        const check = setInterval(() => {
          if (window.mermaid) {
            clearInterval(check);
            callback();
          }
        }, 100);
      }
      return;
    }
    mermaidLoading = true;
    const parentEl = document.head || document.body || document.documentElement;
    if (!parentEl) return;

    const script = document.createElement("script");
    script.src = "/public/mermaid.min.js";
    script.onload = () => {
      mermaidLoaded = true;
      mermaidLoading = false;
      try {
        const isDark = document.documentElement.classList.contains("dark") || (document.body && document.body.classList.contains("dark"));
        window.mermaid.initialize({
          startOnLoad: false,
          suppressErrorRendering: true,
          theme: isDark ? "dark" : "neutral",
          securityLevel: "loose",
          flowchart: { useMaxWidth: true, htmlLabels: true, curve: "basis" },
          fontFamily: "Plus Jakarta Sans, sans-serif"
        });
        console.log("[Mermaid] Engine initialized successfully from local bundle.");
      } catch (e) {
        console.warn("[Mermaid] Init error:", e);
      }
      if (callback) callback();
    };
    script.onerror = () => {
      console.warn("[Mermaid] Local script failed, falling back to CDN...");
      const cdnScript = document.createElement("script");
      cdnScript.src = "https://cdn.jsdelivr.net/npm/mermaid@10/dist/mermaid.min.js";
      cdnScript.onload = () => {
        mermaidLoaded = true;
        mermaidLoading = false;
        try {
          const isDark = document.documentElement.classList.contains("dark") || (document.body && document.body.classList.contains("dark"));
          window.mermaid.initialize({
            startOnLoad: false,
            suppressErrorRendering: true,
            theme: isDark ? "dark" : "neutral",
            securityLevel: "loose",
            flowchart: { useMaxWidth: true, htmlLabels: true, curve: "basis" },
            fontFamily: "Plus Jakarta Sans, sans-serif"
          });
        } catch (e) {}
        if (callback) callback();
      };
      parentEl.appendChild(cdnScript);
    };
    parentEl.appendChild(script);
  }

  function cleanupMermaidErrorNodes() {
    document
      .querySelectorAll(
        'body > div[id^="dmermaid-"], body > svg[id^="mermaid-"], svg[aria-roledescription="error"], svg.error-icon'
      )
      .forEach((node) => {
        const wrapper = node.closest('body > div[id^="dmermaid-"]') || node;
        wrapper.remove();
      });
  }

  function sanitizeMermaidCode(raw) {
    let text = String(raw || "")
      .replace(/^```(?:mermaid)?\s*/i, "")
      .replace(/\s*```$/i, "")
      .replace(/[“”]/g, '"')
      .replace(/[‘’]/g, "'")
      .trim();

    const lines = text.split(/\r?\n/).map((line) => {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("%%")) return line;

      // Quote unquoted rectangular node labels: ID[Label (with parens/colons)] -> ID["Label (with parens/colons)"]
      let updated = line.replace(
        /(\b[A-Za-z0-9_]+)\[\s*(?![\"\[\(\/\\])([^\]]+?)\s*\]/g,
        (_, id, label) => `${id}["${label.replace(/"/g, "'")}"]`
      );

      // Quote unquoted edge labels containing parens/colons/brackets: -->|Label (info)| -> -->|"Label (info)"|
      updated = updated.replace(
        /\|([^|\n"]*[\(\)\[\]:/][^|\n"]*)\|/g,
        (_, label) => `|"${label.replace(/"/g, "'")}"|`
      );

      return updated;
    });

    return lines.join("\n");
  }

  async function renderMermaidDiagrams() {
    cleanupMermaidErrorNodes();

    if (!window.mermaid) {
      loadMermaidScript(renderMermaidDiagrams);
      return;
    }

    const elements = [];
    document.querySelectorAll('code[class*="language-mermaid"], pre[class*="language-mermaid"], div[class*="language-mermaid"]').forEach(el => {
      if (!el.dataset.mermaidProcessed) elements.push(el);
    });

    document.querySelectorAll("pre code, .code-node code").forEach(el => {
      if (el.dataset.mermaidProcessed) return;
      const text = (el.textContent || "").trim();
      if (
        text.startsWith("graph ") ||
        text.startsWith("flowchart ") ||
        text.startsWith("sequenceDiagram") ||
        text.startsWith("classDiagram") ||
        text.startsWith("stateDiagram") ||
        text.startsWith("erDiagram")
      ) {
        elements.push(el);
      }
    });

    for (const el of elements) {
      const rawCode = (el.textContent || "").trim();
      if (!rawCode) continue;

      const code = sanitizeMermaidCode(rawCode);
      const id = `mermaid-render-${Date.now()}-${++mermaidCounter}`;
      try {
        const isDark = document.documentElement.classList.contains("dark") || document.body.classList.contains("dark");
        window.mermaid.initialize({
          startOnLoad: false,
          suppressErrorRendering: true,
          theme: isDark ? "dark" : "neutral",
          securityLevel: "loose",
          flowchart: { useMaxWidth: true, htmlLabels: false, curve: "basis", padding: 18 },
          fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif"
        });

        if (typeof window.mermaid.parse === "function") {
          const valid = await window.mermaid.parse(code, { suppressErrors: true });
          if (valid === false) {
            cleanupMermaidErrorNodes();
            continue;
          }
        }

        el.dataset.mermaidProcessed = "true";
        const { svg } = await window.mermaid.render(id, code);
        cleanupMermaidErrorNodes();
        if (svg && (svg.includes('aria-roledescription="error"') || svg.includes("Syntax error in text"))) {
          continue;
        }

        const preEl = el.closest("pre") || el;
        // Find Chainlit's outer code-block wrapper (which has the "mermaid" label & copy icon) so we replace it cleanly
        let blockToReplace = preEl;
        if (
          preEl.parentElement &&
          preEl.parentElement.tagName === "DIV" &&
          !preEl.parentElement.classList.contains("message-content") &&
          !preEl.parentElement.classList.contains("markdown") &&
          preEl.parentElement.children.length <= 3
        ) {
          blockToReplace = preEl.parentElement;
        }

        const card = document.createElement("div");
        card.className = "nx-diagram-card";
        card.innerHTML = `
          <div class="nx-diagram-header">
            <span class="nx-diagram-title">
              <svg style="width:15px;height:15px;" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M7 12l3-3 3 3 4-4M8 21l4-4 4 4M3 4h18M4 4h16v12a1 1 0 01-1 1H5a1 1 0 01-1-1V4z"/></svg>
              <span>Architecture & Workflow Diagram</span>
            </span>
            <div class="nx-diagram-actions">
              <button type="button" class="nx-diagram-btn nx-toggle-src">Source Code</button>
              <button type="button" class="nx-diagram-btn nx-copy-src">Copy</button>
            </div>
          </div>
          <div class="nx-diagram-canvas">
            ${svg}
          </div>
          <div class="nx-diagram-source" style="display: none;">
            <pre>${rawCode.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")}</pre>
          </div>
        `;

        const toggleBtn = card.querySelector(".nx-toggle-src");
        const copyBtn = card.querySelector(".nx-copy-src");
        const rawSrc = card.querySelector(".nx-diagram-source");
        if (toggleBtn && rawSrc) {
          toggleBtn.addEventListener("click", () => {
            const isHidden = rawSrc.style.display === "none";
            rawSrc.style.display = isHidden ? "block" : "none";
            toggleBtn.textContent = isHidden ? "Hide Source" : "Source Code";
          });
        }
        if (copyBtn) {
          copyBtn.addEventListener("click", () => {
            navigator.clipboard.writeText(rawCode).then(() => {
              copyBtn.textContent = "Copied!";
              setTimeout(() => { copyBtn.textContent = "Copy"; }, 1800);
            });
          });
        }

        blockToReplace.parentNode.insertBefore(card, blockToReplace);
        blockToReplace.dataset.mermaidHidden = "true";
        blockToReplace.style.display = "none";
      } catch (err) {
        cleanupMermaidErrorNodes();
        console.warn("[Mermaid] Could not render diagram:", err);
      }
    }
  }

  // ─────────────────── Professional Center Hero Branding ───────────────────
  let animatedChatLoaded = false;
  function loadAnimatedAIChatBundle() {
    if (animatedChatLoaded) return;
    animatedChatLoaded = true;
    const head = document.head || document.documentElement;
    if (!head) return;

    if (!document.getElementById("animated-ai-chat-css")) {
      const link = document.createElement("link");
      link.id = "animated-ai-chat-css";
      link.rel = "stylesheet";
      link.href = "/public/multi-agent-system-ui.css?v=20261113_chat_v7";
      head.appendChild(link);
    }

    if (!document.getElementById("animated-ai-chat-script")) {
      const script = document.createElement("script");
      script.id = "animated-ai-chat-script";
      script.src = "/public/animated-ai-chat.js?v=20261113_chat_v7";
      script.defer = true;
      head.appendChild(script);
    }
  }

  function ensureWelcomeScreenBranding() {
    loadAnimatedAIChatBundle();

    const welcomeScreen =
      document.getElementById("welcome-screen") ||
      document.querySelector(".welcome-screen");

    if (welcomeScreen) {
      // Hide any default Chainlit pink petal logo images
      const logos = welcomeScreen.querySelectorAll("img.logo, img[alt='logo'], img[src*='logo']");
      logos.forEach((img) => {
        if (!img.closest("#animated-ai-chat-mount")) {
          img.style.display = "none";
          img.style.visibility = "hidden";
        }
      });

      const oldHero = document.getElementById("research-assistant-center-hero");
      if (oldHero) {
        oldHero.style.display = "none";
      }
    }
  }

  // ─────────────────── Professional File Attachment Cards ───────────────────
  function enhanceAttachmentCards() {
    const fileLinks = document.querySelectorAll(
      'a.inline-file:not([data-enhanced="true"]), a.side-file:not([data-enhanced="true"]), a[download]:not([data-enhanced="true"])'
    );

    fileLinks.forEach((a) => {
      a.dataset.enhanced = "true";
      const name = a.getAttribute("download") || a.textContent.trim();
      const extMatch = name.match(/\.([a-zA-Z0-9]+)$/);
      const ext = extMatch ? extMatch[1].toLowerCase() : "";

      let badgeLabel = "";
      let badgeColor = "";
      if (ext === "ipynb") {
        badgeLabel = "Jupyter Notebook";
        badgeColor = "#f59e0b";
      } else if (ext === "pdf") {
        badgeLabel = "PDF Document";
        badgeColor = "#ef4444";
      } else if (["csv", "xlsx", "xls"].includes(ext)) {
        badgeLabel = "Spreadsheet Data";
        badgeColor = "#10b981";
      } else if (["py", "js", "ts", "html", "css", "json", "sql"].includes(ext)) {
        badgeLabel = "Source Code";
        badgeColor = "#6366f1";
      } else if (["png", "jpg", "jpeg", "webp"].includes(ext)) {
        badgeLabel = "Image";
        badgeColor = "#ec4899";
      }

      if (badgeLabel && !a.querySelector(".custom-file-type-badge")) {
        const badge = document.createElement("span");
        badge.className = "custom-file-type-badge";
        badge.textContent = badgeLabel;
        badge.style.cssText = `
          display: inline-block;
          font-size: 0.68rem;
          font-weight: 700;
          color: ${badgeColor};
          background: rgba(255, 255, 255, 0.08);
          border: 1px solid ${badgeColor}40;
          padding: 2px 7px;
          border-radius: 6px;
          margin-top: 4px;
          text-transform: uppercase;
          letter-spacing: 0.03em;
        `;
        const innerContainer = a.querySelector(".truncate") || a.querySelector("div") || a;
        if (innerContainer && innerContainer.parentNode) {
          innerContainer.parentNode.appendChild(badge);
        }
      }
    });

    // Guarantee all message steps and assistant responses remain visible
    document.querySelectorAll('.step, div[data-step-type]').forEach((el) => {
      if (el.style.display === "none" && !el.dataset.mermaidHidden) {
        el.style.display = "";
      }
      el.querySelectorAll('button[role="switch"]').forEach(sw => sw.style.display = "none");
    });
  }

  // Main lifecycle loop
  function setup() {
    try { initActiveChatHistorySidebar(); } catch (e) { console.error("[Sidebar Error]", e); }
    try { ensureHistoryAndVoiceUI(); } catch (e) { console.error("[UI Error]", e); }
    try { setupAttachFileInterceptor(); } catch (e) {}
    try { ensureWelcomeScreenBranding(); } catch (e) {}
    try { enhanceAttachmentCards(); } catch (e) {}
    try { injectReadAloudButtons(); } catch (e) {}
    try { loadMermaidScript(); } catch (e) {}
    try { renderMermaidDiagrams(); } catch (e) {}

    let mutationScheduled = false;
    const observer = new MutationObserver(() => {
      if (mutationScheduled) return;
      mutationScheduled = true;
      requestAnimationFrame(() => {
        mutationScheduled = false;
        try { ensureWelcomeScreenBranding(); } catch (e) {}
        try { ensureHistoryAndVoiceUI(); } catch (e) {}
        try { enhanceAttachmentCards(); } catch (e) {}
        try { injectReadAloudButtons(); } catch (e) {}
        try { renderMermaidDiagrams(); } catch (e) {}
      });
    });

    if (document.body) {
      observer.observe(document.body, {
        childList: true,
        subtree: true,
      });
    }

    setInterval(() => {
      try { ensureWelcomeScreenBranding(); } catch (e) {}
      try { ensureHistoryAndVoiceUI(); } catch (e) {}
      try { enhanceAttachmentCards(); } catch (e) {}
      try { injectReadAloudButtons(); } catch (e) {}
      try { renderMermaidDiagrams(); } catch (e) {}
    }, 600);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", setup);
  } else {
    setup();
  }
})();

/* ───────────── Live "Thinking" state tagging for agent steps ───────────── */
(function () {
  function tagThinkingSteps() {
    const steps = document.querySelectorAll(
      '.step:not([data-step-type="user_message"]):not([data-step-type="assistant_message"]), div[data-step-type="run"]'
    );
    steps.forEach((el) => {
      const head = (el.textContent || "").trim().slice(0, 8);
      const running = /^Using/i.test(head);
      if (running) el.setAttribute("data-thinking", "true");
      else el.removeAttribute("data-thinking");
    });
  }
  setInterval(() => { try { tagThinkingSteps(); } catch (e) {} }, 400);
})();
