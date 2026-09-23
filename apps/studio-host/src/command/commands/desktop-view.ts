// HOP 데스크톱 전용 보기 명령. upstream view 명령군을 대체하지 않고 뒤에 덧붙임.

import type { CommandDef } from '@/upstream/commands';
import { TOGGLE_TOOLBAR_LABELS_COMMAND, toggleToolbarLabels } from '@/core/toolbar-labels';

export const desktopViewCommands: CommandDef[] = [
  {
    id: TOGGLE_TOOLBAR_LABELS_COMMAND,
    label: '도구 상자 라벨',
    execute() {
      toggleToolbarLabels(document);
    },
  },
];
