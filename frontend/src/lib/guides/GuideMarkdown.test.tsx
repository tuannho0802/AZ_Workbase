import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { GuideMarkdown } from './GuideMarkdown';
import { GUIDE_DEMOS } from './guide-demos';

describe('GuideMarkdown (an toàn XSS)', () => {
  it('không render HTML thô: <script>/<img onerror> hiện thành chữ, không tạo phần tử', () => {
    const { container } = render(<GuideMarkdown content={'<script>window.__x=1</script>\n\n<img src=x onerror="window.__x=1">'} />);
    expect(container.querySelector('script')).toBeNull();
    expect(container.querySelector('img')).toBeNull();
    expect((window as unknown as { __x?: number }).__x).toBeUndefined();
  });

  it('link javascript: bị bỏ href, link https mở tab mới an toàn', () => {
    render(<GuideMarkdown content={'[bad](javascript:alert(1)) và [ok](https://example.com)'} />);
    expect(screen.queryByRole('link', { name: 'bad' })).toBeNull();
    const ok = screen.getByRole('link', { name: 'ok' });
    expect(ok).toHaveAttribute('href', 'https://example.com');
    expect(ok).toHaveAttribute('target', '_blank');
    expect(ok.getAttribute('rel')).toContain('noopener');
  });

  it('ảnh data:/http bị chặn, ảnh https được render', () => {
    const { container } = render(
      <GuideMarkdown content={'![a](data:image/png;base64,AAAA) ![b](http://x.com/b.png) ![c](https://x.com/c.png)'} />,
    );
    const imgs = container.querySelectorAll('img');
    expect(imgs).toHaveLength(1);
    expect(imgs[0].getAttribute('src')).toBe('https://x.com/c.png');
  });

  it('khối ```az-demo nhúng mẫu thật; id lạ hiện cảnh báo, không throw', () => {
    render(<GuideMarkdown content={'```az-demo\nstatus-tags\n```\n\n```az-demo\nkhong-ton-tai\n```'} />);
    expect(screen.getAllByTestId('guide-demo')).toHaveLength(1);
    expect(screen.getByText(/Không có mẫu minh hoạ/)).toBeInTheDocument();
  });

  it('khối code thường không bị coi là mẫu', () => {
    render(<GuideMarkdown content={'```js\nconst a = 1;\n```'} />);
    expect(screen.queryByTestId('guide-demo')).toBeNull();
    expect(screen.getByText('const a = 1;')).toBeInTheDocument();
  });
});

describe('GUIDE_DEMOS registry', () => {
  it('id hợp lệ, không trùng', () => {
    const ids = GUIDE_DEMOS.map((d) => d.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ids) expect(id).toMatch(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);
  });
});
