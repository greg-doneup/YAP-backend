import { createProxyMiddleware } from "http-proxy-middleware";
export default createProxyMiddleware({
  target: "http://auth-service", changeOrigin: true, pathRewrite: { "^/auth": "" }
});
