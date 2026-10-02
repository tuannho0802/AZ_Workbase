'use client';

import { isValidElement, type ComponentProps, type ReactNode } from 'react';
import Link from 'next/link';
import ReactMarkdown, { type Components } from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Typography } from 'antd';
import { GuideDemoBlock } from '@/lib/guides/guide-demos';
import {
    DEMO_FENCE_LANG,
    isExternalUrl,
    parseDemoSpec,
    sanitizeImageUrl,
    sanitizeLinkUrl,
} from '@/lib/guides/guide-markdown';

const { Title, Paragraph } = Typography;

function textOf(node: ReactNode): string {
    if (typeof node === 'string') return node;
    if (Array.isArray(node)) return node.map(textOf).join('');
    if (isValidElement<{ children?: ReactNode }>(node)) return textOf(node.props.children);
    return '';
}

const components: Components = {
    h1: ({ children }) => <Title level={2}>{children}</Title>,
    h2: ({ children }) => <Title level={3}>{children}</Title>,
    h3: ({ children }) => <Title level={4}>{children}</Title>,
    h4: ({ children }) => <Title level={5}>{children}</Title>,
    p: ({ children }) => <Paragraph>{children}</Paragraph>,
    a: ({ href, children }) => {
        const safe = sanitizeLinkUrl(href);
        // URL không an toàn -> chỉ hiện chữ, không tạo liên kết.
        if (!safe) return <span>{children}</span>;
        if (isExternalUrl(safe)) {
            return (
                <a href={safe} target="_blank" rel="noopener noreferrer">
                    {children}
                </a>
            );
        }
        if (safe.startsWith('/')) return <Link href={safe}>{children}</Link>;
        return <a href={safe}>{children}</a>;
    },
    img: ({ src, alt }) => {
        const safe = sanitizeImageUrl(typeof src === 'string' ? src : '');
        if (!safe) return <span>{alt ? `[Ảnh không hợp lệ: ${alt}]` : '[Ảnh không hợp lệ]'}</span>;
        // eslint-disable-next-line @next/next/no-img-element
        return <img src={safe} alt={alt ?? ''} loading="lazy" referrerPolicy="no-referrer" style={{ maxWidth: '100%', height: 'auto', borderRadius: 6 }} />;
    },
    // Khối ```az-demo -> nhúng mẫu minh hoạ; các khối code khác giữ <pre> thường.
    pre: ({ children }) => {
        const child = Array.isArray(children) ? children[0] : children;
        if (isValidElement<ComponentProps<'code'>>(child) && child.props.className?.split(' ').includes(`language-${DEMO_FENCE_LANG}`)) {
            {
            const spec = parseDemoSpec(textOf(child.props.children));
            return <GuideDemoBlock id={spec.id} params={spec.params} invalid={spec.invalid} />;
        }
        }
        return (
            <pre style={{ background: '#f5f5f5', padding: 12, borderRadius: 6, overflowX: 'auto', fontSize: 13 }}>{children}</pre>
        );
    },
    code: ({ className, children }) => (
        <code className={className} style={className ? undefined : { background: '#f5f5f5', padding: '1px 5px', borderRadius: 4, fontSize: '0.9em' }}>
            {children}
        </code>
    ),
    blockquote: ({ children }) => (
        <blockquote style={{ margin: '12px 0', padding: '4px 14px', borderLeft: '4px solid #91caff', background: '#f0f7ff', color: '#434343' }}>
            {children}
        </blockquote>
    ),
    ul: ({ children }) => <ul style={{ paddingLeft: 24, margin: '8px 0', listStyle: 'disc' }}>{children}</ul>,
    ol: ({ children }) => <ol style={{ paddingLeft: 24, margin: '8px 0', listStyle: 'decimal' }}>{children}</ol>,
    table: ({ children }) => (
        <div style={{ overflowX: 'auto', margin: '12px 0' }}>
            <table style={{ borderCollapse: 'collapse', minWidth: '50%' }}>{children}</table>
        </div>
    ),
    th: ({ children }) => <th style={{ border: '1px solid #e8e8e8', padding: '6px 10px', background: '#fafafa', textAlign: 'left' }}>{children}</th>,
    td: ({ children }) => <td style={{ border: '1px solid #e8e8e8', padding: '6px 10px' }}>{children}</td>,
    hr: () => <hr style={{ border: 0, borderTop: '1px solid #e8e8e8', margin: '16px 0' }} />,
};

/**
 * Hiển thị Markdown của Hướng dẫn AN TOÀN: không bật HTML thô (không rehype-raw), lọc URL link/ảnh
 * (xem `lib/guides/guide-markdown.ts`), hỗ trợ bảng/checklist (GFM) và nhúng mẫu minh hoạ ```az-demo.
 * `urlTransform` của react-markdown để mặc định tắt (trả nguyên) vì ta lọc ở từng component `a`/`img` bằng
 * bộ lọc riêng chặt hơn mặc định.
 */
export function GuideMarkdown({ content }: { content: string }) {
    return (
        <div data-testid="guide-markdown" style={{ lineHeight: 1.7, wordBreak: 'break-word' }}>
            <ReactMarkdown remarkPlugins={[remarkGfm]} components={components} urlTransform={(url) => url}>
                {content}
            </ReactMarkdown>
        </div>
    );
}
