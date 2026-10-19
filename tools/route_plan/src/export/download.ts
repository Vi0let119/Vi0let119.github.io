/** 文件下载与剪贴板 */

export function downloadText(filename: string, text: string, mime = 'text/plain;charset=utf-8'): void {
  const blob = new Blob([text], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

export function safeFileName(s: string): string {
  const cleaned = s.replace(/[\\/:*?"<>|\s]+/g, '_').replace(/^_+|_+$/g, '');
  return (cleaned || '计划').slice(0, 40);
}
