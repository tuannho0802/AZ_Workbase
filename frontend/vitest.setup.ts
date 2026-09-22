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

// ⚠️ Polyfill `ResizeObserver` - jsdom KHÔNG cài sẵn, nhưng bất kỳ overlay nào
// của Ant Design canh vị trí theo kích thước phần tử neo (Popover/Popconfirm/
// Tooltip khi thực sự mở, Select dropdown...) đều dùng `@rc-component/resize-
// observer` ngầm bên trong, ném "ResizeObserver is not defined" và crash test
// ngay khi overlay đó mount - không riêng gì component gọi trực tiếp.
if (typeof window !== 'undefined' && !window.ResizeObserver) {
    class ResizeObserverPolyfill {
        observe() { }
        unobserve() { }
        disconnect() { }
    }
    window.ResizeObserver = ResizeObserverPolyfill as unknown as typeof ResizeObserver;
}