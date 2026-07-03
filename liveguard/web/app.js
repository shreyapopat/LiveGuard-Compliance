// =====================================================================
// LiveGuard frontend.
//
// Real pieces:
//   - WebRTC RTCPeerConnection carries live mic audio between the agent
//     and customer tabs (getUserMedia + real ICE/SDP negotiation).
//   - Web Speech API (webkitSpeechRecognition) does on-device/browser
//     streaming STT on each side's own mic and ships finalized chunks to
//     the server over the same WebSocket used for signaling.
// Simulated pieces (see README/ASSUMPTIONS):
//   - No real telephony/PBX — both parties are browser tabs.
//   - The "call" is peer-to-peer over WebRTC with the server only doing
//     signaling + compliance analysis, not audio relay (SFU-style
//     scaling is future work).
// =====================================================================

const WS_URL = (location.protocol === 'https:' ? 'wss://' : 'ws://') + location.host + '/ws';
const API_BASE = location.origin + '/api';

const state = {
  role: null,
  callId: null,
  productType: 'loan',
  ws: null,
  pc: null,
  localStream: null,
  recognition: null,
  callStartTime: null,
  timerHandle: null,
};

// ---------- Landing screen ----------
document.querySelectorAll('.role-card').forEach((btn) => {
  btn.addEventListener('click', () => startAs(btn.dataset.role));
});

function startAs(role) {
  const callIdInput = document.getElementById('callIdInput').value.trim();
  state.callId = callIdInput || cryptoRandomId();
  state.productType = document.getElementById('productTypeInput').value;
  state.role = role;

  document.getElementById('landing').classList.add('hidden');
  if (role === 'agent') {
    document.getElementById('agentView').classList.remove('hidden');
    document.getElementById('callIdLabel').textContent = 'call: ' + state.callId;
  } else {
    document.getElementById('customerView').classList.remove('hidden');
  }
  initCall();
}

function cryptoRandomId() {
  return 'call-' + Math.random().toString(36).slice(2, 8);
}

// ---------- Call bootstrap ----------
async function initCall() {
  try {
    await fetch(`${API_BASE}/calls/start`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ productType: state.productType }),
    });
  } catch (e) {
    console.warn('backend /calls/start unreachable — continuing with local-only session', e);
  }

  connectWebSocket();
  await setupMedia();
  setupPeerConnection();
  startTimer();
  setupSpeechRecognition();
}

function connectWebSocket() {
  state.ws = new WebSocket(WS_URL);
  state.ws.addEventListener('open', () => {
    state.ws.send(JSON.stringify({ type: 'join', callId: state.callId, role: state.role, productType: state.productType }));
  });
  state.ws.addEventListener('message', (ev) => handleWsMessage(JSON.parse(ev.data)));
  state.ws.addEventListener('close', () => setBadge('ended'));
}

async function setupMedia() {
  try {
    state.localStream = await navigator.mediaDevices.getUserMedia({ audio: true });
  } catch (e) {
    console.warn('mic permission denied — call will run in transcript-only mode', e);
  }
}

// ---------- WebRTC signaling (agent = offerer) ----------
function setupPeerConnection() {
  state.pc = new RTCPeerConnection({ iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] });

  if (state.localStream) {
    state.localStream.getTracks().forEach((t) => state.pc.addTrack(t, state.localStream));
  }

  state.pc.ontrack = (ev) => {
    const audioEl = document.createElement('audio');
    audioEl.autoplay = true;
    audioEl.srcObject = ev.streams[0];
    document.body.appendChild(audioEl);
  };

  state.pc.onicecandidate = (ev) => {
    if (ev.candidate) send({ type: 'webrtc-ice', candidate: ev.candidate });
  };

  state.pc.onconnectionstatechange = () => {
    if (state.pc.connectionState === 'connected') setBadge('live');
  };

  if (state.role === 'agent') {
    // agent proactively offers once joined; small delay lets both tabs join first
    setTimeout(async () => {
      const offer = await state.pc.createOffer();
      await state.pc.setLocalDescription(offer);
      send({ type: 'webrtc-offer', sdp: offer });
    }, 800);
  }
}

async function handleWsMessage(msg) {
  switch (msg.type) {
    case 'joined':
      setBadge('connecting');
      break;
    case 'webrtc-offer':
      await state.pc.setRemoteDescription(msg.sdp);
      const answer = await state.pc.createAnswer();
      await state.pc.setLocalDescription(answer);
      send({ type: 'webrtc-answer', sdp: answer });
      break;
    case 'webrtc-answer':
      await state.pc.setRemoteDescription(msg.sdp);
      break;
    case 'webrtc-ice':
      try { await state.pc.addIceCandidate(msg.candidate); } catch (e) { /* benign */ }
      break;
    case 'checklist':
      renderChecklist(msg.checklist);
      break;
    case 'nudge':
      renderNudge(msg);
      break;
    case 'call-ended':
      showSummary(msg);
      break;
    case 'peer-disconnected':
      setBadge('ended');
      break;
  }
}

function send(payload) {
  if (state.ws && state.ws.readyState === WebSocket.OPEN) state.ws.send(JSON.stringify(payload));
}

