import * as core from '@actions/core';
import * as github from '@actions/github';
import { Client } from '@notionhq/client';
import { google } from 'googleapis';
import { JWT } from 'google-auth-library';

interface Task {
  id: string;
  title: string;
  url: string;
}

async function getGoogleAuthClient(): Promise<JWT> {
  try {
    const credentials = JSON.parse(
      core.getInput('google-credentials-json', { required: true })
    );

    const client = new JWT({
      email: credentials.client_email,
      key: credentials.private_key,
      scopes: ['https://www.googleapis.com/auth/spreadsheets'],
    });

    await client.authorize();

    console.log('Google認証に成功しました');

    return client;
  } catch (error) {
    throw new Error(`Google認証に失敗しました: ${error instanceof Error ? error.message : String(error)}`);
  }
}

async function appendToSpreadsheet(
  auth: JWT, 
  tasks: Task[],
  spreadsheetId: string,
  sheetName: string,
  version: string
): Promise<string> {
  try {
    const sheets = google.sheets({ version: 'v4', auth: auth as any });
    const today = new Date();
    const formattedDate = today.toISOString().split('T')[0];
    
    const values = tasks.map((task) => [
      formattedDate,
      version,
      task.title,
      task.url
    ]);

    await sheets.spreadsheets.values.append({
      spreadsheetId,
      range: `${sheetName}!A:D`,
      valueInputOption: 'USER_ENTERED',
      requestBody: {
        values,
      },
    });

    return `https://docs.google.com/spreadsheets/d/${spreadsheetId}`;
  } catch (error) {
    throw new Error(`スプレッドシートへの書き込みに失敗しました: ${error instanceof Error ? error.message : String(error)}`);
  }
}

async function createPullRequest(): Promise<void> {
  try {
    const token = core.getInput('github-token', { required: true });
    const octokit = github.getOctokit(token);
    const { owner, repo } = github.context.repo;
    const version = core.getInput('version', { required: true });
    const prTitle = `main→release(${version})`;
    const prBody = 'Automated PR from main to release branch';
    
    console.log('mainからreleaseブランチへのプルリクエストを作成します...');
    
    try {
      const { data: pullRequest } = await octokit.rest.pulls.create({
        owner,
        repo,
        title: prTitle,
        body: prBody,
        head: 'main',
        base: 'release'
      });
      
      console.log(`プルリクエストが作成されました: ${pullRequest.html_url}`);
      core.setOutput('pull-request-url', pullRequest.html_url);
      core.setOutput('pull-request-number', pullRequest.number);
    } catch (apiError) {
      console.error(`APIエラー詳細: ${apiError instanceof Error ? apiError.message : String(apiError)}`);
      console.error('注意: このエラーは権限の問題である可能性があります。パーソナルアクセストークン(PAT)をGITHUB_TOKENの代わりに使用してください。');
      throw new Error('Resource not accessible by integrationエラーの場合、リポジトリ設定で適切な権限を持つPATを設定してください。');
    }
    
    return;
  } catch (error) {
    if (error instanceof Error) {
      core.setFailed(`プルリクエスト作成に失敗しました: ${error.message}`);
    } else {
      core.setFailed('プルリクエスト作成中に不明なエラーが発生しました');
    }
    throw error;
  }
}

async function run(): Promise<void> {
  try {
    const notionApiKey = core.getInput('notion-api-key', { required: true });
    const databaseId = core.getInput('database-id', { required: true });
    const spreadsheetId = core.getInput('spreadsheet-id', { required: true });
    const version = core.getInput('version', { required: true });
    const sheetName = core.getInput('sheet-name') || 'リリース履歴';
    const createPr = true;
    
    const notion = new Client({
      auth: notionApiKey,
    });

    const today = new Date();
    const formattedDate = today.toISOString().split('T')[0];

    console.log(`${formattedDate} のリリース予定タスクを取得します`);

    const response = await notion.databases.query({
      database_id: databaseId,
      filter: {
        property: 'リリース日',
        date: {
          equals: formattedDate,
        },
      },
    });

    const tasks = response.results.map((page: any) => {
      const titleProperty = page.properties.Title || page.properties.Name;
      const title = titleProperty.title.map((t: any) => t.plain_text).join('');
      
      return {
        id: page.id,
        title: title,
        url: page.url,
      };
    });

    console.log(`${tasks.length} 件のタスクが見つかりました`);

    if (tasks.length > 0) {
      core.setOutput('task-count', tasks.length);
      core.setOutput('tasks', JSON.stringify(tasks));
      
      console.log('今日のリリース予定タスク:');
      tasks.forEach((task, index) => {
        console.log(`${index + 1}. ${task.title}`);
      });

      console.log(`リリースバージョン: ${version}`);

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
      
      if (createPr) {
        try {
          await createPullRequest();
        } catch (error) {
          console.error('プルリクエスト作成プロセスでエラーが発生しましたが、メインの処理は完了しています。');
        }
      }
    } else {
      console.log('今日リリースが予定されているタスクはありません。');
      
      if (createPr) {
        try {
          console.log('タスクがなくても指定された場合はプルリクエストを作成します...');
          await createPullRequest();
        } catch (error) {
          console.error('プルリクエスト作成プロセスでエラーが発生しました。');
        }
      }
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
