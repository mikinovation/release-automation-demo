import * as core from '@actions/core';
import { recordTasksToSpreadsheet } from './spreadsheet';
import { createPullRequest, isReleaseContext, createReleaseNote } from './github';
import { getTodaysReleaseTasks } from './notion';

async function run(): Promise<void> {
  try {
    const spreadsheetId = core.getInput('spreadsheet-id', { required: true });
    const version = core.getInput('version', { required: true });
    const sheetName = core.getInput('sheet-name') || 'リリース履歴';
    const generateRelease = isReleaseContext();
    
    const tasks = await getTodaysReleaseTasks();

    if (tasks.length > 0) {
      console.log(`リリースバージョン: ${version}`);

      const spreadsheetUrl = await recordTasksToSpreadsheet(
        tasks,
        spreadsheetId,
        sheetName,
        version
      );
      
      core.setOutput('spreadsheet-url', spreadsheetUrl);
      
      // リリースノートの生成（releaseブランチへのマージ時）
      if (generateRelease) {
        console.log('releaseブランチへのマージを検出しました。リリースノートを生成します...');
        try {
          await createReleaseNote();
        } catch (error) {
          console.error('リリースノート生成プロセスでエラーが発生しました。');
          if (error instanceof Error) {
            core.setFailed(error.message);
          } else {
            core.setFailed('リリースノート生成中に不明なエラーが発生しました');
          }
        }
      // リリースPRの作成
      } else {
        try {
          await createPullRequest(version);
        } catch (error) {
          console.error('プルリクエスト作成プロセスでエラーが発生しましたが、メインの処理は完了しています。');
        }
      }
    } else {
      console.error('今日リリースが予定されているタスクはありません。');
      throw new Error('リリース予定のタスクが見つかりませんでした。');
    }
  } catch (error) {
    if (error instanceof Error) {
      core.setFailed(error.message);
    } else {
      core.setFailed('不明なエラーが発生しました');
    }
  }
}

run();
