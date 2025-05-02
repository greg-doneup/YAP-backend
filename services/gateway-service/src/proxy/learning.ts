import { createProxyMiddleware } from "http-proxy-middleware";
export default createProxyMiddleware({
  target: "http://learning-service", changeOrigin: true, pathRewrite: { "^/learning": "" }
});