// ---------- Speech-to-text (Web Speech API) ----------
function setupSpeechRecognition() {
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SpeechRecognition) {
    console.warn('Web Speech API not supported in this browser — try Chrome or Edge.');
    logTranscript(state.role, '[Speech recognition unsupported in this browser — Chrome/Edge recommended]');
    return;
  }
  const rec = new SpeechRecognition();
  rec.continuous = true;
  rec.interimResults = true;
  rec.lang = 'en-US'; // single-language scope, see ASSUMPTIONS.md

  rec.onresult = (event) => {
    for (let i = event.resultIndex; i < event.results.length; i++) {
      const result = event.results[i];
      const text = result[0].transcript.trim();
      if (!text) continue;
      if (result.isFinal) {
        logTranscript(state.role, text);
        send({ type: 'transcript', speaker: state.role, text, isFinal: true });
      }
    }
  };
  rec.onerror = (e) => console.warn('speech recognition error', e.error);
  rec.onend = () => {
    // browsers auto-stop after silence; restart to keep it "streaming"
    try { rec.start(); } catch (e) { /* already running */ }
  };
  try { rec.start(); } catch (e) { console.warn(e); }
  state.recognition = rec;
}

// ---------- UI rendering ----------
function setBadge(status) {
  const map = { connecting: ['badge-connecting', 'connecting…'], live: ['badge-live', 'live'], ended: ['badge-ended', 'ended'] };
  const [cls, label] = map[status];
  ['callStatusBadge', 'custStatusBadge'].forEach((id) => {
    const el = document.getElementById(id);
    if (!el) return;
    el.className = 'badge ' + cls;
    el.textContent = label;
  });
}

function startTimer() {
  state.callStartTime = Date.now();
  state.timerHandle = setInterval(() => {
    const s = Math.floor((Date.now() - state.callStartTime) / 1000);
    const mm = String(Math.floor(s / 60)).padStart(2, '0');
    const ss = String(s % 60).padStart(2, '0');
    ['callTimer', 'custCallTimer'].forEach((id) => {
      const el = document.getElementById(id);
      if (el) el.textContent = `${mm}:${ss}`;
    });
  }, 1000);
}

function logTranscript(speaker, text) {
  const targets = speaker === 'agent'
    ? [document.getElementById('transcriptLog')]
    : [document.getElementById('transcriptLog'), document.getElementById('custTranscript')];
  targets.forEach((container) => {
    if (!container) return;
    const line = document.createElement('div');
    line.className = 'transcript-line ' + speaker;
    const ts = new Date().toLocaleTimeString([], { hour12: false });
    line.innerHTML = `<span class="ts">${ts}</span><span class="speaker">${speaker}</span>${escapeHtml(text)}`;
    container.appendChild(line);
    container.scrollTop = container.scrollHeight;
  });
}

function renderChecklist(checklist) {
  const el = document.getElementById('checklist');
  if (!el) return;
  el.innerHTML = '';
  let satisfiedCount = 0;
  checklist.forEach((item) => {
    if (item.status === 'satisfied') satisfiedCount++;
    const row = document.createElement('div');
    row.className = 'check-item ' + item.status;
    row.innerHTML = `
      <span class="icon">${item.status === 'satisfied' ? '✓' : '○'}</span>
      <span>
        <span class="rule-desc">${escapeHtml(item.description)}</span>
        <span class="rule-severity">${item.rule_id} · ${item.severity}</span>
      </span>`;
    el.appendChild(row);
  });
  const pct = checklist.length ? Math.round((satisfiedCount / checklist.length) * 100) : 0;
  const fill = document.getElementById('riskMeterFill');
  if (fill) {
    fill.style.width = pct + '%';
    fill.style.background = pct === 100 ? 'var(--teal)' : pct >= 50 ? 'var(--amber)' : 'var(--red)';
  }
}

function renderNudge(nudge) {
  const feed = document.getElementById('nudgeFeed');
  if (!feed) return;
  const empty = feed.querySelector('.empty-state');
  if (empty) empty.remove();
  const div = document.createElement('div');
  div.className = 'nudge ' + (nudge.severity || 'info');
  const ts = new Date().toLocaleTimeString([], { hour12: false });
  div.innerHTML = `${escapeHtml(nudge.message)}<span class="nudge-time">${ts}${nudge.confidence ? ' · confidence ' + Math.round(nudge.confidence * 100) + '%' : ''}</span>`;
  feed.prepend(div);
}

function showSummary(payload) {
  clearInterval(state.timerHandle);
  setBadge('ended');
  const modal = document.getElementById('summaryModal');
  if (!modal) return;
  document.getElementById('summaryText').textContent = payload.summary || 'Call ended.';
  const bandEl = document.getElementById('summaryRiskBand');
  bandEl.textContent = (payload.risk_band || 'n/a').toUpperCase();
  bandEl.className = 'risk-badge ' + (payload.risk_band || '');
  document.getElementById('summaryRiskScore').textContent = payload.risk_score != null ? `Risk score: ${payload.risk_score}/100` : '';
  modal.classList.remove('hidden');
}

document.getElementById('closeSummaryBtn')?.addEventListener('click', () => {
  document.getElementById('summaryModal').classList.add('hidden');
});

['endCallBtn', 'custEndCallBtn'].forEach((id) => {
  document.getElementById(id)?.addEventListener('click', () => {
    send({ type: 'end-call' });
    state.recognition?.stop();
  });
});

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}
