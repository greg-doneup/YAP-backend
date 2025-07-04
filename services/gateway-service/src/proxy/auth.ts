import { createProxyMiddleware } from "http-proxy-middleware";

export default createProxyMiddleware({
  target: "http://auth-service:80",
  changeOrigin: true, 
  timeout: 15000,
  proxyTimeout: 15000,
  pathRewrite: { 
    "^/auth": ""  // /auth/* -> /* (remove /auth prefix)
  },
  onError: (err, req, res) => {
    console.error('🚨 Auth proxy error:', {
      error: err.message,
      code: (err as any).code,
      url: req.url,
      method: req.method
    });
    if (!res.headersSent) {
      res.status(504).json({ 
        error: 'Gateway timeout', 
        message: 'Auth service did not respond in time',
        details: err.message 
      });
    }
  },
  onProxyReq: (proxyReq, req, res) => {
    console.log(`📡 Proxying auth ${req.method} ${req.url} to auth-service:80`);
  },
  onProxyRes: (proxyRes, req, res) => {
    console.log(`✅ Auth service responded: ${proxyRes.statusCode} for ${req.method} ${req.url}`);
  }
});
