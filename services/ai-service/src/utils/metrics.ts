import { register, collectDefaultMetrics, Counter, Histogram, Gauge } from 'prom-client';

// Collect default metrics
collectDefaultMetrics();

// Custom metrics for AI service
export const createPrometheusMetrics = () => {
  const httpRequestsTotal = new Counter({
    name: 'ai_service_http_requests_total',
    help: 'Total number of HTTP requests',
    labelNames: ['method', 'route', 'status']
  });

  const httpRequestDuration = new Histogram({
    name: 'ai_service_http_request_duration_seconds',
    help: 'Duration of HTTP requests in seconds',
    labelNames: ['method', 'route', 'status'],
    buckets: [0.1, 0.5, 1, 2, 5, 10]
  });

  const aiRequestsTotal = new Counter({
    name: 'ai_service_ai_requests_total',
    help: 'Total number of AI model requests',
    labelNames: ['model', 'provider', 'status']
  });

  const aiRequestDuration = new Histogram({
    name: 'ai_service_ai_request_duration_seconds',
    help: 'Duration of AI model requests in seconds',
    labelNames: ['model', 'provider'],
    buckets: [0.5, 1, 2, 5, 10, 30, 60]
  });

  const tokenConsumption = new Counter({
    name: 'ai_service_token_consumption_total',
    help: 'Total tokens consumed by AI requests',
    labelNames: ['model', 'provider', 'type']
  });

  const activeConnections = new Gauge({
    name: 'ai_service_active_connections',
    help: 'Number of active connections'
  });

  const errorCount = new Counter({
    name: 'ai_service_errors_total',
    help: 'Total number of errors',
    labelNames: ['type', 'route']
  });

  const conversationCount = new Gauge({
    name: 'ai_service_active_conversations',
    help: 'Number of active conversations'
  });

  const userTokenBalance = new Gauge({
    name: 'ai_service_user_token_balance',
    help: 'Current user token balance',
    labelNames: ['user_id']
  });

  return {
    register,
    httpRequestsTotal,
    httpRequestDuration,
    aiRequestsTotal,
    aiRequestDuration,
    tokenConsumption,
    activeConnections,
    errorCount,
    conversationCount,
    userTokenBalance
  };
};
