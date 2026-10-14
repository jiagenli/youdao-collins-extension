const ORIGIN = 'https://dict.youdao.com';
const text = (node) => node?.textContent?.replace(/\s+/g, ' ').trim() ?? '';

export function normalizeQuery(value) {
  const query = value.trim().replace(/[’‘]/g, "'").replace(/\s+/g, ' ');
  if (!query || query.length > 120 || !/[a-z]/i.test(query)
      || !/^[a-z0-9 '\-]+$/i.test(query)) {
    throw new Error('请输入英文单词或短语，最多 120 个字符。');
  }
  return query;
}

export function wordURL(query) {
  return `${ORIGIN}/w/eng/${encodeURIComponent(query)}`;
}

export function audioURL(word, type) {
  return `${ORIGIN}/dictvoice?audio=${encodeURIComponent(word)}&type=${type}`;
}

export function parseDictionary(html, query) {
  const document = new DOMParser().parseFromString(html, 'text/html');
  const collins = document.querySelector('.collinsToggle');
  const heading = collins?.querySelector('h4');
  const meanings = [];
  for (const translation of collins?.querySelectorAll('.collinsMajorTrans') ?? []) {
    const paragraph = translation.querySelector('p')?.cloneNode(true);
    const part = text(paragraph?.querySelector('.additional'));
    paragraph?.querySelectorAll('span').forEach((node) => node.remove());
    const definition = text(paragraph);
    if (!definition) continue;
    const examples = [...(translation.closest('li')?.querySelectorAll('.examples') ?? [])]
      .map((example) => ({ english: text(example.querySelector('p')), chinese: text(example.querySelectorAll('p')[1]) }))
      .filter((example) => example.english || example.chinese);
    meanings.push({ part, definition, examples });
  }
  if (meanings.length) {
    return {
      kind: 'collins', word: text(heading?.querySelector('.title')) || query,
      pronunciation: text(heading?.querySelector('.spell')),
      metadata: [text(heading?.querySelector('.pattern')), text(heading?.querySelector('.rank'))].filter(Boolean).join(' · '),
      meanings,
    };
  }
  const choices = [...document.querySelectorAll('#phrsListTab .wordGroup .search-js')]
    .map(text).filter(Boolean);
  if (choices.length) return { kind: 'choices', choices: [...new Set(choices)] };
  const fallback = [...document.querySelectorAll('#phrsListTab .trans-container li')]
    .map(text).filter(Boolean);
  if (fallback.length) {
    return {
      kind: 'basic', word: text(document.querySelector('.wordbook-js .keyword')) || query,
      pronunciation: text(document.querySelector('.wordbook-js .phonetic')),
      metadata: '', meanings: fallback.map((definition) => ({ part: '', definition, examples: [] })),
    };
  }
  return { kind: 'missing' };
}

export async function lookup(query, signal) {
  const response = await fetch(wordURL(query), { signal, credentials: 'omit', redirect: 'error' });
  if (!response.ok) throw new Error(`词典暂时无法访问（${response.status}），请重试或打开原词典。`);
  return parseDictionary(await response.text(), query);
}
