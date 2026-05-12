const API_BASE = '/api/v1/tts';

const state = {
  mode: 'short',
  voice: 'en-US-JennyNeural',
  rate: 0,
  pitch: 0,
  isGenerating: false,
  jobId: null,
  pollingInterval: null,
};

const dom = {
  modeBtns: () => document.querySelectorAll('.mode-toggle__btn'),
  textarea: () => document.getElementById('tts-text'),
  charCount: () => document.getElementById('char-count'),
  voiceSelect: () => document.getElementById('voice-select'),
  rateSlider: () => document.getElementById('rate-slider'),
  rateValue: () => document.getElementById('rate-value'),
  pitchSlider: () => document.getElementById('pitch-slider'),
  pitchValue: () => document.getElementById('pitch-value'),
  generateBtn: () => document.getElementById('generate-btn'),
  generateText: () => document.getElementById('generate-text'),
  resultArea: () => document.getElementById('result-area'),
  audioSource: () => document.getElementById('audio-source'),
  audioElement: () => document.getElementById('audio-element'),
  downloadLink: () => document.getElementById('download-link'),
  progressSection: () => document.getElementById('progress-section'),
  progressFill: () => document.getElementById('progress-fill'),
  progressPercent: () => document.getElementById('progress-percent'),
  progressChunks: () => document.getElementById('progress-chunks'),
  progressStatus: () => document.getElementById('progress-status'),
  errorArea: () => document.getElementById('error-area'),
  voiceLoading: () => document.getElementById('voice-loading'),
};

function updateCharCount() {
  const len = dom.textarea().value.length;
  const max = state.mode === 'short' ? 5000 : 50000;
  dom.charCount().textContent = `${len} / ${max}`;
  dom.charCount().classList.remove('textarea__char-count--warn', 'textarea__char-count--error');
  if (len > max) dom.charCount().classList.add('textarea__char-count--error');
  else if (len > max * 0.9) dom.charCount().classList.add('textarea__char-count--warn');
}

function setMode(mode) {
  state.mode = mode;
  dom.modeBtns().forEach(btn => {
    btn.classList.toggle('mode-toggle__btn--active', btn.dataset.mode === mode);
  });
  const max = mode === 'short' ? 5000 : 50000;
  dom.textarea().setAttribute('maxlength', max);
  updateCharCount();
  hideError();
  hideResult();
  hideProgress();
}

function showError(msg) { dom.errorArea().classList.remove('hidden'); dom.errorArea().textContent = msg; }
function hideError() { dom.errorArea().classList.add('hidden'); dom.errorArea().textContent = ''; }

function showLoading() {
  state.isGenerating = true;
  dom.generateBtn().disabled = true;
  dom.generateText().innerHTML = '<span class="spinner"></span> Generating...';
}

function hideLoading() {
  state.isGenerating = false;
  dom.generateBtn().disabled = false;
  dom.generateText().textContent = 'Generate Speech';
}

function showResult(url, filename) {
  dom.resultArea().classList.remove('hidden');
  dom.audioSource().src = url;
  dom.audioElement().load();
  dom.downloadLink().href = url;
  dom.downloadLink().download = filename || 'speech.mp3';
}

function hideResult() { dom.resultArea().classList.add('hidden'); dom.audioSource().src = ''; }
function showProgress() { dom.progressSection().classList.remove('hidden'); }
function hideProgress() { dom.progressSection().classList.add('hidden'); }

function updateProgress(progress) {
  const pct = Math.round(progress.progress || 0);
  dom.progressFill().style.width = `${pct}%`;
  dom.progressPercent().textContent = `${pct}%`;
  dom.progressChunks().textContent = `Chunks: ${progress.completed_chunks || 0} / ${progress.total_chunks || 0}`;
  dom.progressStatus().textContent = `Status: ${progress.status}`;
}

async function generateShort() {
  const text = dom.textarea().value.trim();
  if (!text) { showError('Please enter some text.'); return; }
  if (text.length > 5000) { showError('Short mode supports max 5000 characters. Switch to Long Audio mode.'); return; }
  hideError(); hideResult(); hideProgress(); showLoading();
  try {
    const payload = {
      text, voice: state.voice,
      rate: `${state.rate > 0 ? '+' : ''}${state.rate}%`,
      pitch: `${state.pitch > 0 ? '+' : ''}${state.pitch}Hz`,
    };
    const res = await fetch(`${API_BASE}/generate`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload),
    });
    if (!res.ok) { const err = await res.json().catch(() => ({})); throw new Error(err.detail || `HTTP ${res.status}`); }
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const disposition = res.headers.get('Content-Disposition') || '';
    const match = disposition.match(/filename="?(.+?)"?$/);
    showResult(url, match ? match[1] : 'speech.mp3');
  } catch (err) { showError(err.message || 'Generation failed.'); }
  finally { hideLoading(); }
}

async function startLongAudio() {
  const text = dom.textarea().value.trim();
  if (!text) { showError('Please enter some text.'); return; }
  if (text.length > 50000) { showError('Maximum 50000 characters allowed.'); return; }
  if (text.length <= 5000) { showError('Text is under 5000 characters. Use Short mode instead.'); return; }
  hideError(); hideResult(); hideProgress(); showLoading();
  try {
    const payload = {
      text, voice: state.voice,
      rate: `${state.rate > 0 ? '+' : ''}${state.rate}%`,
      pitch: `${state.pitch > 0 ? '+' : ''}${state.pitch}Hz`,
    };
    const res = await fetch(`${API_BASE}/generate-long-audio`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload),
    });
    if (!res.ok) { const err = await res.json().catch(() => ({})); throw new Error(err.detail || `HTTP ${res.status}`); }
    const data = await res.json();
    state.jobId = data.job_id;
    hideLoading(); showProgress(); startPolling(state.jobId);
  } catch (err) { hideLoading(); showError(err.message || 'Failed to start long audio generation.'); }
}

