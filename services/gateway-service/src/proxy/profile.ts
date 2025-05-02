import { createProxyMiddleware } from "http-proxy-middleware";
export default createProxyMiddleware({
  target: "http://profile-service", changeOrigin: true, pathRewrite: { "^/profile": "" }
});
