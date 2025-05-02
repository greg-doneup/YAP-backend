import { createProxyMiddleware } from "http-proxy-middleware";
export default createProxyMiddleware({
  target: "http://reward-service", changeOrigin: true, pathRewrite: { "^/reward": "" },
  logLevel: "debug"
});
