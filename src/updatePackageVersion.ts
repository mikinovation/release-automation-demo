import * as fs from 'fs';
import * as path from 'path';
import * as core from '@actions/core';

export async function updatePackageVersion(newVersion: string): Promise<void> {
  try {
    const packageJsonPath = path.resolve(process.cwd(), 'package.json');
    
    if (!fs.existsSync(packageJsonPath)) {
      throw new Error('package.json not found');
    }
    
    const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
    const currentVersion = packageJson.version;
    
    if (!currentVersion) {
      throw new Error('Version not found in package.json');
    }
    
    // バージョンを更新
    packageJson.version = newVersion;
    
    // 整形されたJSONとして書き戻す
    fs.writeFileSync(packageJsonPath, JSON.stringify(packageJson, null, 2) + '\n', 'utf8');
    
    console.log(`パッケージバージョンを ${currentVersion} から ${newVersion} に更新しました`);
    core.setOutput('old-version', currentVersion);
    core.setOutput('new-version', newVersion);
  } catch (error) {
    if (error instanceof Error) {
      throw new Error(`バージョン更新に失敗しました: ${error.message}`);
    } else {
      throw new Error('バージョン更新中に不明なエラーが発生しました');
    }
  }
}