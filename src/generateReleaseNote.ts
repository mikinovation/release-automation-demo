import * as core from '@actions/core';
import * as github from '@actions/github';
import { Client } from '@notionhq/client';

type Task = {
  id: string;
  title: string;
  url: string;
}

async function generateReleaseNotes(tasks: Task[], version: string): Promise<string> {
  const today = new Date();
  const formattedDate = today.toISOString().split('T')[0];
  
  let releaseNotes = `# Release ${version} (${formattedDate})\n\n`;
  
  if (tasks.length > 0) {
    releaseNotes += '## Changes\n\n';
    tasks.forEach(task => {
      releaseNotes += `- ${task.title} ([詳細](${task.url}))\n`;
    });
  } else {
    releaseNotes += '- メンテナンスリリース\n';
  }
  
  return releaseNotes;
}

async function createGitHubRelease(version: string, releaseNotes: string): Promise<string> {
  try {
    const token = core.getInput('github-token', { required: true });
    const octokit = github.getOctokit(token);
    const { owner, repo } = github.context.repo;
    
    console.log(`GitHubリリースを作成します: ${version}`);
    
    const { data: release } = await octokit.rest.repos.createRelease({
      owner,
      repo,
      tag_name: `v${version}`,
      name: `Release v${version}`,
      body: releaseNotes,
      draft: false,
      prerelease: false
    });
    
    console.log(`リリースが作成されました: ${release.html_url}`);
    core.setOutput('release-url', release.html_url);
    
    return release.html_url;
  } catch (error) {
    if (error instanceof Error) {
      throw new Error(`GitHubリリース作成に失敗しました: ${error.message}`);
    } else {
      throw new Error('GitHubリリース作成中に不明なエラーが発生しました');
    }
  }
}

export async function createReleaseNote(): Promise<void> {
  try {
    const notionApiKey = core.getInput('notion-api-key', { required: true });
    const databaseId = core.getInput('database-id', { required: true });
    const version = core.getInput('version', { required: true });
    
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
    core.setOutput('task-count', tasks.length);
    core.setOutput('tasks', JSON.stringify(tasks));

    const releaseNotes = await generateReleaseNotes(tasks, version);
    console.log('リリースノートを生成しました:');
    console.log(releaseNotes);
    
    const releaseUrl = await createGitHubRelease(version, releaseNotes);
    console.log(`GitHubリリースの作成が完了しました: ${releaseUrl}`);
    
  } catch (error) {
    if (error instanceof Error) {
      core.setFailed(error.message);
    } else {
      core.setFailed('不明なエラーが発生しました');
    }
  }
}
