import { NextRequest, NextResponse } from 'next/server';
import { HeaderUtils } from 'coze-coding-dev-sdk';
import { uploadBufferToStorage } from '@/lib/studio-server';
import { QUOTA_CLOSED_MESSAGE, readQuota } from '@/lib/quota-server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const MAX_FILE_SIZE = 15 * 1024 * 1024; // 15MB

interface UploadedFileResult {
  key: string;
  url: string;
  name: string;
}

/** 素材上传：产品图 / 背景参考 / 排版参考 / 品牌 logo → 对象存储 */
export async function POST(request: NextRequest) {
  try {
    // 测试版限量：系统关闭后停止上传
    const quotaState = await readQuota();
    if (quotaState.closed) {
      return NextResponse.json({ error: QUOTA_CLOSED_MESSAGE }, { status: 403 });
    }
    const form = await request.formData();
    const rawFiles = form.getAll('files');
    const files = rawFiles.filter((f): f is File => f instanceof File);

    if (files.length === 0) {
      return NextResponse.json({ error: '未收到有效文件' }, { status: 400 });
    }

    const results: UploadedFileResult[] = [];
    for (const file of files) {
      if (!file.type.startsWith('image/')) continue;
      if (file.size > MAX_FILE_SIZE) continue;
      const buffer = Buffer.from(await file.arrayBuffer());
      const safeName =
        file.name.replace(/[^A-Za-z0-9._-]+/g, '_').slice(0, 80) || 'image';
      const { key, url } = await uploadBufferToStorage(
        buffer,
        `uploads/${Date.now()}_${Math.floor(Math.random() * 1e6)}_${safeName}`,
        file.type || 'image/jpeg',
      );
      results.push({ key, url, name: file.name });
    }

    if (results.length === 0) {
      return NextResponse.json(
        { error: '没有可上传的图片文件（仅支持 15MB 内的图片）' },
        { status: 400 },
      );
    }

    return NextResponse.json({ files: results });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json(
      { error: `上传失败: ${message}` },
      { status: 500 },
    );
  }
}
