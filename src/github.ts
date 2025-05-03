import * as core from '@actions/core';
import * as github from '@actions/github';
import { Task } from './googleAuth';
import { getTodaysReleaseTasks } from './notion';
import { updatePackageVersion } from './updatePackageVersion';

export async function createPullRequest(version: string): Promise<void> {
  try {
    const token = core.getInput('github-token', { required: true });
    const octokit = github.getOctokit(token);
    const { owner, repo } = github.context.repo;
    const branchName = `release-${version}`;
    const prTitle = `main→release(${version})`;
    const prBody = 'Automated PR from main to release branch';
    
    console.log(`新しいブランチ ${branchName} を作成します...`);
    
    try {
      // mainブランチのリファレンスを取得
      const { data: mainRef } = await octokit.rest.git.getRef({
        owner,
        repo,
        ref: 'heads/main'
      });
      
      // 新しいブランチを作成
      try {
        await octokit.rest.git.createRef({
          owner,
          repo,
          ref: `refs/heads/${branchName}`,
          sha: mainRef.object.sha
        });
        console.log(`ブランチ ${branchName} を作成しました`);
      } catch (branchError) {
        if (branchError instanceof Error && branchError.message.includes('Reference already exists')) {
          console.log(`ブランチ ${branchName} はすでに存在しています`);
        } else {
          throw branchError;
        }
      }
      
      // package.jsonのバージョンを更新
      await updatePackageVersion(version);
      
      // 変更をコミット
      const packageJsonFile = 'package.json';
      
      // ファイルの現在の内容を取得
      const { data: fileData } = await octokit.rest.repos.getContent({
        owner,
        repo,
        path: packageJsonFile,
        ref: `refs/heads/${branchName}`
      });
      
      if ('content' in fileData && 'sha' in fileData) {
        // バージョンを更新したpackage.jsonをコミット
        await octokit.rest.repos.createOrUpdateFileContents({
          owner,
          repo,
          path: packageJsonFile,
          message: `バージョンを ${version} に更新`,
          content: Buffer.from(JSON.stringify(JSON.parse(require('fs').readFileSync(packageJsonFile, 'utf8')), null, 2)).toString('base64'),
          sha: fileData.sha,
          branch: branchName
        });
        
        console.log(`package.jsonのバージョンを ${version} に更新しました`);
      }
      
      // PRを作成
      const { data: pullRequest } = await octokit.rest.pulls.create({
        owner,
        repo,
        title: prTitle,
        body: prBody,
        head: branchName,
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

export function isReleaseContext(): boolean {
  console.log(`GitHub Context: ${github.context.ref}`);
  return github.context.ref === 'refs/heads/release';
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
    const version = core.getInput('version', { required: true });
    
    const tasks = await getTodaysReleaseTasks();

    console.log(`${tasks.length} 件のタスクが見つかりました`);
    
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
    throw error;
  }
}
