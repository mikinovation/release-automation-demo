import * as core from '@actions/core';
import { Client } from '@notionhq/client';
import { Task } from './googleAuth';

export async function getTodaysReleaseTasks(): Promise<Task[]> {
  try {
    const notionApiKey = core.getInput('notion-api-key', { required: true });
    const databaseId = core.getInput('database-id', { required: true });
    
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
    } else {
      console.log('今日リリースが予定されているタスクはありません。');
    }

    return tasks;
  } catch (error) {
    throw new Error(`Notionからのタスク取得に失敗しました: ${error instanceof Error ? error.message : String(error)}`);
  }
}