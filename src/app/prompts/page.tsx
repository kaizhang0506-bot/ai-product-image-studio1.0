import type { Metadata } from 'next';
import PromptWorkbench from './workbench';

export const metadata: Metadata = {
  title: '指令工作台 · AI 产品图工作台',
  description: '在线编辑出图流水线各环节的 AI 指令，保存后下次调用即生效',
};

export default function PromptsPage() {
  return <PromptWorkbench />;
}
