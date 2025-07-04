import { createProxyMiddleware } from "http-proxy-middleware";

export default createProxyMiddleware({
  target: "http://auth-service:80", // Target the auth service directly for waitlist
  changeOrigin: true,
  timeout: 15000,
  proxyTimeout: 15000,
  pathRewrite: { 
    "^/api/waitlist": "/auth/waitlist"  // /api/waitlist/* -> /auth/waitlist/*
  },
  onProxyReq: (proxyReq, req, res) => {
    console.log(`📡 [WAITLIST-PROXY] ${req.method} ${req.url} -> auth-service:80${req.url}`);
  },
  onProxyRes: (proxyRes, req, res) => {
    console.log(`✅ [WAITLIST-PROXY] Response: ${proxyRes.statusCode} for ${req.method} ${req.url}`);
  },
  onError: (err, req, res) => {
    console.error(`🚨 [WAITLIST-PROXY] Error for ${req.method} ${req.url}:`, err.message);
    if (!res.headersSent) {
      res.status(504).json({ 
        error: 'Gateway timeout', 
        message: 'Waitlist service did not respond in time',
        details: err.message 
      });
    }
  }
});
