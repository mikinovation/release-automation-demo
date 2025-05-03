import * as core from '@actions/core';
import { google } from 'googleapis';
import { JWT } from 'google-auth-library';

export type Task = {
  id: string;
  title: string;
  url: string;
}

export async function getGoogleAuthClient(): Promise<JWT> {
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

export async function appendToSpreadsheet(
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
