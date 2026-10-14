import { normalizeQuery, wordURL, audioURL, lookup } from './dictionary.js';

const form = document.querySelector('#search');
const input = document.querySelector('#word');
const result = document.querySelector('#result');
const status = document.querySelector('#status');
const source = document.querySelector('#source');
const main = document.querySelector('#main');
let controller;
let requestID = 0;
let currentAudio;

function node(tag, content = '', className = '') {
  const element = document.createElement(tag);
  element.textContent = content;
  if (className) element.className = className;
  return element;
}

function showStatus(message, error = false) {
  status.textContent = message;
  status.classList.toggle('error', error);
}

function render(data, id) {
  if (data.kind === 'missing') {
    showStatus('没有找到释义。请检查拼写，或打开原词典查看。');
    return;
  }
  if (data.kind === 'choices') {
    showStatus('请选择要查询的单词：');
    const choices = node('div', '', 'choices');
    for (const word of data.choices) {
      const button = node('button', word);
      button.addEventListener('click', () => { input.value = word; search(word); });
      choices.append(button);
    }
    result.append(choices);
    return;
  }
  showStatus(data.kind === 'basic' ? '未找到柯林斯释义，以下为有道基础释义。' : '');
  const entry = node('section', '', 'entry');
  entry.append(node('h2', data.word));
  if (data.pronunciation) entry.append(node('p', data.pronunciation, 'pronunciation'));
  const audioRow = node('div', '', 'audio-row');
  const audioError = node('p', '', 'audio-error');
  audioError.setAttribute('role', 'status');
  for (const [label, type] of [['英音', 1], ['美音', 2]]) {
    const button = node('button', `播放${label}`);
    button.addEventListener('click', async () => {
      currentAudio?.pause();
      audioError.textContent = '';
      const audio = new Audio(audioURL(data.word, type));
      currentAudio = audio;
      const failed = () => {
        if (requestID === id && currentAudio === audio) audioError.textContent = '发音暂时无法播放，请重试。';
      };
      audio.addEventListener('error', failed, { once: true });
      try { await audio.play(); } catch { failed(); }
    });
    audioRow.append(button);
  }
  entry.append(audioRow, audioError);
  if (data.metadata) entry.append(node('p', data.metadata, 'metadata'));
  result.append(entry, node('p', data.kind === 'collins' ? '柯林斯英汉双解' : '有道基础释义', 'section-label'));
  for (const [index, meaning] of data.meanings.entries()) {
    const section = node('section', '', 'meaning');
    const definition = node('div', '', 'definition');
    definition.append(node('span', `${index + 1}${meaning.part ? ` · ${meaning.part}` : ''}`, 'part'));
    const chineseStart = meaning.definition.search(/[\u3400-\u9fff]/);
    if (data.kind === 'collins' && chineseStart > 0) {
      definition.append(node('p', meaning.definition.slice(0, chineseStart).trim()),
        node('p', meaning.definition.slice(chineseStart).trim(), 'translation'));
    } else {
      definition.append(node('p', meaning.definition));
    }
    section.append(definition);
    for (const example of meaning.examples) {
      const block = node('div', '', 'example');
      if (example.english) { const english = node('p', example.english); english.lang = 'en'; block.append(english); }
      if (example.chinese) block.append(node('p', example.chinese));
      section.append(block);
    }
    result.append(section);
  }
}

async function search(value) {
  const id = ++requestID;
  controller?.abort();
  currentAudio?.pause();
  currentAudio = undefined;
  result.replaceChildren();
  main.scrollTop = 0;
  source.hidden = true;
  result.setAttribute('aria-busy', 'false');
  let query;
  try { query = normalizeQuery(value); } catch (error) {
    showStatus(error.message, true);
    input.focus();
    return;
  }
  input.value = query;
  source.href = wordURL(query);
  source.hidden = false;
  controller = new AbortController();
  const activeController = controller;
  const timeout = setTimeout(() => activeController.abort(), 12000);
  showStatus(`正在查询 ${query}…`);
  result.setAttribute('aria-busy', 'true');
  try {
    const data = await lookup(query, activeController.signal);
    if (id === requestID) render(data, id);
  } catch (error) {
    if (id === requestID) showStatus(activeController.signal.aborted
      ? '查询超时，请重试或打开原词典。'
      : error instanceof TypeError ? '无法连接词典，请检查网络后重试，或打开原词典。' : error.message, true);
  } finally {
    clearTimeout(timeout);
    if (id === requestID) result.setAttribute('aria-busy', 'false');
  }
}

form.addEventListener('submit', (event) => { event.preventDefault(); search(input.value); });
window.addEventListener('pagehide', () => { controller?.abort(); currentAudio?.pause(); });
