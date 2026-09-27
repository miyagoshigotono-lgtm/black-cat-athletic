/**
 * クリアしたステージの記録（この端末のブラウザにだけ残る）。
 * 保存できない環境（プライベートウィンドウなど）でも遊べるよう、失敗しても黙って無視する。
 */
const KEY = 'kuroneko.cleared';

function load(): Set<string> {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return new Set();
    const list: unknown = JSON.parse(raw);
    return new Set(Array.isArray(list) ? list.filter((v): v is string => typeof v === 'string') : []);
  } catch {
    return new Set();
  }
}

/** そのステージをクリア済みか */
export function isCleared(stageId: string): boolean {
  return load().has(stageId);
}

/** クリアを記録する */
export function markCleared(stageId: string): void {
  try {
    const set = load();
    set.add(stageId);
    localStorage.setItem(KEY, JSON.stringify([...set]));
  } catch {
    // 保存できなくても遊びには影響しない
  }
}
