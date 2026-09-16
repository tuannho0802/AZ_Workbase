import '@testing-library/jest-dom/vitest';

// ⚠️ Polyfill `window.matchMedia` - jsdom KHÔNG cài sẵn hàm này, nhưng Ant
// Design (`useBreakpoint()` trong Grid, dùng ngầm bởi `Table`/`Row`/`Col`...)
// gọi thẳng `window.matchMedia()` ngay khi mount, ném
// "TypeError: window.matchMedia is not a function" và crash MỌI test render
// component có dùng antd. Polyfill tối giản (không cần logic responsive thật
// trong môi trường test) - mirror cách jsdom-testing-mocks/nwsapi thường làm.
if (typeof window !== 'undefined' && !window.matchMedia) {
    window.matchMedia = (query: string) => ({
        matches: false,
        media: query,
        onchange: null,
        addListener: () => { },
        removeListener: () => { },
        addEventListener: () => { },
        removeEventListener: () => { },
        dispatchEvent: () => false,
    }) as unknown as MediaQueryList;
}