async function pollJob(jobId) {
  try {
    const res = await fetch(`${API_BASE}/job/${jobId}`);
    if (!res.ok) throw new Error('Job fetch failed');
    const job = await res.json();
    updateProgress(job);
    if (job.status === 'completed') {
      stopPolling();
      showResult(`${API_BASE}/job/${jobId}/download`, `long_speech_${jobId}.mp3`);
      hideProgress(); hideLoading();
    } else if (job.status === 'failed') {
      stopPolling(); hideProgress(); hideLoading();
      showError(job.error || 'Long audio generation failed.');
    }
  } catch (err) { stopPolling(); hideProgress(); hideLoading(); showError('Failed to check job progress.'); }
}

function startPolling(jobId) {
  stopPolling();
  dom.generateText().textContent = 'Processing...';
  dom.generateBtn().disabled = true;
  state.pollingInterval = setInterval(() => pollJob(jobId), 2000);
}

function stopPolling() {
  if (state.pollingInterval) { clearInterval(state.pollingInterval); state.pollingInterval = null; }
  dom.generateBtn().disabled = false;
  dom.generateText().textContent = 'Generate Speech';
}

async function loadVoices() {
  dom.voiceLoading().classList.remove('hidden');
  try {
    const res = await fetch(`${API_BASE}/voices`);
    if (!res.ok) throw new Error('Failed to load voices');
    const voices = await res.json();
    const select = dom.voiceSelect();
    select.innerHTML = '';
    const flags = {
      'en-US':'🇺🇸','en-GB':'🇬🇧','en-AU':'🇦🇺','en-CA':'🇨🇦','en-IN':'🇮🇳','en-IE':'🇮🇪',
      'en-NZ':'🇳🇿','en-PH':'🇵🇭','en-ZA':'🇿🇦','ar-EG':'🇪🇬','ar-SA':'🇸🇦','bg-BG':'🇧🇬',
      'ca-ES':'🇪🇸','cs-CZ':'🇨🇿','da-DK':'🇩🇰','de-AT':'🇦🇹','de-CH':'🇨🇭','de-DE':'🇩🇪',
      'el-GR':'🇬🇷','es-AR':'🇦🇷','es-ES':'🇪🇸','es-MX':'🇲🇽','fi-FI':'🇫🇮','fr-BE':'🇧🇪',
      'fr-CA':'🇨🇦','fr-CH':'🇨🇭','fr-FR':'🇫🇷','he-IL':'🇮🇱','hi-IN':'🇮🇳','hr-HR':'🇭🇷',
      'hu-HU':'🇭🇺','id-ID':'🇮🇩','it-IT':'🇮🇹','ja-JP':'🇯🇵','ko-KR':'🇰🇷','ms-MY':'🇲🇾',
      'nb-NO':'🇳🇴','nl-BE':'🇧🇪','nl-NL':'🇳🇱','pl-PL':'🇵🇱','pt-BR':'🇧🇷','pt-PT':'🇵🇹',
      'ro-RO':'🇷🇴','ru-RU':'🇷🇺','sk-SK':'🇸🇰','sl-SI':'🇸🇮','sv-SE':'🇸🇪',
      'ta-IN':'🇮🇳','te-IN':'🇮🇳','th-TH':'🇹🇭','tr-TR':'🇹🇷','uk-UA':'🇺🇦',
      'vi-VN':'🇻🇳','zh-CN':'🇨🇳','zh-HK':'🇭🇰','zh-TW':'🇹🇼',
    };
    voices.forEach(v => {
      const opt = document.createElement('option');
      opt.value = v.ShortName || v.Name;
      const flag = flags[v.Locale] || '🌐';
      opt.textContent = `${flag} ${v.FriendlyName || v.ShortName} (${v.Locale})`;
      select.appendChild(opt);
    });
    select.value = state.voice;
  } catch (err) {
    dom.voiceSelect().innerHTML = '<option value="en-US-JennyNeural">🇺🇸 Jenny (English US)</option>';
  } finally { dom.voiceLoading().classList.add('hidden'); }
}

function handleGenerate() { if (state.isGenerating) return; state.mode === 'short' ? generateShort() : startLongAudio(); }

function init() {
  dom.textarea().addEventListener('input', updateCharCount);
  dom.voiceSelect().addEventListener('change', e => { state.voice = e.target.value; });
  dom.rateSlider().addEventListener('input', e => {
    state.rate = parseInt(e.target.value);
    dom.rateValue().textContent = `${state.rate > 0 ? '+' : ''}${state.rate}%`;
  });
  dom.pitchSlider().addEventListener('input', e => {
    state.pitch = parseInt(e.target.value);
    dom.pitchValue().textContent = `${state.pitch > 0 ? '+' : ''}${state.pitch}Hz`;
  });
  dom.modeBtns().forEach(btn => btn.addEventListener('click', () => setMode(btn.dataset.mode)));
  dom.generateBtn().addEventListener('click', handleGenerate);
  dom.textarea().addEventListener('keydown', e => { if (e.key === 'Enter' && e.ctrlKey) { e.preventDefault(); handleGenerate(); } });
  updateCharCount();
  loadVoices();
}

document.addEventListener('DOMContentLoaded', init);
