import * as core from '@actions/core';
import { getGoogleAuthClient, appendToSpreadsheet, Task } from './googleAuth';

export async function recordTasksToSpreadsheet(
  tasks: Task[],
  spreadsheetId: string,
  sheetName: string,
  version: string
): Promise<string> {
  try {
    console.log('Google Sheetsにリリース情報を記録します...');
    const authClient = await getGoogleAuthClient();
    
    const spreadsheetUrl = await appendToSpreadsheet(
      authClient,
      tasks,
      spreadsheetId,
      sheetName,
      version
    );

    console.log(`スプレッドシートの更新が完了しました: ${spreadsheetUrl}`);
    core.setOutput('spreadsheet-url', spreadsheetUrl);
    
    return spreadsheetUrl;
  } catch (error) {
    throw new Error(`スプレッドシートへの記録に失敗しました: ${error instanceof Error ? error.message : String(error)}`);
  }
}