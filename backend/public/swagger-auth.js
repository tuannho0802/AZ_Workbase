// public/swagger-auth.js
(function() {
  function preauthorize() {
    const token = localStorage.getItem('accessToken');
    if (token && window.ui) {
      window.ui.preauthorizeApiKey('bearer', token);
      console.log('✅ Swagger pre-authorized with bearer token');
      return true;
    }
    return false;
  }

  // Thử ngay khi script chạy (có thể chưa có window.ui)
  if (!preauthorize()) {
    // Nếu chưa sẵn sàng, đợi Swagger UI khởi tạo bằng MutationObserver
    const observer = new MutationObserver(function(mutations) {
      if (window.ui) {
        if (preauthorize()) {
           observer.disconnect();
        }
      }
    });
    
    // Quan sát toàn bộ document để phát hiện khi Swagger UI render
    observer.observe(document.body, { childList: true, subtree: true });
    
    // Fallback: thử lại sau 2 giây nếu MutationObserver không kích hoạt
    setTimeout(function() {
      if (!window.ui) {
        console.warn('⚠️ window.ui still not available after 2s');
      } else {
        preauthorize();
      }
    }, 2000);
  }
})();
