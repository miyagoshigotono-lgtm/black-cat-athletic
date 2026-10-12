import type { StageDef } from '../stages/stageTypes';
import { isCleared } from '../core/progress';

/** シリーズのタイトル画面（「ねこのアクション」側）。ここから両方のゲームに入れる */
const TITLE_URL = 'https://miyagoshigotono-lgtm.github.io/shobon/';

/** 選べるステージの並び（プレイ順）。stage が無い物は「準備中」として出す */
export interface StageEntry {
  id: string;
  label: string;
  note: string;
  stage?: StageDef;
}

/**
 * ステージ選択画面（起動時）。
 * URL に ?stage= が付いているときは出さない（検証用に直接開くため）。
 * 選ばれたステージを返す。
 */
export function showStageSelect(parent: HTMLElement, entries: StageEntry[]): Promise<StageDef> {
  return new Promise((resolve) => {
    const el = document.createElement('div');
    el.className = 'stage-select';

    const title = document.createElement('div');
    title.className = 'stage-select-title';
    title.textContent = 'ねこのアクション２';
    const sub = document.createElement('div');
    sub.className = 'stage-select-sub';
    sub.textContent = 'ステージを選ぶ';
    el.append(title, sub);

    const list = document.createElement('div');
    list.className = 'stage-select-list';
    for (const entry of entries) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'stage-select-item';
      button.disabled = !entry.stage;

      const name = document.createElement('span');
      name.className = 'stage-select-name';
      name.textContent = entry.label;
      if (entry.stage && isCleared(entry.id)) {
        const done = document.createElement('span');
        done.className = 'stage-select-done';
        done.textContent = 'クリア済み';
        name.appendChild(done);
      }
      const note = document.createElement('span');
      note.className = 'stage-select-note';
      note.textContent = entry.note;
      button.append(name, note);

      if (entry.stage) {
        button.addEventListener('click', () => {
          el.remove();
          resolve(entry.stage!);
        });
      }
      list.appendChild(button);
    }
    el.appendChild(list);

    const help = document.createElement('div');
    help.className = 'stage-select-help';
    help.textContent = '猫はふだん走っています。細い枝や梁の上では歩いてください。　'
      + 'PC：WASD 移動／マウス 視点／Space ジャンプ／左クリック・E 爪／Shift 歩く　'
      + 'スマホ：左で移動／右でスワイプ視点／右下のボタンでジャンプ・爪・歩く';
    el.appendChild(help);

    /**
     * 「ねこのアクション」のタイトル画面へ戻る。
     * この2本は同じシリーズで、入り口は向こうのタイトル画面にまとめてある。
     */
    const back = document.createElement('a');
    back.className = 'stage-select-back';
    back.href = TITLE_URL;
    back.textContent = '← タイトルへ（ねこのアクション）';
    el.appendChild(back);

    parent.appendChild(el);
  });
}
