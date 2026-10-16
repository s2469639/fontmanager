import { useStore } from './store';
import { downloadBlob } from '../core/export';
import { MAX_PROJECT_BYTES, ProjectError, parseProject, restoreArt, serializeProject } from '../core/project';

/** 현재 작업을 .json 파일로 내려받습니다. */
export async function saveProjectFile(includeArt: boolean): Promise<void> {
  const s = useStore.getState();
  const json = await serializeProject(
    { text: s.text, params: s.params, baseline: s.baseline, baselineLabel: s.baselineLabel, bg: s.bg, art: s.art },
    includeArt,
  );
  const name = (s.text || 'wordmark').replace(/\s+/g, '-');
  downloadBlob(new Blob([json], { type: 'application/json' }), `${name}.hangulformlab.json`);
}

/** 작업 파일을 열어 현재 상태를 바꿉니다. 일부 그림을 못 읽으면 건너뛴 개수를 돌려줍니다. */
export async function openProjectFile(file: File): Promise<{ skippedArt: number }> {
  if (file.size > MAX_PROJECT_BYTES) throw new ProjectError('파일이 너무 커요. (60MB 이하만 열 수 있어요)');
  const parsed = parseProject(await file.text());
  const { layers, skipped } = await restoreArt(parsed.art);
  useStore.getState().loadProject(parsed, layers);
  return { skippedArt: skipped };
}
