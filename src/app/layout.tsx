import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: {
    default: 'AI 产品图工作台 | 主图 × 详情页批量出图',
    template: '%s | AI 产品图工作台',
  },
  description:
    '上传产品图与参考图，AI 解析风格氛围并策划出图方案，人工可控地批量生成电商主图（2000×2000）与详情页图（1940×1200），按 SKU_1 规范命名交付。',
  keywords: [
    'AI 产品图',
    '电商主图',
    '详情页设计',
    '批量出图',
    '产品摄影',
    'AI 海报',
  ],
  robots: { index: true, follow: true },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN">
      <body className={`antialiased`}>{children}</body>
    </html>
  );
}
